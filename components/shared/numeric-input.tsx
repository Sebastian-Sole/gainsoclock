import React, { useState } from 'react';
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
  label,
}: NumericInputProps) {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === 'dark';

  // Raw text while the field is being edited. `null` means "not editing" — show
  // the derived value; a string (including "") means show the user's raw input,
  // so they can clear the last digit and leave the field transiently empty.
  const [text, setText] = useState<string | null>(null);

  // Empty field on blur → fall back to zero, clamped into range.
  const emptyFallback = Math.min(max, Math.max(min, 0));

  const decrement = () => {
    Keyboard.dismiss();
    setText(null);
    onValueChange(Math.max(min, value - step));
  };

  const increment = () => {
    Keyboard.dismiss();
    setText(null);
    onValueChange(Math.min(max, value + step));
  };

  const handleChange = (input: string) => {
    // Digits only; empty is allowed while editing.
    if (input !== '' && !/^\d*$/.test(input)) return;
    setText(input);
    const num = parseInt(input, 10);
    if (!isNaN(num) && num >= min && num <= max) {
      onValueChange(num);
    }
  };

  const handleBlur = () => {
    if (text !== null && text.trim() === '') {
      onValueChange(emptyFallback);
    }
    setText(null);
  };

  return (
    <View className={cn('flex-row items-center gap-2', className)}>
      <Pressable
        onPress={decrement}
        accessibilityRole="button"
        accessibilityLabel={label ? `Decrease ${label}` : 'Decrease'}
        className="h-8 w-8 items-center justify-center rounded-md bg-secondary"
      >
        <Minus size={16} color={isDark ? '#f2f2f2' : '#1c1008'} />
      </Pressable>
      <TextInput
        value={text ?? String(value)}
        onChangeText={handleChange}
        onBlur={handleBlur}
        keyboardType="number-pad"
        accessibilityLabel={label}
        className="min-w-[48px] rounded-md border border-input bg-background px-2 py-1 text-center text-foreground"
      />
      <Pressable
        onPress={increment}
        accessibilityRole="button"
        accessibilityLabel={label ? `Increase ${label}` : 'Increase'}
        className="h-8 w-8 items-center justify-center rounded-md bg-secondary"
      >
        <Plus size={16} color={isDark ? '#f2f2f2' : '#1c1008'} />
      </Pressable>
    </View>
  );
}
