import { Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

// The auth-guard (`hooks/use-auth-guard.ts`) is the single source of truth for
// onboarding routing now: it pushes unfinished users to `/onboarding/welcome`
// and never redirects away from `/onboarding/*` once `hasCompletedOnboarding`
// flips. `paywall.tsx` flips that flag itself before `router.replace('/(tabs)')`,
// so adding a layout-level Redirect here would race that imperative replace.
export default function OnboardingLayout() {
  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-background">
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: 'transparent' },
        }}
      >
        <Stack.Screen name="welcome" options={{ gestureEnabled: false }} />
        <Stack.Screen name="demo-chat" options={{ gestureEnabled: false }} />
        <Stack.Screen name="demo-meals" options={{ gestureEnabled: false }} />
        <Stack.Screen
          name="demo-workouts"
          options={{ gestureEnabled: false }}
        />
        <Stack.Screen name="founder-note" options={{ gestureEnabled: false }} />
        <Stack.Screen name="healthkit" options={{ gestureEnabled: false }} />
        <Stack.Screen name="paywall" options={{ gestureEnabled: false }} />
      </Stack>
    </SafeAreaView>
  );
}
