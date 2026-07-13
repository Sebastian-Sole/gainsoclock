import React from 'react';
import { InputAccessoryView, Keyboard, Platform, Pressable, View } from 'react-native';
import { Text } from '@/components/ui/text';

/**
 * Shared nativeID for the "Done" bar. Numeric keypads (`number-pad`,
 * `decimal-pad`) have no return key, so an input using one is otherwise
 * undismissable without tapping outside it.
 */
export const KEYBOARD_DONE_ID = 'keyboard-done-accessory';

/**
 * Pass to a TextInput's `inputAccessoryViewID`. Undefined off iOS —
 * InputAccessoryView is iOS-only, and Android dismisses via the back button.
 */
export const keyboardDoneAccessoryID =
  Platform.OS === 'ios' ? KEYBOARD_DONE_ID : undefined;

/**
 * Render once per screen that has numeric inputs. The bar attaches itself to
 * any TextInput on that screen carrying `keyboardDoneAccessoryID`.
 */
export function KeyboardDoneAccessory() {
  if (Platform.OS !== 'ios') return null;

  return (
    <InputAccessoryView nativeID={KEYBOARD_DONE_ID}>
      <View className="flex-row justify-end border-t border-border bg-card px-2 py-1.5">
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
  );
}
