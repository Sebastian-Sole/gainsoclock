import { Stack } from 'expo-router';

export default function WorkoutLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen
        name="active"
        options={{ gestureEnabled: false }}
      />
      <Stack.Screen name="complete" />
      <Stack.Screen name="[id]" />
    </Stack>
  );
}
