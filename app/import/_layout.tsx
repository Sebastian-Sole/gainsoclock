import { Stack } from 'expo-router';

export default function ImportLayout() {
  return (
    <Stack>
      <Stack.Screen
        name="index"
        options={{ title: 'Import Data', headerShown: false }}
      />
      <Stack.Screen
        name="fitnotes"
        options={{ title: 'FitNotes', headerShown: false }}
      />
    </Stack>
  );
}
