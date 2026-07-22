import * as React from 'react';
import {
  InputAccessoryView,
  Keyboard,
  Platform,
  PlatformColor,
  Pressable,
  View,
} from 'react-native';
import { Text } from '@/components/ui/text';

/**
 * "Done" affordance for numeric keypads (`number-pad`, `decimal-pad`,
 * `numeric`), which have no return key and are otherwise undismissable.
 * iOS provides NO automatic toolbar for numeric keypads with the software
 * keyboard up (`returnKeyType` alone renders nothing; the floating system
 * "Done" only exists in hardware-keyboard mode) — every app draws its own.
 * Ours is styled to be indistinguishable from the system toolbar: a
 * full-width strip flush against the keypad, transparent like the keyboard's
 * translucent tray, with a right-aligned `systemBlue` Done in native button
 * metrics (17pt semibold).
 *
 * Usage: `const kb = useKeyboardDoneBar()`, then on the TextInput set
 * `inputAccessoryViewID={kb.inputAccessoryViewID}` and
 * `returnKeyType={kb.returnKeyType}`, and render `{kb.bar}` as a sibling.
 * The bar is created per component instance (unique `nativeID`), so — unlike
 * a screen-level shared accessory — it also attaches inside Modals, which
 * live in their own native window.
 *
 * `returnKeyType` is `"done"` off iOS and `undefined` on iOS (it adds
 * nothing there, and this bar owns dismissal).
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
      <InputAccessoryView nativeID={id} backgroundColor="transparent">
        <View className="flex-row justify-end">
          <Pressable
            onPress={() => Keyboard.dismiss()}
            accessibilityRole="button"
            accessibilityLabel="Done"
            className="min-h-[44px] min-w-[44px] items-center justify-center px-4"
          >
            <Text
              style={{
                fontSize: 17,
                fontWeight: '600',
                color: PlatformColor('systemBlue'),
              }}
            >
              Done
            </Text>
          </Pressable>
        </View>
      </InputAccessoryView>
    ),
  };
}
