import React, { useState } from 'react';
import { Modal, Pressable, View } from 'react-native';
import { Text } from '@/components/ui/text';
import { lightHaptic } from '@/lib/haptics';
import { cn } from '@/lib/utils';

interface RpeInputProps {
  value?: number;
  onValueChange: (rpe: number | undefined) => void;
  disabled?: boolean;
  /** 'compact' is the legacy set-row chip; 'focus' matches the Focus Mode
   *  set card's big-value visual language (44pt touch target). */
  variant?: 'compact' | 'focus';
}

const RPE_VALUES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

function rpeColor(value: number): string {
  if (value <= 4) return 'bg-green-500';
  if (value <= 7) return 'bg-yellow-500';
  if (value <= 9) return 'bg-orange-500';
  return 'bg-red-500';
}

export function RpeInput({ value, onValueChange, disabled, variant = 'compact' }: RpeInputProps) {
  const [open, setOpen] = useState(false);

  const handleSelect = (rpe: number) => {
    lightHaptic();
    onValueChange(rpe === value ? undefined : rpe);
    setOpen(false);
  };

  return (
    <>
      <Pressable
        onPress={() => !disabled && setOpen(true)}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={value ? `RPE ${value}` : 'Set RPE'}
        accessibilityHint="Opens the rate of perceived exertion picker"
        className={cn(
          'items-center justify-center border',
          variant === 'compact'
            ? 'h-9 min-w-[40px] rounded-md border-input px-2'
            : 'h-11 min-w-[56px] rounded-xl border-border bg-card px-3',
          value !== undefined && cn(rpeColor(value), 'border-transparent')
        )}
      >
        <Text
          className={cn(
            'font-semibold',
            variant === 'compact' ? 'text-xs' : 'text-xl font-extrabold',
            value !== undefined ? 'text-white' : 'text-muted-foreground'
          )}
        >
          {value !== undefined ? value : variant === 'compact' ? 'RPE' : '—'}
        </Text>
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable
          onPress={() => setOpen(false)}
          className="flex-1 items-center justify-center bg-black/50 px-6"
        >
          <View
            onStartShouldSetResponder={() => true}
            className="w-full rounded-2xl bg-card p-5"
          >
            <Text className="mb-1 text-lg font-bold">Rate of Perceived Exertion</Text>
            <Text className="mb-4 text-sm text-muted-foreground">
              How hard was this set? 1 = very easy, 10 = max effort.
            </Text>
            <View className="flex-row flex-wrap gap-2">
              {RPE_VALUES.map((n) => {
                const selected = n === value;
                return (
                  <Pressable
                    key={n}
                    onPress={() => handleSelect(n)}
                    className={cn(
                      'h-12 w-12 items-center justify-center rounded-lg border',
                      selected
                        ? `${rpeColor(n)} border-transparent`
                        : 'border-border bg-secondary'
                    )}
                    accessibilityRole="button"
                    accessibilityLabel={`RPE ${n}`}
                  >
                    <Text
                      className={cn(
                        'text-base font-semibold',
                        selected ? 'text-white' : 'text-foreground'
                      )}
                    >
                      {n}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            {value !== undefined && (
              <Pressable
                onPress={() => handleSelect(value)}
                className="mt-4 items-center rounded-lg border border-border py-3"
                accessibilityRole="button"
                accessibilityLabel="Clear RPE"
              >
                <Text className="font-medium text-foreground">Clear</Text>
              </Pressable>
            )}
          </View>
        </Pressable>
      </Modal>
    </>
  );
}
