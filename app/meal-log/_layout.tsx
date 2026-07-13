import { Stack } from 'expo-router';

export default function MealLogLayout() {
  return (
    <Stack>
      <Stack.Screen name="[id]" options={{ headerShown: false }} />
    </Stack>
  );
}
