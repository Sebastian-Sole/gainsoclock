import React, { useState, useMemo } from 'react';
import { View, ScrollView, TextInput, Pressable, Keyboard } from 'react-native';
import { Text } from '@/components/ui/text';
import { Separator } from '@/components/ui/separator';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useColorScheme } from 'nativewind';

import { Colors } from '@/constants/theme';
import { useSettingsStore } from '@/stores/settings-store';
import { cn } from '@/lib/utils';

type PlateUnit = 'lbs' | 'kg';

const PLATES: Record<PlateUnit, number[]> = {
  lbs: [45, 35, 25, 10, 5, 2.5],
  kg: [25, 20, 15, 10, 5, 2.5, 1.25],
};

const BAR_WEIGHT: Record<PlateUnit, number> = {
  lbs: 45,
  kg: 20,
};

const LBS_PER_KG = 2.20462;

interface PlateResult {
  plates: { weight: number; count: number }[];
  remainder: number;
  barWeight: number;
  belowBar: boolean;
}

function calculatePlates(targetWeight: number, unit: PlateUnit): PlateResult {
  const bar = BAR_WEIGHT[unit];
  const perSide = (targetWeight - bar) / 2;

  if (targetWeight < bar) {
    return { plates: [], remainder: 0, barWeight: bar, belowBar: true };
  }

  if (perSide === 0) {
    return { plates: [], remainder: 0, barWeight: bar, belowBar: false };
  }

  let remaining = perSide;
  const plates: { weight: number; count: number }[] = [];
  for (const plate of PLATES[unit]) {
    const count = Math.floor(remaining / plate);
    if (count > 0) {
      plates.push({ weight: plate, count });
      remaining -= count * plate;
    }
  }

  return { plates, remainder: Math.round(remaining * 100) / 100, barWeight: bar, belowBar: false };
}

function PlateBreakdown({ result, unit, primaryColor }: { result: PlateResult; unit: PlateUnit; primaryColor: string }) {
  if (result.belowBar) {
    return (
      <View className="items-center rounded-xl border border-border bg-card py-5">
        <Text className="text-sm text-muted-foreground">
          Below bar weight ({result.barWeight} {unit})
        </Text>
      </View>
    );
  }

  if (result.plates.length === 0) {
    return (
      <View className="items-center rounded-xl border border-border bg-card py-5">
        <Text className="text-sm text-muted-foreground">Just the bar!</Text>
      </View>
    );
  }

  return (
    <View>
      <View className="rounded-xl border border-border bg-card">
        {result.plates.map((plate, i) => (
          <View
            key={plate.weight}
            className={`flex-row items-center justify-between px-4 py-3 ${
              i < result.plates.length - 1 ? 'border-b border-border' : ''
            }`}
          >
            <View className="flex-row items-center gap-3">
              <View
                className="h-9 items-center justify-center rounded"
                style={{
                  width: Math.max(32, plate.weight * (unit === 'lbs' ? 1.2 : 2)),
                  backgroundColor: primaryColor + '20',
                }}
              >
                <Text className="text-xs font-bold" style={{ color: primaryColor }}>
                  {plate.weight}
                </Text>
              </View>
              <Text className="font-medium">
                {plate.weight} {unit}
              </Text>
            </View>
            <Text className="text-lg font-bold">x{plate.count}</Text>
          </View>
        ))}
      </View>
      {result.remainder > 0 && (
        <View className="mt-2 rounded-lg bg-muted px-4 py-3">
          <Text className="text-sm text-muted-foreground">
            {result.remainder} {unit} remaining per side cannot be made with standard plates
          </Text>
        </View>
      )}
    </View>
  );
}

export default function PlateCalculator() {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === 'dark';
  const primaryColor = Colors[isDark ? 'dark' : 'light'].tint;
  const settingsUnit = useSettingsStore((s) => s.weightUnit);

  const [inputUnit, setInputUnit] = useState<PlateUnit>(settingsUnit);
  const [targetWeight, setTargetWeight] = useState('');

  const results = useMemo(() => {
    const w = parseFloat(targetWeight);
    if (isNaN(w) || w <= 0) return null;

    // Convert input to both units
    const weightLbs = inputUnit === 'lbs' ? w : w * LBS_PER_KG;
    const weightKg = inputUnit === 'kg' ? w : w / LBS_PER_KG;

    return {
      lbs: calculatePlates(Math.round(weightLbs), 'lbs'),
      kg: calculatePlates(Math.round(weightKg * 10) / 10, 'kg'),
      weightLbs: Math.round(weightLbs),
      weightKg: Math.round(weightKg * 10) / 10,
    };
  }, [targetWeight, inputUnit]);

  const inputClass = 'rounded-lg border border-border bg-card px-4 py-3 text-[16px] text-foreground';

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
      <ScrollView className="flex-1 px-4" showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View className="gap-4 pt-4">
          {/* Input unit toggle */}
          <View>
            <Text className="mb-2 text-sm font-medium text-muted-foreground">INPUT UNIT</Text>
            <View className="flex-row rounded-lg bg-secondary">
              {(['lbs', 'kg'] as PlateUnit[]).map((u) => (
                <Pressable
                  key={u}
                  onPress={() => { Keyboard.dismiss(); setInputUnit(u); }}
                  className={cn('flex-1 rounded-lg py-2', inputUnit === u && 'bg-primary')}
                >
                  <Text
                    className={cn(
                      'text-center text-sm font-medium',
                      inputUnit === u ? 'text-primary-foreground' : 'text-secondary-foreground'
                    )}
                  >
                    {u}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          <View>
            <Text className="mb-2 text-sm font-medium text-muted-foreground">
              TARGET WEIGHT ({inputUnit.toUpperCase()})
            </Text>
            <TextInput
              className={inputClass}
              placeholder={`e.g. ${inputUnit === 'lbs' ? '225' : '100'}`}
              placeholderTextColor={isDark ? '#78716c' : '#a8a29e'}
              keyboardType="numeric"
              value={targetWeight}
              onChangeText={setTargetWeight}
              textAlignVertical="center"
            />
          </View>
        </View>

        {results && (
          <View className="mt-6 gap-6 pb-8">
            {/* Primary breakdown (matches input unit) */}
            <View>
              <View className="mb-3 flex-row items-baseline justify-between">
                <Text className="text-sm font-medium text-muted-foreground">PER SIDE — {inputUnit.toUpperCase()}</Text>
                <Text className="text-sm text-muted-foreground">
                  {inputUnit === 'lbs' ? results.weightLbs : results.weightKg} {inputUnit} (bar: {BAR_WEIGHT[inputUnit]} {inputUnit})
                </Text>
              </View>
              <PlateBreakdown result={results[inputUnit]} unit={inputUnit} primaryColor={primaryColor} />
            </View>

            <Separator />

            {/* Secondary breakdown (other unit) */}
            {(() => {
              const otherUnit: PlateUnit = inputUnit === 'lbs' ? 'kg' : 'lbs';
              return (
                <View>
                  <View className="mb-3 flex-row items-baseline justify-between">
                    <Text className="text-sm font-medium text-muted-foreground">PER SIDE — {otherUnit.toUpperCase()}</Text>
                    <Text className="text-sm text-muted-foreground">
                      {otherUnit === 'lbs' ? results.weightLbs : results.weightKg} {otherUnit} (bar: {BAR_WEIGHT[otherUnit]} {otherUnit})
                    </Text>
                  </View>
                  <PlateBreakdown result={results[otherUnit]} unit={otherUnit} primaryColor={primaryColor} />
                </View>
              );
            })()}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
