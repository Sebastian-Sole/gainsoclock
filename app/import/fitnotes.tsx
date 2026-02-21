import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Text } from '@/components/ui/text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useColorScheme } from 'nativewind';
import {
  ArrowLeft,
  FileUp,
  Check,
  CheckCircle,
  Circle,
  AlertTriangle,
} from 'lucide-react-native';
import * as DocumentPicker from 'expo-document-picker';
import { format } from 'date-fns';

import { cn } from '@/lib/utils';
import { useHistoryStore } from '@/stores/history-store';
import { useExerciseLibraryStore } from '@/stores/exercise-library-store';
import {
  parseFitNotesCSV,
  buildWorkoutLogs,
  type FitNotesImportOptions,
  type FitNotesSummary,
  type FitNotesRow,
} from '@/lib/import/fitnotes';
import type { ExerciseType } from '@/lib/types';

type Step = 'instructions' | 'options' | 'importing' | 'complete';
type DuplicateHandling = 'skip' | 'replace';

interface OptionItem {
  key: keyof FitNotesImportOptions;
  label: string;
  description: string;
}

const OPTION_ITEMS: OptionItem[] = [
  {
    key: 'exercises',
    label: 'Exercises',
    description: 'Exercise names and types for each workout',
  },
  {
    key: 'setsAndReps',
    label: 'Sets & Reps',
    description: 'Number of sets and rep counts',
  },
  {
    key: 'weightAndTime',
    label: 'Weight & Time',
    description: 'Weight, time, and distance values',
  },
  {
    key: 'completionStatus',
    label: 'Set Completion Status',
    description: 'Whether each set was completed',
  },
];

