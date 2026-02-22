import { query, mutation, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import {
  chatMessageRoleValidator,
  chatMessageStatusValidator,
  pendingApprovalValidator,
  toolCallValidator,
} from "./validators";

// ── Conversations ──────────────────────────────────────────────

export const listConversations = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    const conversations = await ctx.db
      .query("chatConversations")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    // Sort by most recent first
    conversations.sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );

    return conversations;
  },
});

export const createConversation = mutation({
  args: {
    clientId: v.string(),
    title: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    // Dedup by clientId
    const existing = await ctx.db
      .query("chatConversations")
      .withIndex("by_user_clientId", (q) =>
        q.eq("userId", userId).eq("clientId", args.clientId)
      )
      .unique();
    if (existing) return existing._id;

    const now = new Date().toISOString();
    return await ctx.db.insert("chatConversations", {
      userId,
      clientId: args.clientId,
      title: args.title,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const deleteConversation = mutation({
  args: { clientId: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const conversation = await ctx.db
      .query("chatConversations")
      .withIndex("by_user_clientId", (q) =>
        q.eq("userId", userId).eq("clientId", args.clientId)
      )
      .unique();

    if (!conversation) return;

    // Delete all messages in this conversation
    const messages = await ctx.db
      .query("chatMessages")
      .withIndex("by_conversation", (q) =>
        q.eq("userId", userId).eq("conversationClientId", args.clientId)
      )
      .collect();

    for (const msg of messages) {
      await ctx.db.delete(msg._id);
    }

    await ctx.db.delete(conversation._id);
  },
});

// ── Messages ───────────────────────────────────────────────────

export const listMessages = query({
  args: { conversationClientId: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    const messages = await ctx.db
      .query("chatMessages")
      .withIndex("by_conversation", (q) =>
        q
          .eq("userId", userId)
          .eq("conversationClientId", args.conversationClientId)
      )
      .collect();

    // Sort by creation time
    messages.sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );

    return messages;
  },
});

// Internal mutations used by the chat action for streaming updates
export const insertMessage = internalMutation({
  args: {
    userId: v.id("users"),
    conversationClientId: v.string(),
    role: chatMessageRoleValidator,
    content: v.string(),
    status: chatMessageStatusValidator,
    toolCalls: v.optional(v.array(toolCallValidator)),
    pendingApproval: v.optional(pendingApprovalValidator),
  },
  handler: async (ctx, args) => {
    const now = new Date().toISOString();

    const messageId = await ctx.db.insert("chatMessages", {
      userId: args.userId,
      conversationClientId: args.conversationClientId,
      role: args.role,
      content: args.content,
      status: args.status,
      toolCalls: args.toolCalls,
      pendingApproval: args.pendingApproval,
      createdAt: now,
    });

    // Update conversation timestamp
    const conversation = await ctx.db
      .query("chatConversations")
      .withIndex("by_user_clientId", (q) =>
        q
          .eq("userId", args.userId)
          .eq("clientId", args.conversationClientId)
      )
      .unique();
    if (conversation) {
      await ctx.db.patch(conversation._id, { updatedAt: now });
    }

    return messageId;
  },
});

export const updateMessageContent = internalMutation({
  args: {
    messageId: v.id("chatMessages"),
    content: v.string(),
    status: v.optional(chatMessageStatusValidator),
  },
  handler: async (ctx, args) => {
    const updates: Record<string, unknown> = { content: args.content };
    if (args.status) updates.status = args.status;
    await ctx.db.patch(args.messageId, updates);
  },
});

export const updateMessageWithToolCalls = internalMutation({
  args: {
    messageId: v.id("chatMessages"),
    content: v.string(),
    toolCalls: v.array(toolCallValidator),
    pendingApproval: v.optional(pendingApprovalValidator),
    status: chatMessageStatusValidator,
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.messageId, {
      content: args.content,
      toolCalls: args.toolCalls,
      pendingApproval: args.pendingApproval,
      status: args.status,
    });
  },
});

export const updateConversationTitle = internalMutation({
  args: {
    userId: v.id("users"),
    conversationClientId: v.string(),
    title: v.string(),
  },
  handler: async (ctx, args) => {
    const conversation = await ctx.db
      .query("chatConversations")
      .withIndex("by_user_clientId", (q) =>
        q
          .eq("userId", args.userId)
          .eq("clientId", args.conversationClientId)
      )
      .unique();
    if (conversation) {
      await ctx.db.patch(conversation._id, { title: args.title });
    }
  },
});

// ── Approval Flow ──────────────────────────────────────────────

export const approveAction = mutation({
  args: { messageId: v.id("chatMessages") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const message = await ctx.db.get(args.messageId);
    if (!message || message.userId !== userId) {
      throw new Error("Message not found");
    }
    if (!message.pendingApproval || message.pendingApproval.status !== "pending") {
      throw new Error("No pending approval on this message");
    }

    // Mark as approved — actual data creation is handled by aiTools
    await ctx.db.patch(args.messageId, {
      pendingApproval: {
        ...message.pendingApproval,
        status: "approved" as const,
      },
    });

    return message.pendingApproval;
  },
});

export const rejectAction = mutation({
  args: { messageId: v.id("chatMessages") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const message = await ctx.db.get(args.messageId);
    if (!message || message.userId !== userId) {
      throw new Error("Message not found");
    }
    if (!message.pendingApproval) {
      throw new Error("No pending approval on this message");
    }

    await ctx.db.patch(args.messageId, {
      pendingApproval: {
        ...message.pendingApproval,
        status: "rejected" as const,
      },
    });
  },
});

// Internal query used by the chat action to load conversation history
export const getHistory = internalMutation({
  args: {
    userId: v.id("users"),
    conversationClientId: v.string(),
  },
  handler: async (ctx, args) => {
    const messages = await ctx.db
      .query("chatMessages")
      .withIndex("by_conversation", (q) =>
        q
          .eq("userId", args.userId)
          .eq("conversationClientId", args.conversationClientId)
      )
      .collect();

    messages.sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );

    return messages;
  },
});
