import { Stack } from 'expo-router';

export default function ExerciseLayout() {
  return (
    <Stack>
      <Stack.Screen
        name="index"
        options={{ title: 'Exercise Library', headerShown: false }}
      />
      <Stack.Screen
        name="create"
        options={{ title: 'New Exercise', headerShown: false }}
      />
    </Stack>
  );
}
