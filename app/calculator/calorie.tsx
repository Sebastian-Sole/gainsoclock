import React, { useState, useMemo } from 'react';
import { View, ScrollView, TextInput, Pressable, Platform } from 'react-native';
import { Text } from '@/components/ui/text';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useColorScheme } from 'nativewind';
import { Activity, Heart } from 'lucide-react-native';

import { Colors } from '@/constants/theme';
import { cn } from '@/lib/utils';
import { useHistoryStore } from '@/stores/history-store';
import { useSettingsStore } from '@/stores/settings-store';
import { isHealthKitAvailable } from '@/lib/healthkit';

type Sex = 'male' | 'female';
type ActivitySource = 'app_history' | 'manual' | 'apple_health';
type GoalDirection = 'cut' | 'maintain' | 'bulk';

const GOAL_LABELS: { key: GoalDirection; label: string }[] = [
  { key: 'cut', label: 'Cut' },
  { key: 'maintain', label: 'Maintain' },
  { key: 'bulk', label: 'Bulk' },
];

// ~7700 cal deficit/surplus per kg of body weight change
const CAL_PER_KG = 7700;

const GOAL_AMOUNTS: Record<GoalDirection, { label: string; kgPerWeek: number }[]> = {
  cut: [
    { label: 'Mild', kgPerWeek: -0.25 },
    { label: 'Moderate', kgPerWeek: -0.5 },
    { label: 'Aggressive', kgPerWeek: -0.75 },
    { label: 'Extreme', kgPerWeek: -1.0 },
  ],
  maintain: [
    { label: 'Maintenance', kgPerWeek: 0 },
  ],
  bulk: [
    { label: 'Lean', kgPerWeek: 0.25 },
    { label: 'Moderate', kgPerWeek: 0.5 },
    { label: 'Standard', kgPerWeek: 0.75 },
  ],
};

const WORKOUTS_PER_WEEK_OPTIONS = [1, 2, 3, 4, 5, 6, 7];

const INTENSITY_OPTIONS: { key: string; label: string; calPerSession: number }[] = [
  { key: 'light', label: 'Light', calPerSession: 200 },
  { key: 'moderate', label: 'Moderate', calPerSession: 350 },
  { key: 'intense', label: 'Intense', calPerSession: 500 },
  { key: 'very_intense', label: 'Very Intense', calPerSession: 650 },
];

function estimateActivityMultiplier(weeklyCaloriesBurned: number): number {
  // Map weekly exercise calories to TDEE multiplier
  // Sedentary BMR * 1.2, each ~250 cal/week of exercise adds ~0.025
  const base = 1.2;
  const addition = (weeklyCaloriesBurned / 250) * 0.025;
  return Math.min(base + addition, 1.9);
}

function calculateBMR(sex: Sex, weightKg: number, heightCm: number, age: number): number {
  // Mifflin-St Jeor
  return sex === 'male'
    ? 10 * weightKg + 6.25 * heightCm - 5 * age + 5
    : 10 * weightKg + 6.25 * heightCm - 5 * age - 161;
}

