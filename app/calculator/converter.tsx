import React, { useState } from 'react';
import { View, ScrollView, TextInput } from 'react-native';
import { Text } from '@/components/ui/text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowDown } from 'lucide-react-native';
import { useColorScheme } from 'nativewind';

import { Colors } from '@/constants/theme';

const LBS_PER_KG = 2.20462;

export default function UnitConverter() {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === 'dark';
  const primaryColor = Colors[isDark ? 'dark' : 'light'].tint;

  const [lbs, setLbs] = useState('');
  const [kg, setKg] = useState('');

  const handleLbsChange = (value: string) => {
    setLbs(value);
    const num = parseFloat(value);
    if (!isNaN(num)) {
      setKg((num / LBS_PER_KG).toFixed(2));
    } else {
      setKg('');
    }
  };

  const handleKgChange = (value: string) => {
    setKg(value);
    const num = parseFloat(value);
    if (!isNaN(num)) {
      setLbs((num * LBS_PER_KG).toFixed(2));
    } else {
      setLbs('');
    }
  };

  const inputClass = 'rounded-lg border border-border bg-card px-4 py-3 text-[20px] font-bold text-foreground';

  // Common conversion reference
  const commonWeights = [
    { lbs: 135, kg: 61.2 },
    { lbs: 185, kg: 83.9 },
    { lbs: 225, kg: 102.1 },
    { lbs: 275, kg: 124.7 },
    { lbs: 315, kg: 142.9 },
    { lbs: 405, kg: 183.7 },
  ];

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
      <ScrollView className="flex-1 px-4" showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View className="gap-4 pt-4">
          {/* Lbs input */}
          <View>
            <Text className="mb-2 text-sm font-medium text-muted-foreground">POUNDS (LBS)</Text>
            <TextInput
              className={inputClass}
              placeholder="0"
              placeholderTextColor={isDark ? '#78716c' : '#a8a29e'}
              keyboardType="numeric"
              value={lbs}
              onChangeText={handleLbsChange}
              textAlignVertical="center"
            />
          </View>

          {/* Arrow */}
          <View className="items-center">
            <ArrowDown size={24} color={primaryColor} />
          </View>

          {/* Kg input */}
          <View>
            <Text className="mb-2 text-sm font-medium text-muted-foreground">KILOGRAMS (KG)</Text>
            <TextInput
              className={inputClass}
              placeholder="0"
              placeholderTextColor={isDark ? '#78716c' : '#a8a29e'}
              keyboardType="numeric"
              value={kg}
              onChangeText={handleKgChange}
              textAlignVertical="center"
            />
          </View>
        </View>

        {/* Common weights */}
        <View className="mt-8 pb-8">
          <Text className="mb-3 text-sm font-medium text-muted-foreground">QUICK REFERENCE</Text>
          <View className="rounded-xl border border-border bg-card">
            <View className="flex-row border-b border-border px-4 py-3">
              <Text className="flex-1 font-semibold">lbs</Text>
              <Text className="flex-1 text-right font-semibold">kg</Text>
            </View>
            {commonWeights.map((row, i) => (
              <View
                key={row.lbs}
                className={`flex-row items-center px-4 py-3 ${
                  i < commonWeights.length - 1 ? 'border-b border-border' : ''
                }`}
              >
                <Text className="flex-1">{row.lbs}</Text>
                <Text className="flex-1 text-right text-muted-foreground">
                  {row.kg.toFixed(1)}
                </Text>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
