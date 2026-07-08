import { DefaultTheme, type Theme } from '@react-navigation/native';

/**
 * Theme token values for React Native props that can't take Tailwind classes
 * (placeholderTextColor, SVG stroke/fill). Values mirror the CSS variables in
 * global.css — change them together. Access per-scheme via
 * hooks/use-token-colors.ts.
 */
export const TOKEN_COLORS = {
  light: {
    mutedForeground: 'hsl(12, 6.5%, 45%)',
    chartProtein: 'hsl(217, 91%, 60%)',
    chartCarbs: 'hsl(45, 93%, 47%)',
    chartFat: 'hsl(0, 84%, 60%)',
  },
  dark: {
    mutedForeground: 'hsl(24, 5%, 64%)',
    chartProtein: 'hsl(217, 91%, 60%)',
    chartCarbs: 'hsl(45, 93%, 47%)',
    chartFat: 'hsl(0, 84%, 60%)',
  },
} as const;

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
