import React from 'react';
import { TextInput } from 'react-native';
import { keyboardDoneAccessoryID } from '@/components/shared/keyboard-done-accessory';
import { useNumericField } from '@/hooks/use-numeric-field';
import { useTokenColors } from '@/hooks/use-token-colors';
import { cn } from '@/lib/utils';

interface SetInputProps {
  value: number;
  onValueChange: (value: number) => void;
  placeholder?: string;
  className?: string;
  allowDecimals?: boolean;
  accessibilityLabel?: string;
  testID?: string;
}

export function SetInput({
  value,
  onValueChange,
  placeholder,
  className,
  allowDecimals = false,
  accessibilityLabel,
  testID,
}: SetInputProps) {
  const { text, onChangeText, onBlur } = useNumericField({
    value,
    allowDecimals,
    onNumber: (n) => onValueChange(n ?? 0),
  });
  const colors = useTokenColors();

  return (
    <TextInput
      testID={testID}
      value={text}
      onChangeText={onChangeText}
      onBlur={onBlur}
      placeholder={placeholder}
      placeholderTextColor={colors.mutedForeground}
      accessibilityLabel={accessibilityLabel}
      keyboardType={allowDecimals ? 'decimal-pad' : 'number-pad'}
      inputAccessoryViewID={keyboardDoneAccessoryID}
      className={cn(
        // min-height, never fixed: a fixed height clips the digits against the
        // border once Dynamic Type scales the font. min-height grows the cell.
        'min-h-[36px] min-w-[56px] rounded-md border border-input bg-background px-2 text-center text-foreground',
        className
      )}
    />
  );
}
