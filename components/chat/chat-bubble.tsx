import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo, Pressable, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Check } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { Icon } from '@/components/ui/icon';
import { successHaptic } from '@/lib/haptics';
import { cn } from '@/lib/utils';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withDelay,
} from 'react-native-reanimated';

interface ChatBubbleProps {
  role: 'user' | 'assistant' | 'system';
  content: string;
  isStreaming?: boolean;
  isError?: boolean;
  /**
   * Server-reported stage label for long generations (issue #127), e.g.
   * "Building your workout plan… 12 KB drafted". Only shown while streaming.
   */
  progressText?: string;
}

function renderInlineMarkdown(text: string, isUser: boolean): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  if (parts.length === 1) return text;

  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <Text
          key={i}
          className={cn(
            'font-bold',
            isUser ? 'text-primary-foreground' : 'text-foreground'
          )}
        >
          {part.slice(2, -2)}
        </Text>
      );
    }
    return part;
  });
}

function renderMarkdown(content: string, isUser: boolean): React.ReactNode[] {
  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];
  const textClass = cn(
    'text-[15px] leading-6',
    isUser ? 'text-primary-foreground' : 'text-foreground'
  );

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Heading (## text)
    const headingMatch = line.match(/^#{1,3}\s+(.*)/);
    if (headingMatch) {
      elements.push(
        <Text key={i} className={cn(textClass, 'font-bold mt-1')}>
          {headingMatch[1]}
        </Text>
      );
      continue;
    }

    // Bullet list item
    const bulletMatch = line.match(/^[-•*]\s+(.*)/);
    if (bulletMatch) {
      elements.push(
        <View key={i} className="flex-row pl-2 mt-0.5">
          <Text className={cn(textClass, 'mr-2')}>{'•'}</Text>
          <Text className={cn(textClass, 'flex-1')}>
            {renderInlineMarkdown(bulletMatch[1], isUser)}
          </Text>
        </View>
      );
      continue;
    }

    // Numbered list item
    const numberedMatch = line.match(/^(\d+)[.)]\s+(.*)/);
    if (numberedMatch) {
      elements.push(
        <View key={i} className="flex-row pl-2 mt-0.5">
          <Text
            className={cn(
              'text-[15px] leading-6 mr-2',
              isUser ? 'text-primary-foreground' : 'text-muted-foreground'
            )}
          >
            {numberedMatch[1]}.
          </Text>
          <Text className={cn(textClass, 'flex-1')}>
            {renderInlineMarkdown(numberedMatch[2], isUser)}
          </Text>
        </View>
      );
      continue;
    }

    // Empty line = paragraph break
    if (line.trim() === '') {
      elements.push(<View key={i} className="h-2" />);
      continue;
    }

    // Regular text
    elements.push(
      <Text key={i} className={textClass}>
        {renderInlineMarkdown(line, isUser)}
      </Text>
    );
  }

  return elements;
}

export function StreamingDots() {
  const dot1 = useSharedValue(0.3);
  const dot2 = useSharedValue(0.3);
  const dot3 = useSharedValue(0.3);

  useEffect(() => {
    dot1.value = withRepeat(withTiming(1, { duration: 600 }), -1, true);
    dot2.value = withDelay(
      200,
      withRepeat(withTiming(1, { duration: 600 }), -1, true)
    );
    dot3.value = withDelay(
      400,
      withRepeat(withTiming(1, { duration: 600 }), -1, true)
    );
  }, []);

  const style1 = useAnimatedStyle(() => ({ opacity: dot1.value }));
  const style2 = useAnimatedStyle(() => ({ opacity: dot2.value }));
  const style3 = useAnimatedStyle(() => ({ opacity: dot3.value }));

  return (
    <View className="flex-row gap-1 py-1">
      <Animated.View
        style={style1}
        className="h-1.5 w-1.5 rounded-full bg-muted-foreground"
      />
      <Animated.View
        style={style2}
        className="h-1.5 w-1.5 rounded-full bg-muted-foreground"
      />
      <Animated.View
        style={style3}
        className="h-1.5 w-1.5 rounded-full bg-muted-foreground"
      />
    </View>
  );
}

/**
 * Seconds elapsed since this indicator mounted. A cheap always-ticking
 * liveness signal for long generations — the label text may hold still for
 * a while (e.g. during model reasoning), but this visibly updates every
 * second (issue #127).
 */
function ElapsedSeconds() {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const startedAt = Date.now();
    const timer = setInterval(() => {
      setSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  if (seconds < 1) return null;
  return (
    <Text className="text-xs text-muted-foreground tabular-nums">
      {seconds}s
    </Text>
  );
}

export function ChatBubble({
  role,
  content,
  isStreaming,
  isError,
  progressText,
}: ChatBubbleProps) {
  const isUser = role === 'user';
  const markdownElements = useMemo(
    () => (!isUser && content ? renderMarkdown(content, false) : null),
    [content, isUser]
  );

  // Copy-to-clipboard (issue #130): long-press on any bubble, or the "copy"
  // screen-reader action, copies the raw message text with haptic + a brief
  // visible "Copied" confirmation.
  const [copied, setCopied] = useState(false);
  const canCopy = content.length > 0 && !isStreaming;

  const handleCopy = useCallback(async () => {
    if (!content) return;
    await Clipboard.setStringAsync(content);
    successHaptic();
    AccessibilityInfo.announceForAccessibility('Message copied to clipboard');
    setCopied(true);
  }, [content]);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  if (!content && !isStreaming) return null;

  return (
    <Pressable
      testID={`chat-bubble-${role}`}
      accessibilityRole="text"
      accessibilityLabel={content || 'Assistant is responding'}
      accessibilityHint={canCopy ? 'Long press to copy' : undefined}
      accessibilityActions={
        canCopy ? [{ name: 'copy', label: 'Copy message' }] : undefined
      }
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === 'copy') void handleCopy();
      }}
      onLongPress={canCopy ? () => void handleCopy() : undefined}
      className={cn(
        'max-w-[85%] rounded-2xl px-4 py-3',
        isUser
          ? 'self-end bg-primary'
          : isError
            ? 'self-start bg-destructive/10 border border-destructive/30'
            : 'self-start bg-card border border-border'
      )}
    >
      {content ? (
        isUser ? (
          <Text className="text-[15px] leading-6 text-primary-foreground">
            {content}
          </Text>
        ) : isError ? (
          <Text className="text-[15px] leading-6 text-destructive">
            {content}
          </Text>
        ) : (
          markdownElements
        )
      ) : null}
      {isStreaming ? (
        <View
          testID="chat-generation-progress"
          className={cn('flex-row items-center gap-2', content ? 'pt-2' : '')}
          accessibilityLabel={progressText || 'Generating response'}
          accessibilityRole="progressbar"
        >
          <StreamingDots />
          {progressText ? (
            <Text className="text-xs text-muted-foreground">
              {progressText}
            </Text>
          ) : null}
          <ElapsedSeconds />
        </View>
      ) : null}
      {copied ? (
        <View
          testID="chat-copied-indicator"
          className="mt-1 flex-row items-center gap-1"
        >
          <Icon
            as={Check}
            size={12}
            className={
              isUser ? 'text-primary-foreground' : 'text-muted-foreground'
            }
          />
          <Text
            className={cn(
              'text-xs',
              isUser ? 'text-primary-foreground' : 'text-muted-foreground'
            )}
          >
            Copied
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}
