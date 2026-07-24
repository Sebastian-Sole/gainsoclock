import * as React from 'react';
import {
  Pressable,
  Text,
  TextInput,
  View,
  useWindowDimensions,
  type TextInputProps,
} from 'react-native';
import { cva, type VariantProps } from 'class-variance-authority';
import { useKeyboardDoneBar } from '@/components/shared/keyboard-done-bar';
import { useTokenColors } from '@/hooks/use-token-colors';
import { cn } from '@/lib/utils';

/**
 * Single-line text input.
 *
 * Structure is load-bearing, not cosmetic: a taller-than-line iOS TextInput
 * centres its *value* but draws its *placeholder* low (worse on the New
 * Architecture). So the box height lives on a wrapper that flex-centres the
 * TextInput, and the TextInput itself is pinned to exactly one font-scaled
 * line (#144) — self-sizing alone proved insufficient because New-Arch flex
 * measurement can intermittently stretch the field to the wrapper height.
 * Even then, with the software keyboard up iOS draws the native placeholder
 * a half-line low (caret and value stay centred), so the visible placeholder
 * is our own flex-centred overlay; the native one is painted transparent and
 * kept only for screen readers. The wrapper is a Pressable that forwards
 * focus so the whole box stays a tap target. Do not put a box height on the TextInput, and do not
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

/** Must match the text-[Npx] classes in inputTextVariants. */
const INPUT_FONT_SIZE = { default: 18, sm: 16 } as const;

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
  style,
  placeholder,
  placeholderTextColor,
  returnKeyType,
  keyboardType,
  leftIcon,
  rightIcon,
  value,
  defaultValue,
  onChangeText,
  ...props
}: InputProps) {
  const colors = useTokenColors();
  const inputRef = React.useRef<TextInput>(null);
  const { fontScale } = useWindowDimensions();

  // iOS's own placeholder drawing is not trusted: with the software keyboard
  // up it renders the placeholder a half-line low, clipped by the box bottom
  // (New Arch; the value text and caret stay centred). So the native
  // placeholder is kept only for screen readers — painted transparent — and
  // the visible placeholder is our own flex-centred overlay, which cannot
  // drift. Empty-state tracking mirrors controlled/uncontrolled usage.
  const [uncontrolledEmpty, setUncontrolledEmpty] = React.useState(
    (defaultValue ?? '') === ''
  );
  const empty = value !== undefined ? value === '' : uncontrolledEmpty;
  const showPlaceholder = empty && placeholder !== undefined && placeholder !== '';

  // Pin the field to exactly one font-scaled line (#144). Flex measurement
  // on the New Architecture can intermittently hand the TextInput the whole
  // wrapper height, and a taller-than-line iOS TextInput draws its
  // placeholder near the bottom (clipped by the border). An explicit height
  // can't stretch, so the quirk has no room to appear — and because it
  // multiplies by fontScale it keeps growing with Dynamic Type, which is
  // what the min-h-wrapper rule exists to protect.
  const fieldHeight = Math.ceil(INPUT_FONT_SIZE[size ?? 'default'] * 1.35 * fontScale);

  // Numeric keypads have no return key, so they are otherwise undismissable —
  // and iOS renders no toolbar of its own with the software keyboard up.
  // Attach the system-styled per-input Done bar (works inside modals). A
  // caller-supplied inputAccessoryViewID or returnKeyType wins.
  const kb = useKeyboardDoneBar();
  const isNumericKeypad = keyboardType !== undefined && NUMERIC_KEYBOARDS.has(keyboardType);
  const useDoneBar = isNumericKeypad && props.inputAccessoryViewID === undefined;
  const resolvedReturnKeyType =
    returnKeyType ?? (isNumericKeypad ? kb.returnKeyType : undefined);

  const field = (
    <View className={cn('justify-center', leftIcon || rightIcon ? 'flex-1' : 'w-full')}>
      {/* input-height-ok: height is font-scaled (one line, grows with Dynamic
          Type) — see the #144 note above; this is not a fixed-box height. */}
      <TextInput
        ref={inputRef}
        className={cn(inputTextVariants({ size }), 'w-full')}
        // Caller `style` first so the one-line height guard always wins: a
        // caller-supplied `height` must not reintroduce the placeholder
        // baseline/clipping quirk this component exists to prevent.
        style={[style, { height: fieldHeight }]}
        value={value}
        defaultValue={defaultValue}
        onChangeText={(text) => {
          setUncontrolledEmpty(text === '');
          onChangeText?.(text);
        }}
        placeholder={placeholder}
        placeholderTextColor="transparent"
        keyboardType={keyboardType}
        returnKeyType={resolvedReturnKeyType}
        {...props}
        inputAccessoryViewID={useDoneBar ? kb.inputAccessoryViewID : props.inputAccessoryViewID}
      />
      {showPlaceholder && (
        <View pointerEvents="none" className="absolute inset-0 flex-row items-center">
          <Text
            numberOfLines={1}
            style={{
              fontSize: INPUT_FONT_SIZE[size ?? 'default'],
              color:
                typeof placeholderTextColor === 'string'
                  ? placeholderTextColor
                  : colors.mutedForeground,
            }}
          >
            {placeholder}
          </Text>
        </View>
      )}
    </View>
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
      {useDoneBar ? kb.bar : null}
    </Pressable>
  );
}

export { inputVariants };
export type { InputProps };
