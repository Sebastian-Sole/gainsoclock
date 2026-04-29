import { Pressable, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';
import type { Experience } from '@/stores/intake-draft-store';

type ExperienceChipProps = {
  id: Experience;
  title: string;
  description: string;
  srDescription: string;
  selected: boolean;
  onSelect: () => void;
  testID?: string;
};

export function ExperienceChip({
  id,
  title,
  description,
  srDescription,
  selected,
  onSelect,
  testID,
}: ExperienceChipProps) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={srDescription}
      onPress={onSelect}
      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
      className={cn(
        'min-h-[56px] rounded-2xl border px-4 py-3',
        selected
          ? 'border-primary bg-primary/10'
          : 'border-border bg-card',
      )}
      testID={testID ?? `experience-chip-${id}`}
    >
      <View className="gap-1">
        <Text className="text-base font-semibold">{title}</Text>
        <Text className="text-sm text-muted-foreground">{description}</Text>
      </View>
    </Pressable>
  );
}
