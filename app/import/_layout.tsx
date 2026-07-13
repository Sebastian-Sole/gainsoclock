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
      <Stack.Screen
        name="strong"
        options={{ title: 'Strong', headerShown: false }}
      />
      <Stack.Screen
        name="hevy"
        options={{ title: 'Hevy', headerShown: false }}
      />
      <Stack.Screen
        name="generic"
        options={{ title: 'Generic CSV', headerShown: false }}
      />
    </Stack>
  );
}
