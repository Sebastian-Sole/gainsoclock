import { Stack } from 'expo-router';

export default function RecipeLayout() {
  return (
    <Stack>
      <Stack.Screen name="[id]" options={{ headerShown: false }} />
      <Stack.Screen name="create" options={{ headerShown: true }} />
    </Stack>
  );
}
