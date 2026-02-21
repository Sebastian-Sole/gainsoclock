import React, { useState } from 'react';
import { View, ScrollView, TextInput, Pressable } from 'react-native';
import { Text } from '@/components/ui/text';
import { Button } from '@/components/ui/button';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useColorScheme } from 'nativewind';

import { Colors } from '@/constants/theme';
import { useSettingsStore, type DistanceUnit } from '@/stores/settings-store';
import { cn } from '@/lib/utils';

function formatPace(totalMinutes: number): string {
  if (!isFinite(totalMinutes) || totalMinutes <= 0) return '--:--';
  const mins = Math.floor(totalMinutes);
  const secs = Math.round((totalMinutes - mins) * 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export default function PaceCalculator() {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === 'dark';
  const primaryColor = Colors[isDark ? 'dark' : 'light'].tint;
  const settingsUnit = useSettingsStore((s) => s.distanceUnit);

  const [unit, setUnit] = useState<DistanceUnit>(settingsUnit);
  const [distance, setDistance] = useState('');
  const [hours, setHours] = useState('');
  const [minutes, setMinutes] = useState('');
  const [seconds, setSeconds] = useState('');
  const [result, setResult] = useState<{
    pace: string;
    speed: string;
    paceUnit: string;
    speedUnit: string;
  } | null>(null);

  const handleCalculate = () => {
    const d = parseFloat(distance);
    const h = parseInt(hours || '0', 10);
    const m = parseInt(minutes || '0', 10);
    const s = parseInt(seconds || '0', 10);

    if (isNaN(d) || d <= 0) return;

    const totalMinutes = h * 60 + m + s / 60;
    if (totalMinutes <= 0) return;

    const paceMinPerUnit = totalMinutes / d;
    const totalHours = totalMinutes / 60;
    const speedPerHour = d / totalHours;

    const paceUnit = unit === 'km' ? 'min/km' : 'min/mi';
    const speedUnit = unit === 'km' ? 'km/h' : 'mph';

    setResult({
      pace: formatPace(paceMinPerUnit),
      speed: speedPerHour.toFixed(1),
      paceUnit,
      speedUnit,
    });
  };

  const inputClass = 'rounded-lg border border-border bg-card px-4 py-3 text-[16px] text-foreground';

  // Common race distances
  const commonDistances = [
    { label: '5K', km: 5, mi: 3.11 },
    { label: '10K', km: 10, mi: 6.21 },
    { label: 'Half Marathon', km: 21.1, mi: 13.11 },
    { label: 'Marathon', km: 42.2, mi: 26.22 },
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

          {/* Distance */}
          <View>
            <Text className="mb-2 text-sm font-medium text-muted-foreground">
              DISTANCE ({unit.toUpperCase()})
            </Text>
            <TextInput
              className={inputClass}
              placeholder={`e.g. ${unit === 'km' ? '5' : '3.1'}`}
              placeholderTextColor={isDark ? '#78716c' : '#a8a29e'}
              keyboardType="numeric"
              value={distance}
              onChangeText={setDistance}
              textAlignVertical="center"
            />
          </View>

          {/* Quick distance buttons */}
          <View className="flex-row flex-wrap gap-2">
            {commonDistances.map((d) => (
              <Pressable
                key={d.label}
                onPress={() => setDistance(String(unit === 'km' ? d.km : d.mi))}
                className="rounded-lg border border-border px-3 py-2 active:opacity-70"
              >
                <Text className="text-sm font-medium">{d.label}</Text>
              </Pressable>
            ))}
          </View>

          {/* Time */}
          <View>
            <Text className="mb-2 text-sm font-medium text-muted-foreground">TIME</Text>
            <View className="flex-row gap-2">
              <View className="flex-1">
                <TextInput
                  className={inputClass}
                  placeholder="HH"
                  placeholderTextColor={isDark ? '#78716c' : '#a8a29e'}
                  keyboardType="numeric"
                  value={hours}
                  onChangeText={setHours}
                  textAlignVertical="center"
                />
              </View>
              <View className="flex-1">
                <TextInput
                  className={inputClass}
                  placeholder="MM"
                  placeholderTextColor={isDark ? '#78716c' : '#a8a29e'}
                  keyboardType="numeric"
                  value={minutes}
                  onChangeText={setMinutes}
                  textAlignVertical="center"
                />
              </View>
              <View className="flex-1">
                <TextInput
                  className={inputClass}
                  placeholder="SS"
                  placeholderTextColor={isDark ? '#78716c' : '#a8a29e'}
                  keyboardType="numeric"
                  value={seconds}
                  onChangeText={setSeconds}
                  textAlignVertical="center"
                />
              </View>
            </View>
          </View>

          <Button onPress={handleCalculate}>
            <Text className="font-semibold text-primary-foreground">Calculate</Text>
          </Button>
        </View>

        {result && (
          <View className="mt-6 gap-4 pb-8">
            <View className="flex-row gap-3">
              <View className="flex-1 items-center rounded-xl border border-border bg-card py-6">
                <Text className="text-sm text-muted-foreground">Pace</Text>
                <Text className="text-3xl font-bold" style={{ color: primaryColor }}>
                  {result.pace}
                </Text>
                <Text className="text-xs text-muted-foreground">{result.paceUnit}</Text>
              </View>
              <View className="flex-1 items-center rounded-xl border border-border bg-card py-6">
                <Text className="text-sm text-muted-foreground">Speed</Text>
                <Text className="text-3xl font-bold" style={{ color: primaryColor }}>
                  {result.speed}
                </Text>
                <Text className="text-xs text-muted-foreground">{result.speedUnit}</Text>
              </View>
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
