import React, { useState } from 'react';
import { View, ScrollView, TextInput, Pressable } from 'react-native';
import { Text } from '@/components/ui/text';
import { Button } from '@/components/ui/button';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useColorScheme } from 'nativewind';

import { Colors } from '@/constants/theme';
import { useSettingsStore, type DistanceUnit } from '@/stores/settings-store';
import { cn } from '@/lib/utils';
import { Separator } from '@/components/ui/separator';

const KM_PER_MI = 1.60934;

function formatPace(totalMinutes: number): string {
  if (!isFinite(totalMinutes) || totalMinutes <= 0) return '--:--';
  const mins = Math.floor(totalMinutes);
  const secs = Math.round((totalMinutes - mins) * 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

interface SpeedResult {
  speed: string;
  speedUnit: string;
  pace: string;
  paceUnit: string;
}

export default function SpeedCalculator() {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === 'dark';
  const primaryColor = Colors[isDark ? 'dark' : 'light'].tint;
  const settingsUnit = useSettingsStore((s) => s.distanceUnit);

  const [unit, setUnit] = useState<DistanceUnit>(settingsUnit);
  const [paceMin, setPaceMin] = useState('');
  const [paceSec, setPaceSec] = useState('');
  const [result, setResult] = useState<{ primary: SpeedResult; secondary: SpeedResult } | null>(null);

  const handleCalculate = () => {
    const m = parseInt(paceMin || '0', 10);
    const s = parseInt(paceSec || '0', 10);
    const totalMinutes = m + s / 60;
    if (totalMinutes <= 0) return;

    // Primary unit calculations
    const speedPrimary = 60 / totalMinutes;

    // Convert pace to the other unit
    // If input is min/km, convert to min/mi: multiply by km_per_mi
    // If input is min/mi, convert to min/km: divide by km_per_mi
    const otherPaceMinutes = unit === 'km'
      ? totalMinutes * KM_PER_MI
      : totalMinutes / KM_PER_MI;
    const speedSecondary = 60 / otherPaceMinutes;

    const otherUnit: DistanceUnit = unit === 'km' ? 'mi' : 'km';

    setResult({
      primary: {
        speed: speedPrimary.toFixed(1),
        speedUnit: unit === 'km' ? 'km/h' : 'mph',
        pace: formatPace(totalMinutes),
        paceUnit: unit === 'km' ? 'min/km' : 'min/mi',
      },
      secondary: {
        speed: speedSecondary.toFixed(1),
        speedUnit: otherUnit === 'km' ? 'km/h' : 'mph',
        pace: formatPace(otherPaceMinutes),
        paceUnit: otherUnit === 'km' ? 'min/km' : 'min/mi',
      },
    });
  };

  const inputClass = 'rounded-lg border border-border bg-card px-4 py-3 text-[16px] text-foreground';

  // Common paces for quick selection
  const commonPaces = [
    { label: 'Walk', min: 12, sec: 0 },
    { label: 'Jog', min: 7, sec: 0 },
    { label: 'Run', min: 5, sec: 30 },
    { label: 'Fast', min: 4, sec: 30 },
    { label: 'Sprint', min: 3, sec: 30 },
  ];

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
      <ScrollView className="flex-1 px-4" showsVerticalScrollIndicator={false}>
        <View className="gap-4 pt-4">
          {/* Unit toggle */}
          <View>
            <Text className="mb-2 text-sm font-medium text-muted-foreground">UNIT</Text>
            <View className="flex-row rounded-lg bg-secondary">
              {(['km', 'mi'] as DistanceUnit[]).map((u) => (
                <Pressable
                  key={u}
                  onPress={() => setUnit(u)}
                  className={cn('flex-1 rounded-lg py-2', unit === u && 'bg-primary')}
                >
                  <Text
                    className={cn(
                      'text-center text-sm font-medium',
                      unit === u ? 'text-primary-foreground' : 'text-secondary-foreground'
                    )}
                  >
                    {u}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          {/* Pace input */}
          <View>
            <Text className="mb-2 text-sm font-medium text-muted-foreground">
              PACE ({unit === 'km' ? 'MIN/KM' : 'MIN/MI'})
            </Text>
            <View className="flex-row items-center gap-2">
              <View className="flex-1">
                <TextInput
                  className={inputClass}
                  placeholder="MIN"
                  placeholderTextColor={isDark ? '#78716c' : '#a8a29e'}
                  keyboardType="numeric"
                  value={paceMin}
                  onChangeText={setPaceMin}
                  textAlignVertical="center"
                />
              </View>
              <Text className="text-lg font-bold text-muted-foreground">:</Text>
              <View className="flex-1">
                <TextInput
                  className={inputClass}
                  placeholder="SEC"
                  placeholderTextColor={isDark ? '#78716c' : '#a8a29e'}
                  keyboardType="numeric"
                  value={paceSec}
                  onChangeText={setPaceSec}
                  textAlignVertical="center"
                />
              </View>
            </View>
          </View>

          {/* Quick pace buttons */}
          <View className="flex-row flex-wrap gap-2">
            {commonPaces.map((p) => (
              <Pressable
                key={p.label}
                onPress={() => {
                  setPaceMin(String(p.min));
                  setPaceSec(String(p.sec));
                }}
                className="rounded-lg border border-border px-3 py-2 active:opacity-70"
              >
                <Text className="text-sm font-medium">{p.label}</Text>
              </Pressable>
            ))}
          </View>

          <Button onPress={handleCalculate}>
            <Text className="font-semibold text-primary-foreground">Calculate</Text>
          </Button>
        </View>

        {result && (
          <View className="mt-6 gap-6 pb-8">
            {/* Primary unit results */}
            <View>
              <Text className="mb-3 text-sm font-medium text-muted-foreground">
                {unit.toUpperCase()}
              </Text>
              <View className="flex-row gap-3">
                <View className="flex-1 items-center rounded-xl border border-border bg-card py-6">
                  <Text className="text-sm text-muted-foreground">Speed</Text>
                  <Text className="text-3xl font-bold" style={{ color: primaryColor }}>
                    {result.primary.speed}
                  </Text>
                  <Text className="text-xs text-muted-foreground">{result.primary.speedUnit}</Text>
                </View>
                <View className="flex-1 items-center rounded-xl border border-border bg-card py-6">
                  <Text className="text-sm text-muted-foreground">Pace</Text>
                  <Text className="text-3xl font-bold" style={{ color: primaryColor }}>
                    {result.primary.pace}
                  </Text>
                  <Text className="text-xs text-muted-foreground">{result.primary.paceUnit}</Text>
                </View>
              </View>
            </View>

            <Separator />

            {/* Secondary unit results */}
            <View>
              <Text className="mb-3 text-sm font-medium text-muted-foreground">
                {(unit === 'km' ? 'MI' : 'KM')}
              </Text>
              <View className="flex-row gap-3">
                <View className="flex-1 items-center rounded-xl border border-border bg-card py-6">
                  <Text className="text-sm text-muted-foreground">Speed</Text>
                  <Text className="text-3xl font-bold" style={{ color: primaryColor }}>
                    {result.secondary.speed}
                  </Text>
                  <Text className="text-xs text-muted-foreground">{result.secondary.speedUnit}</Text>
                </View>
                <View className="flex-1 items-center rounded-xl border border-border bg-card py-6">
                  <Text className="text-sm text-muted-foreground">Pace</Text>
                  <Text className="text-3xl font-bold" style={{ color: primaryColor }}>
                    {result.secondary.pace}
                  </Text>
                  <Text className="text-xs text-muted-foreground">{result.secondary.paceUnit}</Text>
                </View>
              </View>
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
