import { useState, useCallback } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { generateId } from "@/lib/id";

export function useChatConversations() {
  return useQuery(api.chat.listConversations) ?? [];
}

export function useChatMessages(conversationClientId: string) {
  return useQuery(api.chat.listMessages, { conversationClientId }) ?? [];
}

export function useChat(conversationClientId: string) {
  const messages = useChatMessages(conversationClientId);
  const sendMessageAction = useAction(api.chatActions.sendMessage);
  const [isSending, setIsSending] = useState(false);

  const sendMessage = useCallback(
    async (content: string) => {
      if (!content.trim() || isSending) return;
      setIsSending(true);
      try {
        await sendMessageAction({
          conversationClientId,
          content: content.trim(),
        });
      } finally {
        setIsSending(false);
      }
    },
    [conversationClientId, sendMessageAction, isSending]
  );

  const isStreaming = messages.some((m) => m.status === "streaming");

  return {
    messages,
    sendMessage,
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
