import React, { useEffect } from 'react';
import { View } from 'react-native';
import { Text } from '@/components/ui/text';
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

export function ChatBubble({ role, content, isStreaming }: ChatBubbleProps) {
  const isUser = role === 'user';

  if (!content && !isStreaming) return null;

  return (
    <View
      className={cn(
        'max-w-[85%] rounded-2xl px-4 py-3',
        isUser
          ? 'self-end bg-primary'
          : 'self-start bg-card border border-border'
      )}
    >
      {content ? (
        isUser ? (
          <Text className="text-[15px] leading-6 text-primary-foreground">
            {content}
          </Text>
        ) : (
          renderMarkdown(content, false)
        )
      ) : isStreaming ? (
        <StreamingDots />
      ) : null}
      {isStreaming && content ? <StreamingDots /> : null}
    </View>
  );
}
