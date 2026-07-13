import * as React from 'react';
import { Pressable, TextInput, type TextInputProps } from 'react-native';
import { cva, type VariantProps } from 'class-variance-authority';
import { keyboardDoneAccessoryID } from '@/components/shared/keyboard-done-accessory';
import { useTokenColors } from '@/hooks/use-token-colors';
import { cn } from '@/lib/utils';

/**
 * Single-line text input.
 *
 * Structure is load-bearing, not cosmetic: a fixed-height iOS TextInput
 * centres its *value* but draws its *placeholder* a few points low (worse on
 * the New Architecture). So the fixed height lives on a wrapper that
 * flex-centres a self-sizing TextInput — value and placeholder share one
 * auto-height line box and are centred by layout, immune to UIKit's baseline
 * quirks. The wrapper is a Pressable that forwards focus so the whole box
 * stays a tap target. Do not move the height onto the TextInput, and do not
 * use Tailwind text-size classes (`text-base`, `text-lg`) — they inject a
 * line-height that re-introduces the offset; size with `text-[Npx]` only.
 *
 * For a multi-line field, use TextInput directly — none of this applies once
 * `multiline` is set.
 */
const inputVariants = cva('justify-center rounded-xl border border-input bg-card px-4', {
  variants: {
    size: {
      /** Prominent form field (workout/template/recipe names). */
      default: 'h-14',
      /** Dense field inside cards and rows. */
      sm: 'h-11',
    },
  },
  defaultVariants: { size: 'default' },
});

const inputTextVariants = cva('w-full py-0 text-foreground', {
  variants: {
    size: {
      default: 'text-[18px]',
      sm: 'text-[16px]',
    },
  },
  defaultVariants: { size: 'default' },
});

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
  const inputRef = React.useRef<TextInput>(null);

  // Numeric keypads have no return key, so without the accessory bar there is
  // no way to dismiss them. Opt in automatically; an explicit id still wins.
  const accessoryID =
    inputAccessoryViewID ??
    (keyboardType && NUMERIC_KEYBOARDS.has(keyboardType)
      ? keyboardDoneAccessoryID
      : undefined);

  return (
    <Pressable
      className={cn(inputVariants({ size }), className)}
      onPress={() => inputRef.current?.focus()}
      accessible={false}
    >
      <TextInput
        ref={inputRef}
        className={inputTextVariants({ size })}
        placeholderTextColor={placeholderTextColor ?? colors.mutedForeground}
        keyboardType={keyboardType}
        inputAccessoryViewID={accessoryID}
        {...props}
      />
    </Pressable>
  );
}

export { inputVariants };
export type { InputProps };
