import { View } from 'react-native';

import { cn } from '@/lib/utils';
import { useReduceMotion } from '@/hooks/use-reduce-motion';

type ProgressDotsProps = {
  current: number;
  total: number;
};

export function ProgressDots({ current, total }: ProgressDotsProps) {
  const reduceMotion = useReduceMotion();
  const transition = reduceMotion ? '' : 'transition-colors duration-200';

  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 1, max: total, now: current + 1 }}
      accessibilityLabel={`Step ${current + 1} of ${total}`}
      className="flex-row items-center justify-center gap-2 py-3"
      testID="onboarding-progress-dots"
    >
      {Array.from({ length: total }).map((_, idx) => {
        const filled = idx <= current;
        return (
          <View
            key={`dot-${idx}`}
            className={cn(
              'h-2 w-2 rounded-full',
              filled ? 'bg-primary' : 'bg-muted',
              transition,
            )}
          />
        );
      })}
    </View>
  );
}
