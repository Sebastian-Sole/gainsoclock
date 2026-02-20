import React, { useState, useMemo } from 'react';
import { View, TextInput, Pressable } from 'react-native';
import { Text } from '@/components/ui/text';
import { Search, ChevronDown, ChevronUp } from 'lucide-react-native';
import { useColorScheme } from 'nativewind';
import { format } from 'date-fns';

import { Colors } from '@/constants/theme';
import { formatWeight, formatDistance, formatTime } from '@/lib/format';
import type { ExerciseStats } from '@/lib/stats';
import type { WeightUnit, DistanceUnit } from '@/stores/settings-store';

interface ExercisesTabProps {
  exerciseStats: ExerciseStats[];
  weightUnit: WeightUnit;
  distanceUnit: DistanceUnit;
}

export function ExercisesTab({ exerciseStats, weightUnit, distanceUnit }: ExercisesTabProps) {
  const { colorScheme } = useColorScheme();
  const mutedColor = Colors[colorScheme === 'dark' ? 'dark' : 'light'].icon;
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (!search.trim()) return exerciseStats;
    const q = search.toLowerCase();
    return exerciseStats.filter((e) => e.exerciseName.toLowerCase().includes(q));
  }, [exerciseStats, search]);

  if (exerciseStats.length === 0) {
    return (
      <View className="items-center py-12">
        <Text className="text-muted-foreground">No exercises logged yet</Text>
      </View>
    );
  }

  return (
    <View className="gap-3">
      {/* Search */}
      <View className="flex-row items-center gap-2 rounded-xl border border-border bg-card px-3">
        <Search size={18} color={mutedColor} />
        <TextInput
          placeholder="Search exercises..."
          placeholderTextColor={mutedColor}
          value={search}
          onChangeText={setSearch}
          className="flex-1 py-3 text-base leading-tight text-foreground"
          autoCapitalize="none"
          autoCorrect={false}
          textAlignVertical="center"
        />
      </View>

      {/* Results count */}
      <Text className="text-xs text-muted-foreground">
        {filtered.length} {filtered.length === 1 ? 'exercise' : 'exercises'}
      </Text>

      {/* Exercise list */}
      <View className="rounded-xl border border-border bg-card">
        {filtered.map((exercise, index) => (
          <View key={exercise.exerciseId}>
            {index > 0 && <View className="mx-4 h-px bg-border" />}
            <ExerciseRow
              exercise={exercise}
              weightUnit={weightUnit}
              distanceUnit={distanceUnit}
              isExpanded={expandedId === exercise.exerciseId}
              onToggle={() =>
                setExpandedId(
                  expandedId === exercise.exerciseId ? null : exercise.exerciseId
                )
              }
              mutedColor={mutedColor}
            />
          </View>
        ))}
        {filtered.length === 0 && (
          <View className="items-center py-8">
            <Text className="text-muted-foreground">No matching exercises</Text>
          </View>
        )}
      </View>
    </View>
  );
}

function ExerciseRow({
  exercise,
  weightUnit,
  distanceUnit,
  isExpanded,
  onToggle,
  mutedColor,
}: {
  exercise: ExerciseStats;
  weightUnit: WeightUnit;
  distanceUnit: DistanceUnit;
  isExpanded: boolean;
  onToggle: () => void;
  mutedColor: string;
}) {
  // Build totals list based on what data exists
  const totals: { label: string; value: string }[] = [];
  if (exercise.totalSets > 0) {
    totals.push({ label: 'Total Sets', value: exercise.totalSets.toLocaleString() });
  }
  if (exercise.totalReps > 0) {
    totals.push({ label: 'Total Reps', value: exercise.totalReps.toLocaleString() });
  }
  if (exercise.totalWeight > 0) {
    totals.push({ label: 'Total Volume', value: formatWeight(Math.round(exercise.totalWeight), weightUnit) });
  }
  if (exercise.totalDistance > 0) {
    totals.push({ label: 'Total Distance', value: formatDistance(Math.round(exercise.totalDistance * 10) / 10, distanceUnit) });
  }
  if (exercise.totalTime > 0) {
    const hours = Math.floor(exercise.totalTime / 3600);
    const mins = Math.floor((exercise.totalTime % 3600) / 60);
    totals.push({ label: 'Total Time', value: hours > 0 ? `${hours}h ${mins}m` : `${mins}m` });
  }

  // Build personal bests list
  const pbs: { label: string; value: string; date: string }[] = [];
  if (exercise.maxWeight) {
    pbs.push({
      label: 'Heaviest',
      value: formatWeight(exercise.maxWeight.value, weightUnit),
      date: format(new Date(exercise.maxWeight.date), 'MMM d, yyyy'),
    });
  }
  if (exercise.maxReps) {
    pbs.push({
      label: 'Most Reps',
      value: `${exercise.maxReps.value} reps`,
      date: format(new Date(exercise.maxReps.date), 'MMM d, yyyy'),
    });
  }
  if (exercise.maxVolume) {
    pbs.push({
      label: 'Best Volume',
      value: formatWeight(exercise.maxVolume.value, weightUnit),
      date: format(new Date(exercise.maxVolume.date), 'MMM d, yyyy'),
    });
  }
  if (exercise.maxTime) {
    pbs.push({
      label: 'Longest',
      value: formatTime(exercise.maxTime.value),
      date: format(new Date(exercise.maxTime.date), 'MMM d, yyyy'),
    });
  }
  if (exercise.maxDistance) {
    pbs.push({
      label: 'Furthest',
      value: formatDistance(exercise.maxDistance.value, distanceUnit),
      date: format(new Date(exercise.maxDistance.date), 'MMM d, yyyy'),
    });
  }

  return (
    <Pressable onPress={onToggle} className="p-4">
      {/* Header row */}
      <View className="flex-row items-center justify-between">
        <View className="flex-1">
          <Text className="font-semibold">{exercise.exerciseName}</Text>
          <Text className="text-xs text-muted-foreground">
            {exercise.totalAppearances} {exercise.totalAppearances === 1 ? 'session' : 'sessions'}
          </Text>
        </View>
        {isExpanded ? (
          <ChevronUp size={18} color={mutedColor} />
        ) : (
          <ChevronDown size={18} color={mutedColor} />
        )}
      </View>

      {/* Expanded details */}
      {isExpanded && (
        <View className="mt-3 gap-3">
          {totals.length === 0 && pbs.length === 0 && (
            <Text className="text-sm text-muted-foreground">No data</Text>
          )}

          {/* Totals */}
          {totals.length > 0 && (
            <View>
              <Text className="mb-1 text-xs font-medium uppercase text-muted-foreground">
                Totals
              </Text>
              {totals.map((t) => (
                <View key={t.label} className="flex-row items-center justify-between py-0.5">
                  <Text className="text-sm text-muted-foreground">{t.label}</Text>
                  <Text className="text-sm font-medium">{t.value}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Personal Bests */}
          {pbs.length > 0 && (
            <View>
              <Text className="mb-1 text-xs font-medium uppercase text-muted-foreground">
                Personal Bests
              </Text>
              {pbs.map((pb) => (
                <View key={pb.label} className="flex-row items-center justify-between py-0.5">
                  <Text className="text-sm text-muted-foreground">{pb.label}</Text>
                  <Text className="text-sm font-medium">
                    {pb.value}
                    <Text className="text-xs text-muted-foreground"> · {pb.date}</Text>
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>
      )}
    </Pressable>
  );
}
