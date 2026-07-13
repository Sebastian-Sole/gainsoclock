import React from 'react';
import { View, Pressable, ActivityIndicator } from 'react-native';
import { Text } from '@/components/ui/text';
import { Icon } from '@/components/ui/icon';
import { RefreshCw, TriangleAlert } from 'lucide-react-native';

interface GenerationIncompleteNoticeProps {
  onRetry: () => void;
  isRetrying?: boolean;
}

/**
 * Shown under an assistant message whose generation failed or was cut off
 * (status "incomplete", or a streaming message that went stale). Gives the
 * user an explicit signal plus a retry affordance — a failed generation must
 * never look like a finished answer (issue #128).
 */
export function GenerationIncompleteNotice({
  onRetry,
  isRetrying,
}: GenerationIncompleteNoticeProps) {
  return (
    <View
      testID="chat-generation-incomplete"
      className="mt-2 w-[85%] self-start rounded-xl border border-destructive/30 bg-destructive/10 p-3"
    >
      <View className="flex-row items-center gap-2">
        <Icon as={TriangleAlert} size={16} className="text-destructive" />
        <Text className="flex-1 text-sm text-destructive">
          This response didn&apos;t finish generating.
        </Text>
      </View>
      <Pressable
        testID="chat-retry-generation"
        accessibilityRole="button"
        accessibilityLabel="Retry generating this response"
        accessibilityState={{ disabled: !!isRetrying, busy: !!isRetrying }}
        disabled={isRetrying}
        onPress={onRetry}
        className="mt-2 min-h-11 flex-row items-center justify-center gap-2 rounded-lg bg-destructive py-2.5"
      >
        {isRetrying ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Icon
            as={RefreshCw}
            size={16}
            className="text-destructive-foreground"
          />
        )}
        <Text className="font-semibold text-destructive-foreground">
          Retry
        </Text>
      </Pressable>
    </View>
  );
}
