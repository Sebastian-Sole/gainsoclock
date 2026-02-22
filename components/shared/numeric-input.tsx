import React from 'react';
import { View, Pressable, TextInput, Keyboard } from 'react-native';
import { Minus, Plus } from 'lucide-react-native';
import { useColorScheme } from 'nativewind';
import { cn } from '@/lib/utils';

interface NumericInputProps {
  value: number;
  onValueChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  className?: string;
  label?: string;
}

export function NumericInput({
  value,
  onValueChange,
  min = 0,
  max = 9999,
  step = 1,
  className,
}: NumericInputProps) {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === 'dark';

  const decrement = () => {
    Keyboard.dismiss();
    const newVal = Math.max(min, value - step);
    onValueChange(newVal);
  };

  const increment = () => {
    Keyboard.dismiss();
    const newVal = Math.min(max, value + step);
    onValueChange(newVal);
  };

  return (
    <View className={cn('flex-row items-center gap-2', className)}>
      <Pressable
        onPress={decrement}
        className="h-8 w-8 items-center justify-center rounded-md bg-secondary"
      >
        <Minus size={16} color={isDark ? '#f2f2f2' : '#1c1008'} />
      </Pressable>
      <TextInput
        value={String(value)}
        onChangeText={(text) => {
          const num = parseInt(text, 10);
          if (!isNaN(num) && num >= min && num <= max) {
            onValueChange(num);
          }
        }}
        keyboardType="numeric"
        className="min-w-[48px] rounded-md border border-input bg-background px-2 py-1 text-center text-foreground"
      />
      <Pressable
        onPress={increment}
        className="h-8 w-8 items-center justify-center rounded-md bg-secondary"
      >
        <Plus size={16} color={isDark ? '#f2f2f2' : '#1c1008'} />
      </Pressable>
    </View>
  );
}
