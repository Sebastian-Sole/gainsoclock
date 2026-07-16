import * as React from 'react';
import { Pressable, TextInput, type TextInputProps } from 'react-native';
import { cva, type VariantProps } from 'class-variance-authority';
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
 *
 * The wrapper height is a *minimum*, not fixed: with Dynamic Type the font
 * scales but a fixed box doesn't, and the placeholder gets clipped by the
 * border at accessibility sizes. min-height + wrapper padding lets the box
 * grow with the text (wrapper padding is safe — the iOS centering quirk only
 * concerns padding on the TextInput itself).
 */
const inputVariants = cva('justify-center rounded-xl border border-input bg-card px-4 py-1', {
  variants: {
    size: {
      /** Prominent form field (workout/template/recipe names). */
      default: 'min-h-[56px]',
      /** Dense field inside cards and rows. */
      sm: 'min-h-[44px]',
    },
  },
  defaultVariants: { size: 'default' },
});

const inputTextVariants = cva('py-0 text-foreground', {
  variants: {
    size: {
      default: 'text-[18px]',
      sm: 'text-[16px]',
    },
  },
  defaultVariants: { size: 'default' },
});

const NUMERIC_KEYBOARDS = new Set(['number-pad', 'decimal-pad', 'numeric', 'phone-pad']);

type InputProps = Omit<TextInputProps, 'multiline'> &
  VariantProps<typeof inputVariants> & {
    /**
     * Leading adornment (e.g. a search icon) rendered inside the box, left of
     * the text. Exists so search rows never hand-roll the box around a raw
     * TextInput — that pattern is what regresses.
     */
    leftIcon?: React.ReactNode;
    /** Trailing adornment (e.g. a filter button). May be its own Pressable. */
    rightIcon?: React.ReactNode;
  };

export function Input({
  className,
  size,
  placeholderTextColor,
  returnKeyType,
  keyboardType,
  leftIcon,
  rightIcon,
  ...props
}: InputProps) {
  const colors = useTokenColors();
  const inputRef = React.useRef<TextInput>(null);

  // Numeric keypads have no return key, so they are otherwise undismissable.
  // With returnKeyType set, iOS (New Architecture) renders a native "Done"
  // toolbar above the keypad — per input, so it works inside modals, where a
  // shared InputAccessoryView never attaches. An explicit returnKeyType wins.
  const resolvedReturnKeyType =
    returnKeyType ??
    (keyboardType && NUMERIC_KEYBOARDS.has(keyboardType) ? 'done' : undefined);

  const field = (
    <TextInput
      ref={inputRef}
      className={cn(
        inputTextVariants({ size }),
        leftIcon || rightIcon ? 'flex-1' : 'w-full',
      )}
      placeholderTextColor={placeholderTextColor ?? colors.mutedForeground}
      keyboardType={keyboardType}
      returnKeyType={resolvedReturnKeyType}
      {...props}
    />
  );

  return (
    <Pressable
      className={cn(
        inputVariants({ size }),
        (leftIcon || rightIcon) && 'flex-row items-center gap-2',
        className,
      )}
      onPress={() => inputRef.current?.focus()}
      accessible={false}
    >
      {leftIcon}
      {field}
      {rightIcon}
    </Pressable>
  );
}

export { inputVariants };
export type { InputProps };
