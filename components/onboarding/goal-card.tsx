import { Pressable, View } from 'react-native';
import { Image } from 'expo-image';
import { Check } from 'lucide-react-native';

import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';
import type { Goal } from '@/stores/intake-draft-store';

type GoalCardProps = {
  id: Goal;
  title: string;
  srDescription: string;
  selected: boolean;
  isPrimary: boolean;
  onSelect: () => void;
  onPinPrimary: () => void;
  imageSource: number;
  blurhash: string;
  testID?: string;
};

export function GoalCard({
  id,
  title,
  srDescription,
  selected,
  isPrimary,
  onSelect,
  onPinPrimary,
  imageSource,
  blurhash,
  testID,
}: GoalCardProps) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={srDescription}
      onPress={onSelect}
      className={cn(
        'relative aspect-square flex-1 overflow-hidden rounded-2xl border bg-card',
        selected ? 'border-primary' : 'border-border',
      )}
      testID={testID ?? `goal-card-${id}`}
    >
      <Image
        source={imageSource}
        placeholder={{ blurhash }}
        contentFit="cover"
        transition={120}
        style={{ position: 'absolute', inset: 0 }}
        accessibilityIgnoresInvertColors
      />
      <View className="absolute inset-0 bg-black/25" pointerEvents="none" />
      <View className="flex-1 justify-end p-3">
        <Text className="text-base font-semibold text-white">{title}</Text>
      </View>
      {selected ? (
        <Pressable
          accessibilityRole="radio"
          accessibilityState={{ selected: isPrimary }}
          accessibilityLabel={
            isPrimary ? `${title} is your primary goal` : `Set ${title} as primary goal`
          }
          onPress={onPinPrimary}
          hitSlop={12}
          className={cn(
            'absolute right-2 top-2 h-8 w-8 items-center justify-center rounded-full border',
            isPrimary ? 'border-primary bg-primary' : 'border-white/70 bg-black/30',
          )}
          testID={`goal-card-${id}-primary`}
        >
          {isPrimary ? (
            <Icon as={Check} size={16} className="text-primary-foreground" />
          ) : (
            <View className="h-3 w-3 rounded-full bg-white/70" />
          )}
        </Pressable>
      ) : null}
    </Pressable>
  );
}
