import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { Alert, AppState } from "react-native";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { generateId } from "@/lib/id";
import { useAchievementEventsStore } from "@/stores/achievement-events-store";

export function useChatConversations() {
  return useQuery(api.chat.listConversations) ?? [];
}

export function useChatMessages(conversationClientId: string) {
  return useQuery(api.chat.listMessages, { conversationClientId }) ?? [];
}

// A live generation bumps the message's liveness timestamp at least every
// ~5s (server heartbeat). If nothing has moved for this long, the generating
// action is gone (crashed hard, hit the runtime limit, or was interrupted by
// a deploy) and the message will never leave "streaming" on its own — treat
// it as incomplete so the user gets a retry instead of eternal dots and a
// locked input (issue #129). Keep this above the server-side retry window
// (45s in convex/chat.ts) so any message the UI flags is already retryable.
const STALE_STREAM_MS = 60_000;

export function useChat(conversationClientId: string) {
  const messages = useChatMessages(conversationClientId);
  const sendMessageAction = useAction(api.chatActions.sendMessage);
  const retryGenerationAction = useAction(api.chatActions.retryGeneration);
  const [isSending, setIsSending] = useState(false);
  const [retryingMessageId, setRetryingMessageId] =
    useState<Id<"chatMessages"> | null>(null);
  const isSendingRef = useRef(false);

  const sendMessage = useCallback(
    async (content: string) => {
      if (!content.trim() || isSendingRef.current) return;
      isSendingRef.current = true;
      setIsSending(true);
      try {
        await sendMessageAction({
          conversationClientId,
          content: content.trim(),
        });
        // Achievement: First Words (messaged the AI coach).
        useAchievementEventsStore.getState().mark("chatMessageSent");
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes("Subscription required")) {
          Alert.alert(
            "Pro Required",
            "AI Coach is a Pro feature. Please upgrade to continue."
          );
        }
        // Other errors are handled gracefully in-chat via the error message status
      } finally {
        isSendingRef.current = false;
        setIsSending(false);
      }
    },
    [conversationClientId, sendMessageAction]
  );

  // Re-run a failed/truncated assistant turn in place (issue #128). The
  // server resets the message to a streaming placeholder, so progress and
  // the final result land back in the same bubble.
  const retryMessage = useCallback(
    async (messageId: Id<"chatMessages">) => {
      if (isSendingRef.current) return;
      isSendingRef.current = true;
      setRetryingMessageId(messageId);
      try {
        await retryGenerationAction({ conversationClientId, messageId });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes("Subscription required")) {
          Alert.alert(
            "Pro Required",
            "AI Coach is a Pro feature. Please upgrade to continue."
          );
        }
        // Other errors are handled gracefully in-chat via the error message status
      } finally {
        isSendingRef.current = false;
        setRetryingMessageId(null);
      }
    },
    [conversationClientId, retryGenerationAction]
  );

  // Staleness reconciliation (issue #129). Generation is fully server-driven
  // once the action starts, and Convex re-syncs queries automatically on
  // reconnect — so returning to the app normally just shows the finished
  // message. The one gap is an action that died mid-generation: its message
  // stays "streaming" forever. Re-evaluate liveness periodically and
  // immediately on re-foreground so such messages degrade to a retry
  // affordance instead of spinning forever.
  const hasStreaming = messages.some((m) => m.status === "streaming");
  const [nowTs, setNowTs] = useState(() => Date.now());

  useEffect(() => {
    if (!hasStreaming) return;
    setNowTs(Date.now());
    const timer = setInterval(() => setNowTs(Date.now()), 10_000);
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") setNowTs(Date.now());
    });
    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, [hasStreaming]);

  const staleMessageIds = useMemo(() => {
    const ids = new Set<string>();
    for (const m of messages) {
      if (m.status !== "streaming") continue;
      const lastActivity = m.progressUpdatedAt ?? Date.parse(m.createdAt);
      if (nowTs - lastActivity > STALE_STREAM_MS) ids.add(m._id);
    }
    return ids;
  }, [messages, nowTs]);

  const isStreaming = messages.some(
    (m) => m.status === "streaming" && !staleMessageIds.has(m._id)
  );

  return {
    messages,
    sendMessage,
    retryMessage,
    retryingMessageId,
    staleMessageIds,
    isSending,
    isStreaming,
  };
}

export function useCreateConversation() {
  const createConversation = useMutation(api.chat.createConversation);

  return useCallback(async () => {
    const clientId = generateId();
    await createConversation({
      clientId,
      title: "New Chat",
    });
    return clientId;
  }, [createConversation]);
}

export function useDeleteConversation() {
  return useMutation(api.chat.deleteConversation);
}
