import * as React from 'react';
import { TextInput, type TextInputProps } from 'react-native';
import { cva, type VariantProps } from 'class-variance-authority';
import { keyboardDoneAccessoryID } from '@/components/shared/keyboard-done-accessory';
import { useTokenColors } from '@/hooks/use-token-colors';
import { cn } from '@/lib/utils';

/**
 * Single-line text input.
 *
 * `py-0` + a fixed height is load-bearing, not cosmetic: iOS's single-line
 * TextInput does not split `paddingVertical` evenly around its text, so
 * `py-4` renders the text ~8pt below centre. With zero vertical padding UIKit
 * centres the text within the height itself. Do not reintroduce `py-*` here.
 *
 * For a multi-line field, use TextInput directly — the height/padding rule
 * above does not apply once `multiline` is set.
 */
const inputVariants = cva(
  'rounded-xl border border-input bg-card px-4 py-0 text-foreground',
  {
    variants: {
      size: {
        /** Prominent form field (workout/template/recipe names). */
        default: 'h-14 text-[18px]',
        /** Dense field inside cards and rows. */
        sm: 'h-11 text-base',
      },
    },
    defaultVariants: { size: 'default' },
  }
);

const NUMERIC_KEYBOARDS = new Set(['number-pad', 'decimal-pad', 'numeric', 'phone-pad']);

type InputProps = Omit<TextInputProps, 'multiline'> & VariantProps<typeof inputVariants>;

export function Input({
  className,
  size,
  placeholderTextColor,
  inputAccessoryViewID,
  keyboardType,
  ...props
}: InputProps) {
  const colors = useTokenColors();

  // Numeric keypads have no return key, so without the accessory bar there is
  // no way to dismiss them. Opt in automatically; an explicit id still wins.
  const accessoryID =
    inputAccessoryViewID ??
    (keyboardType && NUMERIC_KEYBOARDS.has(keyboardType)
      ? keyboardDoneAccessoryID
      : undefined);

  return (
    <TextInput
      className={cn(inputVariants({ size }), className)}
      placeholderTextColor={placeholderTextColor ?? colors.mutedForeground}
      keyboardType={keyboardType}
      inputAccessoryViewID={accessoryID}
      {...props}
    />
  );
}

export { inputVariants };
export type { InputProps };
