import * as React from 'react';
import { InputAccessoryView, Keyboard, Platform, Pressable, View } from 'react-native';
import { Text } from '@/components/ui/text';

/**
 * Themed "Done" bar for numeric keypads (`number-pad`, `decimal-pad`,
 * `numeric`), which have no return key and are otherwise undismissable.
 * Replaces the system toolbar iOS renders when `returnKeyType` is set on a
 * numeric field — that bar is styled by UIKit and clashes with the app theme.
 *
 * Usage: `const kb = useKeyboardDoneBar()`, then on the TextInput set
 * `inputAccessoryViewID={kb.inputAccessoryViewID}` and
 * `returnKeyType={kb.returnKeyType}`, and render `{kb.bar}` as a sibling.
 * The bar is created per component instance (unique `nativeID`), so — unlike
 * the old screen-level shared accessory — it also attaches inside Modals,
 * which live in their own native window.
 *
 * `returnKeyType` is `undefined` on iOS (our bar handles dismissal; setting
 * it would summon the system toolbar this hook exists to replace) and
 * `"done"` elsewhere.
 */
export function useKeyboardDoneBar(): {
  inputAccessoryViewID: string | undefined;
  returnKeyType: 'done' | undefined;
  bar: React.ReactNode;
} {
  const id = React.useId();
  if (Platform.OS !== 'ios') {
    return { inputAccessoryViewID: undefined, returnKeyType: 'done', bar: null };
  }
  return {
    inputAccessoryViewID: id,
    returnKeyType: undefined,
    bar: (
      <InputAccessoryView nativeID={id}>
        <View className="flex-row justify-end border-t border-border bg-card px-2">
          <Pressable
            onPress={() => Keyboard.dismiss()}
            accessibilityRole="button"
            accessibilityLabel="Dismiss keyboard"
            className="min-h-[44px] min-w-[44px] items-center justify-center px-4"
          >
            <Text className="text-base font-semibold text-primary">Done</Text>
          </Pressable>
        </View>
      </InputAccessoryView>
    ),
  };
}