export default function FitNotesImportScreen() {
  const router = useRouter();
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === 'dark';
  const iconColor = isDark ? '#fb923c' : '#f97316';

  const addLog = useHistoryStore((s) => s.addLog);
  const deleteLog = useHistoryStore((s) => s.deleteLog);
  const existingLogs = useHistoryStore((s) => s.logs);
  const getOrCreate = useExerciseLibraryStore((s) => s.getOrCreate);

  const [step, setStep] = useState<Step>('instructions');
  const [parsedRows, setParsedRows] = useState<FitNotesRow[]>([]);
  const [summary, setSummary] = useState<FitNotesSummary | null>(null);
  const [options, setOptions] = useState<FitNotesImportOptions>({
    exercises: true,
    setsAndReps: true,
    weightAndTime: true,
    completionStatus: true,
  });
  const [duplicateHandling, setDuplicateHandling] =
    useState<DuplicateHandling>('skip');
  const [importedCount, setImportedCount] = useState(0);
  const [skippedCount, setSkippedCount] = useState(0);
  const [isPicking, setIsPicking] = useState(false);

  // Build a set of existing workout timestamps for duplicate detection
  const existingTimestamps = useMemo(() => {
    const set = new Set<string>();
    for (const log of existingLogs) {
      set.add(`${log.startedAt}|${log.completedAt}`);
    }
    return set;
  }, [existingLogs]);

  // Count how many parsed workouts overlap with existing data
  const duplicateCount = useMemo(() => {
    if (parsedRows.length === 0) return 0;
    const workoutKeys = new Set<string>();
    for (const row of parsedRows) {
      workoutKeys.add(`${row.StartTime}|${row.EndTime}`);
    }
    let count = 0;
    for (const key of workoutKeys) {
      if (existingTimestamps.has(key)) count++;
    }
    return count;
  }, [parsedRows, existingTimestamps]);

  const toggleOption = (key: keyof FitNotesImportOptions) => {
    setOptions((prev) => {
      const newVal = !prev[key];
      if (key === 'exercises' && !newVal) {
        return {
          ...prev,
          exercises: false,
          setsAndReps: false,
          weightAndTime: false,
          completionStatus: false,
        };
      }
      if (key !== 'exercises' && newVal && !prev.exercises) {
        return { ...prev, exercises: true, [key]: true };
      }
      return { ...prev, [key]: newVal };
    });
  };

  const toggleAll = () => {
    const allEnabled = Object.values(options).every(Boolean);
    const newVal = !allEnabled;
    setOptions({
      exercises: newVal,
      setsAndReps: newVal,
      weightAndTime: newVal,
      completionStatus: newVal,
    });
  };

  const handlePickFile = useCallback(async () => {
    setIsPicking(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['text/csv', 'text/comma-separated-values', 'application/csv'],
        copyToCacheDirectory: true,
      });

      if (result.canceled) {
        setIsPicking(false);
        return;
      }

      const asset = result.assets[0];
      const response = await fetch(asset.uri);
      const csvString = await response.text();
      const parsed = parseFitNotesCSV(csvString);

      if (parsed.rows.length === 0) {
        Alert.alert(
          'No Data Found',
          'The CSV file appears to be empty or in an unexpected format.'
        );
        setIsPicking(false);
        return;
      }

      setParsedRows(parsed.rows);
      setSummary(parsed.summary);
      setStep('options');
    } catch (error) {
      Alert.alert('Error', 'Failed to read the CSV file. Please try again.');
    }
    setIsPicking(false);
  }, []);

  const handleImport = useCallback(async () => {
    setStep('importing');

    const exerciseResolver = (name: string, type: ExerciseType): string => {
      const exercise = getOrCreate(name, type);
      return exercise.id;
    };

    const logs = buildWorkoutLogs(parsedRows, options, exerciseResolver);

    // Build lookup for existing logs by timestamp for duplicate handling
    const existingByTimestamp = new Map<string, string>();
    for (const log of existingLogs) {
      existingByTimestamp.set(
        `${log.startedAt}|${log.completedAt}`,
        log.id
      );
    }

    let imported = 0;
    let skipped = 0;

    for (const log of logs) {
      const key = `${log.startedAt}|${log.completedAt}`;
      const existingId = existingByTimestamp.get(key);

      if (existingId) {
        if (duplicateHandling === 'skip') {
          skipped++;
          setSkippedCount(skipped);
          continue;
        }
        // Replace: delete existing first
        deleteLog(existingId);
      }

      addLog(log);
      imported++;
      setImportedCount(imported);

      if (imported % 10 === 0) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }

    setImportedCount(imported);
    setSkippedCount(skipped);
    setStep('complete');
  }, [
    parsedRows,
    options,
    getOrCreate,
    addLog,
    deleteLog,
    existingLogs,
    duplicateHandling,
  ]);

  const allSelected = Object.values(options).every(Boolean);

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <View className="flex-row items-center gap-3 px-4 pb-4 pt-4">
        <Pressable
          onPress={() => {
            if (step === 'importing') return;
            router.back();
          }}
        >
          <ArrowLeft size={24} className="text-foreground" />
        </Pressable>
        <Text className="text-3xl font-bold">FitNotes</Text>
      </View>

      <ScrollView className="flex-1 px-4">
        {step === 'instructions' && (
          <InstructionsStep
            iconColor={iconColor}
            isPicking={isPicking}
            onPickFile={handlePickFile}
          />
        )}

        {step === 'options' && summary && (
          <OptionsStep
            summary={summary}
            options={options}
            allSelected={allSelected}
            iconColor={iconColor}
            duplicateCount={duplicateCount}
            duplicateHandling={duplicateHandling}
            onSetDuplicateHandling={setDuplicateHandling}
            onToggleOption={toggleOption}
            onToggleAll={toggleAll}
            onImport={handleImport}
          />
        )}

        {step === 'importing' && summary && (
          <ImportingStep
            importedCount={importedCount}
            totalCount={summary.workoutCount}
          />
        )}

        {step === 'complete' && (
          <CompleteStep
            importedCount={importedCount}
            skippedCount={skippedCount}
            iconColor={iconColor}
            onDone={() => router.dismissAll()}
          />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function InstructionsStep({
  iconColor,
  isPicking,
  onPickFile,
}: {
  iconColor: string;
  isPicking: boolean;
  onPickFile: () => void;
}) {
  return (
    <View>
      <Text className="mb-3 mt-4 text-sm font-medium text-muted-foreground">
        HOW TO EXPORT FROM FITNOTES
      </Text>
      <View className="rounded-xl bg-card px-4 py-4">
        <Text className="leading-6 text-foreground">
          1. Open FitNotes on your device{'\n'}
          2. Go to <Text className="font-bold">Settings</Text>
          {'\n'}
          3. Tap <Text className="font-bold">Export Data</Text>
          {'\n'}
          4. Tap <Text className="font-bold">Export Workouts</Text>
          {'\n'}
          5. Save the CSV file and upload it below
        </Text>
      </View>

      <Text className="mb-3 mt-8 text-sm font-medium text-muted-foreground">
        UPLOAD FILE
      </Text>
      <Pressable
        onPress={onPickFile}
        disabled={isPicking}
        className="items-center justify-center rounded-xl border-2 border-dashed border-border bg-card px-4 py-8"
      >
        {isPicking ? (
          <ActivityIndicator color={iconColor} />
        ) : (
          <>
            <FileUp size={32} color={iconColor} />
            <Text className="mt-3 font-medium">Select CSV File</Text>
            <Text className="mt-1 text-sm text-muted-foreground">
              Tap to choose your FitNotes export file
            </Text>
          </>
        )}
      </Pressable>
    </View>
  );
}

function OptionsStep({
  summary,
  options,
  allSelected,
  iconColor,
  duplicateCount,
  duplicateHandling,
  onSetDuplicateHandling,
  onToggleOption,
  onToggleAll,
  onImport,
}: {
  summary: FitNotesSummary;
  options: FitNotesImportOptions;
  allSelected: boolean;
  iconColor: string;
  duplicateCount: number;
  duplicateHandling: DuplicateHandling;
  onSetDuplicateHandling: (handling: DuplicateHandling) => void;
  onToggleOption: (key: keyof FitNotesImportOptions) => void;
  onToggleAll: () => void;
  onImport: () => void;
}) {
  return (
    <View>
      <Text className="mb-3 mt-4 text-sm font-medium text-muted-foreground">
        FILE SUMMARY
      </Text>
      <View className="rounded-xl bg-card px-4 py-4">
        <View className="flex-row justify-between">
          <Text className="text-muted-foreground">Workouts</Text>
          <Text className="font-medium">{summary.workoutCount}</Text>
        </View>
        <View className="mt-2 flex-row justify-between">
          <Text className="text-muted-foreground">Exercises</Text>
          <Text className="font-medium">{summary.exerciseCount}</Text>
        </View>
        <View className="mt-2 flex-row justify-between">
          <Text className="text-muted-foreground">Total Sets</Text>
          <Text className="font-medium">{summary.setCount}</Text>
        </View>
        {summary.dateRange && (
          <View className="mt-2 flex-row justify-between">
            <Text className="text-muted-foreground">Date Range</Text>
            <Text className="font-medium">
              {format(new Date(summary.dateRange.earliest), 'MMM yyyy')} –{' '}
              {format(new Date(summary.dateRange.latest), 'MMM yyyy')}
            </Text>
          </View>
        )}
      </View>

      {/* Duplicate Warning */}
      {duplicateCount > 0 && (
        <>
          <Text className="mb-3 mt-8 text-sm font-medium text-muted-foreground">
            DUPLICATES FOUND
          </Text>
          <View className="rounded-xl bg-card px-4 py-4">
            <View className="flex-row items-center gap-3">
              <AlertTriangle size={20} color="#f59e0b" />
              <Text className="flex-1 text-sm text-foreground">
                {duplicateCount} workout{duplicateCount === 1 ? '' : 's'} already
                exist{duplicateCount === 1 ? 's' : ''} in your history.
              </Text>
            </View>
            <View className="mt-3 flex-row rounded-lg bg-secondary">
              <Pressable
                onPress={() => onSetDuplicateHandling('skip')}
                className={cn(
                  'flex-1 items-center rounded-lg px-4 py-2',
                  duplicateHandling === 'skip' && 'bg-primary'
                )}
              >
                <Text
                  className={cn(
                    'text-sm font-medium',
                    duplicateHandling === 'skip'
                      ? 'text-primary-foreground'
                      : 'text-secondary-foreground'
                  )}
                >
                  Skip duplicates
                </Text>
              </Pressable>
              <Pressable
                onPress={() => onSetDuplicateHandling('replace')}
                className={cn(
                  'flex-1 items-center rounded-lg px-4 py-2',
                  duplicateHandling === 'replace' && 'bg-primary'
                )}
              >
                <Text
                  className={cn(
                    'text-sm font-medium',
                    duplicateHandling === 'replace'
                      ? 'text-primary-foreground'
                      : 'text-secondary-foreground'
                  )}
                >
                  Replace existing
                </Text>
              </Pressable>
            </View>
          </View>
        </>
      )}

      <Text className="mb-3 mt-8 text-sm font-medium text-muted-foreground">
        WHAT TO IMPORT
      </Text>
      <Text className="mb-3 text-sm text-muted-foreground">
        Workout timestamps are always imported. Choose additional data below.
      </Text>
      <View className="rounded-xl bg-card">
        {/* Select All */}
        <Pressable
          onPress={onToggleAll}
          className="flex-row items-center gap-3 px-4 py-4"
        >
          {allSelected ? (
            <CheckCircle size={22} color={iconColor} />
          ) : (
            <Circle size={22} className="text-muted-foreground" />
          )}
          <Text className="flex-1 font-bold">Import All</Text>
        </Pressable>

        {OPTION_ITEMS.map((item) => (
          <React.Fragment key={item.key}>
            <View className="mx-4 border-b border-border" />
            <Pressable
              onPress={() => onToggleOption(item.key)}
              className="flex-row items-center gap-3 px-4 py-4"
            >
              {options[item.key] ? (
                <CheckCircle size={22} color={iconColor} />
              ) : (
                <Circle size={22} className="text-muted-foreground" />
              )}
              <View className="flex-1">
                <Text className="font-medium">{item.label}</Text>
                <Text className="text-sm text-muted-foreground">
                  {item.description}
                </Text>
              </View>
            </Pressable>
          </React.Fragment>
        ))}
      </View>

      <Pressable
        onPress={onImport}
        className="mb-8 mt-8 items-center rounded-xl bg-primary px-4 py-4"
      >
        <Text className="font-bold text-primary-foreground">
          Import Workouts
        </Text>
      </Pressable>
    </View>
  );
}

function ImportingStep({
  importedCount,
  totalCount,
}: {
  importedCount: number;
  totalCount: number;
}) {
  return (
    <View className="mt-20 items-center">
      <ActivityIndicator size="large" />
      <Text className="mt-4 text-lg font-medium">Importing workouts...</Text>
      <Text className="mt-2 text-muted-foreground">
        {importedCount} of {totalCount} workouts
      </Text>
    </View>
  );
}

function CompleteStep({
  importedCount,
  skippedCount,
  iconColor,
  onDone,
}: {
  importedCount: number;
  skippedCount: number;
  iconColor: string;
  onDone: () => void;
}) {
  return (
    <View className="mt-20 items-center">
      <Check size={48} color={iconColor} />
      <Text className="mt-4 text-lg font-bold">Import Complete</Text>
      <Text className="mt-2 text-center text-muted-foreground">
        Successfully imported {importedCount} workout
        {importedCount === 1 ? '' : 's'}.
        {skippedCount > 0 &&
          `\n${skippedCount} duplicate${skippedCount === 1 ? '' : 's'} skipped.`}
      </Text>
      <Pressable
        onPress={onDone}
        className="mt-8 items-center rounded-xl bg-primary px-8 py-4"
      >
        <Text className="font-bold text-primary-foreground">Done</Text>
      </Pressable>
    </View>
  );
}
