import React, { useState } from 'react';
import { View, ScrollView, TextInput } from 'react-native';
import { Text } from '@/components/ui/text';
import { Button } from '@/components/ui/button';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useColorScheme } from 'nativewind';

import { useSettingsStore } from '@/stores/settings-store';
import { Colors } from '@/constants/theme';

function calculate1RM(weight: number, reps: number): { epley: number; brzycki: number; lombardi: number } {
  if (reps <= 0 || weight <= 0) return { epley: 0, brzycki: 0, lombardi: 0 };
  if (reps === 1) return { epley: weight, brzycki: weight, lombardi: weight };

  return {
    epley: Math.round(weight * (1 + reps / 30)),
    brzycki: reps >= 37 ? 0 : Math.round(weight * (36 / (37 - reps))),
    lombardi: Math.round(weight * Math.pow(reps, 0.1)),
  };
}

function getPercentages(oneRM: number): { percent: number; weight: number }[] {
  return [95, 90, 85, 80, 75, 70, 65, 60, 55, 50].map((p) => ({
    percent: p,
    weight: Math.round(oneRM * (p / 100)),
  }));
}

export default function OneRMCalculator() {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === 'dark';
  const weightUnit = useSettingsStore((s) => s.weightUnit);
  const primaryColor = Colors[isDark ? 'dark' : 'light'].tint;

  const [weight, setWeight] = useState('');
  const [reps, setReps] = useState('');
  const [result, setResult] = useState<ReturnType<typeof calculate1RM> | null>(null);

  const handleCalculate = () => {
    const w = parseFloat(weight);
    const r = parseInt(reps, 10);
    if (!isNaN(w) && !isNaN(r) && w > 0 && r > 0) {
      setResult(calculate1RM(w, r));
    }
  };

  const inputClass = 'rounded-lg border border-border bg-card px-4 py-3 text-[16px] text-foreground';

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
      <ScrollView className="flex-1 px-4" showsVerticalScrollIndicator={false}>
        <View className="gap-4 pt-4">
          <View>
            <Text className="mb-2 text-sm font-medium text-muted-foreground">
              WEIGHT LIFTED ({weightUnit.toUpperCase()})
            </Text>
            <TextInput
              className={inputClass}
              placeholder={`e.g. ${weightUnit === 'kg' ? '100' : '225'}`}
              placeholderTextColor={isDark ? '#78716c' : '#a8a29e'}
              keyboardType="numeric"
              value={weight}
              onChangeText={setWeight}
              textAlignVertical="center"
            />
          </View>

          <View>
            <Text className="mb-2 text-sm font-medium text-muted-foreground">REPS PERFORMED</Text>
            <TextInput
              className={inputClass}
              placeholder="e.g. 5"
              placeholderTextColor={isDark ? '#78716c' : '#a8a29e'}
              keyboardType="numeric"
              value={reps}
              onChangeText={setReps}
              textAlignVertical="center"
            />
          </View>

          <Button onPress={handleCalculate}>
            <Text className="font-semibold text-primary-foreground">Calculate</Text>
          </Button>
        </View>

        {result && result.epley > 0 && (
          <View className="mt-6 gap-4 pb-8">
            {/* Primary result */}
            <View className="items-center rounded-xl border border-border bg-card py-6">
              <Text className="text-sm text-muted-foreground">Estimated 1RM</Text>
              <Text className="text-4xl font-bold" style={{ color: primaryColor }}>
                {result.epley} {weightUnit}
              </Text>
              <Text className="mt-1 text-xs text-muted-foreground">Epley Formula</Text>
            </View>

            {/* Other formulas */}
            <View className="flex-row gap-3">
              <View className="flex-1 items-center rounded-xl border border-border bg-card py-4">
                <Text className="text-sm text-muted-foreground">Brzycki</Text>
                <Text className="text-xl font-bold">{result.brzycki} {weightUnit}</Text>
              </View>
              <View className="flex-1 items-center rounded-xl border border-border bg-card py-4">
                <Text className="text-sm text-muted-foreground">Lombardi</Text>
                <Text className="text-xl font-bold">{result.lombardi} {weightUnit}</Text>
              </View>
            </View>

            {/* Percentage table */}
            <View>
              <Text className="mb-3 text-sm font-medium text-muted-foreground">TRAINING PERCENTAGES</Text>
              <View className="rounded-xl border border-border bg-card">
                {getPercentages(result.epley).map((row, i) => (
                  <View
                    key={row.percent}
                    className={`flex-row items-center justify-between px-4 py-3 ${
                      i < 9 ? 'border-b border-border' : ''
                    }`}
                  >
                    <Text className="font-medium">{row.percent}%</Text>
                    <Text className="text-muted-foreground">{row.weight} {weightUnit}</Text>
                  </View>
                ))}
              </View>
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
