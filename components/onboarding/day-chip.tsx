import { Pressable } from 'react-native';

import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';

type DayChipProps = {
  weekday: number;
  short: string;
  full: string;
  selected: boolean;
  onToggle: () => void;
  testID?: string;
};

export function DayChip({
  weekday,
  short,
  full,
  selected,
  onToggle,
  testID,
}: DayChipProps) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={full}
      onPress={onToggle}
      hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
      className={cn(
        'h-12 min-w-[44px] flex-1 items-center justify-center rounded-full border px-3',
        selected
          ? 'border-primary bg-primary'
          : 'border-border bg-card',
      )}
      testID={testID ?? `day-chip-${weekday}`}
    >
      <Text
        className={cn(
          'text-sm font-semibold',
          selected ? 'text-primary-foreground' : 'text-foreground',
        )}
      >
        {short}
      </Text>
    </Pressable>
  );
}
