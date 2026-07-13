import { useState, useCallback, useRef } from "react";
import { Alert } from "react-native";
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

  const isStreaming = messages.some((m) => m.status === "streaming");

  return {
    messages,
    sendMessage,
    retryMessage,
    retryingMessageId,
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
