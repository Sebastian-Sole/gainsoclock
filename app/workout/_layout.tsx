import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';

export default function WorkoutLayout() {
  return (
    <SafeAreaProvider>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen
          name="active"
          options={{ gestureEnabled: false }}
        />
        <Stack.Screen name="complete" />
        <Stack.Screen name="[id]" />
      </Stack>
    </SafeAreaProvider>
  );
}
