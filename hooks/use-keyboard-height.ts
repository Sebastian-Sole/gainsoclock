import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';

/**
 * Current iOS keyboard height in points; 0 when hidden. Use it to lift
 * absolutely-positioned content (which KeyboardAvoidingView mis-measures
 * inside pageSheet modals) above the keyboard. Sheets end at the screen
 * bottom, so offsetting by the full keyboard height is exact.
 *
 * Always 0 on Android: the window resizes (`adjustResize`), so layout
 * already accounts for the keyboard.
 */
export function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);

  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    const show = Keyboard.addListener('keyboardWillShow', (e) => {
      setHeight(e.endCoordinates.height);
    });
    const hide = Keyboard.addListener('keyboardWillHide', () => setHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  return height;
}
