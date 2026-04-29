import { Pressable, View } from 'react-native';

import { Checkbox } from '@/components/ui/checkbox';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';
import type { ConsentPurpose } from '@/lib/consent';

type ConsentRowProps = {
  purpose: ConsentPurpose;
  boldLine: string;
  finePrint: string;
  checked: boolean;
  onToggle: () => void;
  testID?: string;
};

export function ConsentRow({
  purpose,
  boldLine,
  finePrint,
  checked,
  onToggle,
  testID,
}: ConsentRowProps) {
  const fullSentence = `${boldLine} ${finePrint}`;
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={fullSentence}
      onPress={onToggle}
      className={cn(
        'flex-row items-start gap-3 rounded-2xl border px-4 py-3',
        checked ? 'border-primary bg-primary/5' : 'border-border bg-card',
      )}
      testID={testID ?? `consent-row-${purpose}`}
    >
      <View className="pt-1">
        <Checkbox
          checked={checked}
          onCheckedChange={onToggle}
          accessibilityLabel={boldLine}
          testID={`consent-checkbox-${purpose}`}
        />
      </View>
      <View className="flex-1 gap-1">
        <Text className="text-sm font-semibold leading-snug">{boldLine}</Text>
        <Text className="text-xs text-muted-foreground leading-snug">
          {finePrint}
        </Text>
      </View>
    </Pressable>
  );
}
