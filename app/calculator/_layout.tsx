import { Stack } from 'expo-router';

export default function CalculatorLayout() {
  return (
    <Stack>
      <Stack.Screen name="one-rm" options={{ title: '1RM Calculator' }} />
      <Stack.Screen name="calorie" options={{ title: 'Calorie Calculator' }} />
      <Stack.Screen name="plate" options={{ title: 'Plate Calculator' }} />
      <Stack.Screen name="converter" options={{ title: 'Unit Converter' }} />
      <Stack.Screen name="pace" options={{ title: 'Pace Calculator' }} />
      <Stack.Screen name="speed" options={{ title: 'Speed Calculator' }} />
    </Stack>
  );
}
