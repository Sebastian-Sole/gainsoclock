import '../global.css';

import { ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'nativewind';
import { PortalHost } from '@rn-primitives/portal';

import { NAV_THEME } from '@/lib/theme';

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  const { colorScheme } = useColorScheme();

  return (
    <ThemeProvider value={NAV_THEME[colorScheme === 'dark' ? 'dark' : 'light']}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="workout"
          options={{ headerShown: false, presentation: 'fullScreenModal' }}
        />
        <Stack.Screen
          name="template"
          options={{ headerShown: false, presentation: 'modal' }}
        />
        <Stack.Screen
          name="exercise"
          options={{ headerShown: false, presentation: 'modal' }}
        />
      </Stack>
      <PortalHost />
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}
