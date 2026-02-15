import { Stack } from 'expo-router';

export default function TemplateLayout() {
  return (
    <Stack>
      <Stack.Screen name="create" options={{ title: 'New Template' }} />
      <Stack.Screen name="[id]" options={{ title: 'Edit Template' }} />
    </Stack>
  );
}
