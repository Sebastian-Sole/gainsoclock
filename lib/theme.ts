import { DefaultTheme, type Theme } from '@react-navigation/native';

export const NAV_THEME = {
  light: {
    dark: false,
    fonts: DefaultTheme.fonts,
    colors: {
      background: 'hsl(0, 0%, 100%)',
      border: 'hsl(20, 5.9%, 90%)',
      card: 'hsl(0, 0%, 100%)',
      notification: 'hsl(0, 84.2%, 60.2%)',
      primary: 'hsl(24, 95%, 53%)',
      text: 'hsl(20, 14.3%, 4.1%)',
    },
  } satisfies Theme,
  dark: {
    dark: true,
    fonts: DefaultTheme.fonts,
    colors: {
      background: 'hsl(20, 14.3%, 4.1%)',
      border: 'hsl(24, 6%, 19%)',
      card: 'hsl(24, 10%, 10%)',
      notification: 'hsl(0, 72%, 51%)',
      primary: 'hsl(24, 95%, 58%)',
      text: 'hsl(0, 0%, 95%)',
    },
  } satisfies Theme,
};
