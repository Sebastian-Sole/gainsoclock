import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import {
  exerciseTypeValidator,
  loadModeValidator,
  metricIdValidator,
} from "./validators";

// Returns ALL exercises, including archived ones. The sole consumer is the
// sync provider (providers/convex-sync-provider.tsx), which hydrates the
// client library store and treats any exercise embedded in local
// templates/logs but missing from this list as "new" and re-upserts it —
// filtering archived rows here would resurrect them. Pickers hide archived
// exercises client-side via `archivedAt`.
export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    return await ctx.db
      .query("exercises")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
  },
});

export const create = mutation({
  args: {
    clientId: v.string(),
    name: v.string(),
    type: exerciseTypeValidator,
    metrics: v.optional(v.array(metricIdValidator)),
    // Absent = "total" (legacy convention; see lib/load-mode.ts).
    loadMode: v.optional(loadModeValidator),
    createdAt: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    // Dedup by clientId
    const existingById = await ctx.db
      .query("exercises")
      .withIndex("by_user_clientId", (q) =>
        q.eq("userId", userId).eq("clientId", args.clientId)
      )
      .unique();
    if (existingById) return existingById._id;

    return await ctx.db.insert("exercises", { userId, ...args });
  },
});

// Update a definition's tracked metrics and/or weight load mode (#142/#145).
// Editing applies to the library definition (all future uses) plus whatever
// row the caller is configuring — past logs keep their denormalized
// snapshots. Missing rows are a silent no-op for the same dead-letter
// reason as `archive` below.
export const update = mutation({
  args: {
    clientId: v.string(),
    metrics: v.optional(v.array(metricIdValidator)),
    // Present = set explicitly; "total" is stored as-is (the absent="total"
    // legacy convention only applies to rows that predate loadMode).
    loadMode: v.optional(loadModeValidator),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const existing = await ctx.db
      .query("exercises")
      .withIndex("by_user_clientId", (q) =>
        q.eq("userId", userId).eq("clientId", args.clientId)
      )
      .unique();
    if (!existing) return null;

    await ctx.db.patch(existing._id, {
      ...(args.metrics !== undefined && { metrics: args.metrics }),
      ...(args.loadMode !== undefined && { loadMode: args.loadMode }),
    });
    return null;
  },
});

// Soft-delete: mark an exercise archived. Templates, plans, workout logs and
// stats reference exercises by clientId with denormalized name/type, so an
// archived exercise keeps working everywhere it's already used — it's only
// hidden from the library's default view and from exercise pickers.
// `archivedAt` comes from the client so an archive queued offline keeps the
// moment the user actually performed it. Missing rows are a silent no-op:
// the offline queue replays in order, but a dead-lettered create must not
// wedge the archive behind it forever.
export const archive = mutation({
  args: {
    clientId: v.string(),
    archivedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const existing = await ctx.db
      .query("exercises")
      .withIndex("by_user_clientId", (q) =>
        q.eq("userId", userId).eq("clientId", args.clientId)
      )
      .unique();
    if (!existing) return null;

    await ctx.db.patch(existing._id, { archivedAt: args.archivedAt });
    return null;
  },
});

export const unarchive = mutation({
  args: {
    clientId: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const existing = await ctx.db
      .query("exercises")
      .withIndex("by_user_clientId", (q) =>
        q.eq("userId", userId).eq("clientId", args.clientId)
      )
      .unique();
    if (!existing) return null;

    await ctx.db.patch(existing._id, { archivedAt: undefined });
    return null;
  },
});

export const bulkUpsert = mutation({
  args: {
    exercises: v.array(
      v.object({
        clientId: v.string(),
        name: v.string(),
        type: exerciseTypeValidator,
        metrics: v.optional(v.array(metricIdValidator)),
        loadMode: v.optional(loadModeValidator),
        createdAt: v.string(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const allExisting = await ctx.db
      .query("exercises")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const existingClientIds = new Set(allExisting.map((e) => e.clientId));

    for (const exercise of args.exercises) {
      if (!existingClientIds.has(exercise.clientId)) {
        await ctx.db.insert("exercises", { userId, ...exercise });
      }
    }
  },
});