export default function CalorieCalculator() {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === 'dark';
  const primaryColor = Colors[isDark ? 'dark' : 'light'].tint;
  const mutedColor = isDark ? '#a8a29e' : '#78716c';

  const logs = useHistoryStore((s) => s.logs);
  const healthKitEnabled = useSettingsStore((s) => s.healthKitEnabled);
  const healthKitAvailable = Platform.OS === 'ios' && isHealthKitAvailable();

  // Form state
  const [sex, setSex] = useState<Sex>('male');
  const [age, setAge] = useState('');
  const [weight, setWeight] = useState('');
  const [height, setHeight] = useState('');
  const [activitySource, setActivitySource] = useState<ActivitySource>('manual');
  const [workoutsPerWeek, setWorkoutsPerWeek] = useState(4);
  const [intensityKey, setIntensityKey] = useState('moderate');
  const [goalDirection, setGoalDirection] = useState<GoalDirection>('maintain');
  const [goalKgPerWeek, setGoalKgPerWeek] = useState(0);
  const [result, setResult] = useState<{
    bmr: number;
    tdee: number;
    target: number;
    protein: number;
    carbs: number;
    fat: number;
    activityMultiplier: number;
  } | null>(null);

  // Compute activity from app history (last 3 months)
  const appActivityStats = useMemo(() => {
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    const recentLogs = logs.filter(
      (l) => new Date(l.startedAt) >= threeMonthsAgo
    );

    if (recentLogs.length === 0) return null;

    const weeks = Math.max(1, Math.round(
      (Date.now() - threeMonthsAgo.getTime()) / (7 * 24 * 60 * 60 * 1000)
    ));
    const avgWorkoutsPerWeek = Math.round((recentLogs.length / weeks) * 10) / 10;

    // Estimate average duration
    const avgDuration = recentLogs.reduce((sum, l) => sum + l.durationSeconds, 0) / recentLogs.length;

    // Rough calorie estimate per session based on avg duration (moderate intensity ~6-8 cal/min)
    const avgCalPerSession = Math.round((avgDuration / 60) * 7);
    const weeklyCalsBurned = Math.round(avgWorkoutsPerWeek * avgCalPerSession);

    return {
      totalWorkouts: recentLogs.length,
      workoutsPerWeek: avgWorkoutsPerWeek,
      avgDurationMin: Math.round(avgDuration / 60),
      avgCalPerSession,
      weeklyCalsBurned,
    };
  }, [logs]);

  const handleCalculate = () => {
    const a = parseInt(age, 10);
    const w = parseFloat(weight);
    const h = parseFloat(height);
    if (isNaN(a) || isNaN(w) || isNaN(h)) return;

    const bmr = calculateBMR(sex, w, h, a);

    let activityMultiplier: number;

    if (activitySource === 'app_history' && appActivityStats) {
      activityMultiplier = estimateActivityMultiplier(appActivityStats.weeklyCalsBurned);
    } else if (activitySource === 'apple_health') {
      // Placeholder — use moderate as fallback
      activityMultiplier = 1.55;
    } else {
      const intensity = INTENSITY_OPTIONS.find((i) => i.key === intensityKey);
      const weeklyCalsBurned = workoutsPerWeek * (intensity?.calPerSession ?? 350);
      activityMultiplier = estimateActivityMultiplier(weeklyCalsBurned);
    }

    const tdee = Math.round(bmr * activityMultiplier);
    const dailyAdjustment = goalDirection === 'maintain' ? 0 : Math.round((goalKgPerWeek * CAL_PER_KG) / 7);
    const target = tdee + dailyAdjustment;

    // Macro split: 30% protein, 40% carbs, 30% fat
    const protein = Math.round((target * 0.3) / 4);
    const carbs = Math.round((target * 0.4) / 4);
    const fat = Math.round((target * 0.3) / 9);

    setResult({ bmr: Math.round(bmr), tdee, target, protein, carbs, fat, activityMultiplier });
  };

  const inputClass = 'rounded-lg border border-border bg-card px-4 py-3 text-[16px] text-foreground';

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
      <ScrollView className="flex-1 px-4" showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View className="gap-4 pt-4">
          {/* Sex toggle */}
          <View>
            <Text className="mb-2 text-sm font-medium text-muted-foreground">SEX</Text>
            <View className="flex-row rounded-lg bg-secondary">
              {(['male', 'female'] as Sex[]).map((s) => (
                <Pressable
                  key={s}
                  onPress={() => setSex(s)}
                  className={cn('flex-1 rounded-lg py-2', sex === s && 'bg-primary')}
                >
                  <Text
                    className={cn(
                      'text-center text-sm font-medium',
                      sex === s ? 'text-primary-foreground' : 'text-secondary-foreground'
                    )}
                  >
                    {s === 'male' ? 'Male' : 'Female'}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          <View>
            <Text className="mb-2 text-sm font-medium text-muted-foreground">AGE</Text>
            <TextInput
              className={inputClass}
              placeholder="e.g. 25"
              placeholderTextColor={isDark ? '#78716c' : '#a8a29e'}
              keyboardType="numeric"
              value={age}
              onChangeText={setAge}
              textAlignVertical="center"
            />
          </View>

          <View>
            <Text className="mb-2 text-sm font-medium text-muted-foreground">WEIGHT (KG)</Text>
            <TextInput
              className={inputClass}
              placeholder="e.g. 80"
              placeholderTextColor={isDark ? '#78716c' : '#a8a29e'}
              keyboardType="numeric"
              value={weight}
              onChangeText={setWeight}
              textAlignVertical="center"
            />
          </View>

          <View>
            <Text className="mb-2 text-sm font-medium text-muted-foreground">HEIGHT (CM)</Text>
            <TextInput
              className={inputClass}
              placeholder="e.g. 180"
              placeholderTextColor={isDark ? '#78716c' : '#a8a29e'}
              keyboardType="numeric"
              value={height}
              onChangeText={setHeight}
              textAlignVertical="center"
            />
          </View>

          <Separator />

          {/* Activity Level Source */}
          <View>
            <Text className="mb-2 text-sm font-medium text-muted-foreground">ACTIVITY LEVEL</Text>
            <View className="gap-2">
              {/* App History option */}
              <Pressable
                onPress={() => setActivitySource('app_history')}
                className={cn(
                  'flex-row items-center gap-3 rounded-xl px-4 py-3',
                  activitySource === 'app_history'
                    ? 'border-2 border-primary bg-primary/5'
                    : 'border border-border bg-card'
                )}
              >
                <Activity size={20} color={activitySource === 'app_history' ? primaryColor : mutedColor} />
                <View className="flex-1">
                  <Text className="font-medium">Use app history</Text>
                  <Text className="text-sm text-muted-foreground">
                    {appActivityStats
                      ? `${appActivityStats.workoutsPerWeek}/week avg, ~${appActivityStats.avgDurationMin} min each`
                      : 'No workout data yet'}
                  </Text>
                </View>
              </Pressable>

              {/* Manual option */}
              <Pressable
                onPress={() => setActivitySource('manual')}
                className={cn(
                  'flex-row items-center gap-3 rounded-xl px-4 py-3',
                  activitySource === 'manual'
                    ? 'border-2 border-primary bg-primary/5'
                    : 'border border-border bg-card'
                )}
              >
                <View className="flex-1">
                  <Text className="font-medium">Set manually</Text>
                  <Text className="text-sm text-muted-foreground">
                    Pick workouts/week & intensity
                  </Text>
                </View>
              </Pressable>

              {/* Apple Health option (iOS only) */}
              {healthKitAvailable && (
                <Pressable
                  onPress={() => setActivitySource('apple_health')}
                  className={cn(
                    'flex-row items-center gap-3 rounded-xl px-4 py-3',
                    activitySource === 'apple_health'
                      ? 'border-2 border-primary bg-primary/5'
                      : 'border border-border bg-card'
                  )}
                >
                  <Heart size={20} color={activitySource === 'apple_health' ? primaryColor : mutedColor} />
                  <View className="flex-1">
                    <Text className="font-medium">Use Apple Health</Text>
                    <Text className="text-sm text-muted-foreground">
                      {healthKitEnabled ? 'Connected' : 'Enable in Settings first'}
                    </Text>
                  </View>
                </Pressable>
              )}
            </View>
          </View>

          {/* Manual activity details */}
          {activitySource === 'manual' && (
            <View className="gap-4">
              <View>
                <Text className="mb-2 text-sm font-medium text-muted-foreground">WORKOUTS PER WEEK</Text>
                <View className="flex-row flex-wrap gap-2">
                  {WORKOUTS_PER_WEEK_OPTIONS.map((n) => (
                    <Pressable
                      key={n}
                      onPress={() => setWorkoutsPerWeek(n)}
                      className={cn(
                        'h-10 w-10 items-center justify-center rounded-lg',
                        workoutsPerWeek === n ? 'bg-primary' : 'border border-border'
                      )}
                    >
                      <Text
                        className={cn(
                          'font-medium',
                          workoutsPerWeek === n ? 'text-primary-foreground' : 'text-foreground'
                        )}
                      >
                        {n}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              <View>
                <Text className="mb-2 text-sm font-medium text-muted-foreground">INTENSITY</Text>
                <View className="flex-row flex-wrap gap-2">
                  {INTENSITY_OPTIONS.map((opt) => (
                    <Pressable
                      key={opt.key}
                      onPress={() => setIntensityKey(opt.key)}
                      className={cn(
                        'rounded-lg px-3 py-2',
                        intensityKey === opt.key ? 'bg-primary' : 'border border-border'
                      )}
                    >
                      <Text
                        className={cn(
                          'text-sm font-medium',
                          intensityKey === opt.key ? 'text-primary-foreground' : 'text-foreground'
                        )}
                      >
                        {opt.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <Text className="mt-2 text-xs text-muted-foreground">
                  ~{INTENSITY_OPTIONS.find((i) => i.key === intensityKey)?.calPerSession ?? 0} cal/session estimated
                </Text>
              </View>
            </View>
          )}

          {/* App history details */}
          {activitySource === 'app_history' && appActivityStats && (
            <View className="rounded-xl border border-border bg-card px-4 py-3">
              <View className="flex-row justify-between">
                <Text className="text-sm text-muted-foreground">Workouts (3 months)</Text>
                <Text className="text-sm font-medium">{appActivityStats.totalWorkouts}</Text>
              </View>
              <View className="mt-1 flex-row justify-between">
                <Text className="text-sm text-muted-foreground">Per week avg</Text>
                <Text className="text-sm font-medium">{appActivityStats.workoutsPerWeek}</Text>
              </View>
              <View className="mt-1 flex-row justify-between">
                <Text className="text-sm text-muted-foreground">Avg duration</Text>
                <Text className="text-sm font-medium">{appActivityStats.avgDurationMin} min</Text>
              </View>
              <View className="mt-1 flex-row justify-between">
                <Text className="text-sm text-muted-foreground">Est. weekly burn</Text>
                <Text className="text-sm font-medium">{appActivityStats.weeklyCalsBurned} cal</Text>
              </View>
            </View>
          )}

          {/* Apple Health placeholder */}
          {activitySource === 'apple_health' && (
            <View className="rounded-lg bg-muted px-4 py-3">
              <Text className="text-sm text-muted-foreground">
                {healthKitEnabled
                  ? 'Apple Health integration will use your active energy data. Using moderate estimate for now.'
                  : 'Enable Apple Health sync in Settings to use this option.'}
              </Text>
            </View>
          )}

          <Separator />

          {/* Goal */}
          <View>
            <Text className="mb-2 text-sm font-medium text-muted-foreground">GOAL</Text>
            <View className="flex-row rounded-lg bg-secondary">
              {GOAL_LABELS.map(({ key, label }) => (
                <Pressable
                  key={key}
                  onPress={() => {
                    setGoalDirection(key);
                    setGoalKgPerWeek(GOAL_AMOUNTS[key][0].kgPerWeek);
                  }}
                  className={cn('flex-1 rounded-lg py-2', goalDirection === key && 'bg-primary')}
                >
                  <Text
                    className={cn(
                      'text-center text-sm font-medium',
                      goalDirection === key ? 'text-primary-foreground' : 'text-secondary-foreground'
                    )}
                  >
                    {label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          {/* Goal amount picker */}
          {goalDirection !== 'maintain' && (
            <View>
              <Text className="mb-2 text-sm font-medium text-muted-foreground">
                {goalDirection === 'cut' ? 'WEIGHT LOSS PER WEEK' : 'WEIGHT GAIN PER WEEK'}
              </Text>
              <View className="gap-2">
                {GOAL_AMOUNTS[goalDirection].map((opt) => (
                  <Pressable
                    key={opt.kgPerWeek}
                    onPress={() => setGoalKgPerWeek(opt.kgPerWeek)}
                    className={cn(
                      'flex-row items-center justify-between rounded-lg px-4 py-3',
                      goalKgPerWeek === opt.kgPerWeek
                        ? 'border-2 border-primary bg-primary/5'
                        : 'border border-border bg-card'
                    )}
                  >
                    <Text className="font-medium">{opt.label}</Text>
                    <Text className="text-sm text-muted-foreground">
                      {Math.abs(opt.kgPerWeek)} kg/week
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}

          <Button onPress={handleCalculate}>
            <Text className="font-semibold text-primary-foreground">Calculate</Text>
          </Button>
        </View>

        {result && (
          <View className="mt-6 gap-4 pb-8">
            {/* BMR & TDEE */}
            <View className="flex-row gap-3">
              <View className="flex-1 items-center rounded-xl border border-border bg-card py-4">
                <Text className="text-sm text-muted-foreground">BMR</Text>
                <Text className="text-xl font-bold">{result.bmr}</Text>
                <Text className="text-xs text-muted-foreground">cal/day</Text>
              </View>
              <View className="flex-1 items-center rounded-xl border border-border bg-card py-4">
                <Text className="text-sm text-muted-foreground">TDEE</Text>
                <Text className="text-xl font-bold">{result.tdee}</Text>
                <Text className="text-xs text-muted-foreground">
                  x{result.activityMultiplier.toFixed(2)}
                </Text>
              </View>
            </View>

            {/* Target */}
            <View className="items-center rounded-xl border border-border bg-card py-5">
              <Text className="text-sm text-muted-foreground">Daily Target</Text>
              <Text className="text-4xl font-bold" style={{ color: primaryColor }}>
                {result.target}
              </Text>
              <Text className="text-xs text-muted-foreground">calories/day</Text>
            </View>

            {/* Macros */}
            <View>
              <Text className="mb-3 text-sm font-medium text-muted-foreground">
                SUGGESTED MACROS
              </Text>
              <View className="flex-row gap-3">
                <View className="flex-1 items-center rounded-xl border border-border bg-card py-4">
                  <Text className="text-lg font-bold">{result.protein}g</Text>
                  <Text className="text-xs text-muted-foreground">Protein</Text>
                </View>
                <View className="flex-1 items-center rounded-xl border border-border bg-card py-4">
                  <Text className="text-lg font-bold">{result.carbs}g</Text>
                  <Text className="text-xs text-muted-foreground">Carbs</Text>
                </View>
                <View className="flex-1 items-center rounded-xl border border-border bg-card py-4">
                  <Text className="text-lg font-bold">{result.fat}g</Text>
                  <Text className="text-xs text-muted-foreground">Fat</Text>
                </View>
              </View>
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
