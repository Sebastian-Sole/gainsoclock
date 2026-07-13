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
import { Icon } from '@/components/ui/icon';
import * as DocumentPicker from 'expo-document-picker';
import { format } from 'date-fns';

import { cn } from '@/lib/utils';
import { useHistoryStore } from '@/stores/history-store';
import { useExerciseLibraryStore } from '@/stores/exercise-library-store';
import { useTemplateStore } from '@/stores/template-store';
import type {
  ImportOptions,
  ImportSummary,
  ParsedCsvImport,
} from '@/lib/import/shared';
import type { ExerciseType, TemplateExercise, WorkoutLog } from '@/lib/types';
import { metricsForLegacyType } from '@/lib/metrics';
import { generateId } from '@/lib/id';

type Step = 'instructions' | 'options' | 'importing' | 'complete';
type DuplicateHandling = 'skip' | 'replace';

interface OptionItem {
  key: keyof ImportOptions;
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

export interface CsvImportFlowProps {
  /** Screen title, e.g. "Strong". */
  title: string;
  /** Section header above the instructions, e.g. "HOW TO EXPORT FROM STRONG". */
  instructionsTitle: string;
  /** Rendered inside the instructions card — source-specific export steps. */
  instructions: React.ReactNode;
  /** Hint under the file picker, e.g. "Tap to choose your Strong export file". */
  pickerHint: string;
  /** Parse a CSV string into the source-agnostic import handle. */
  parse: (csv: string) => ParsedCsvImport;
}

/**
 * Shared import flow: pick CSV file → summary + options + duplicate handling
 * → import into history (skipping/replacing duplicate sessions, keyed on
 * startedAt|completedAt) → create templates from workout names.
 */
export function CsvImportFlow({
  title,
  instructionsTitle,
  instructions,
  pickerHint,
  parse,
}: CsvImportFlowProps) {
  const router = useRouter();
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === 'dark';
  const iconColor = isDark ? '#fb923c' : '#f97316';

  const addLog = useHistoryStore((s) => s.addLog);
  const updateLog = useHistoryStore((s) => s.updateLog);
  const existingLogs = useHistoryStore((s) => s.logs);
  const getOrCreate = useExerciseLibraryStore((s) => s.getOrCreate);
  const addTemplate = useTemplateStore((s) => s.addTemplate);
  const existingTemplates = useTemplateStore((s) => s.templates);

  const [step, setStep] = useState<Step>('instructions');
  const [parsed, setParsed] = useState<ParsedCsvImport | null>(null);
  const [options, setOptions] = useState<ImportOptions>({
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

  // Existing workout session keys for duplicate detection
  const existingTimestamps = useMemo(() => {
    const set = new Set<string>();
    for (const log of existingLogs) {
      set.add(`${log.startedAt}|${log.completedAt}`);
    }
    return set;
  }, [existingLogs]);

  const duplicateCount = useMemo(() => {
    if (!parsed) return 0;
    let count = 0;
    for (const key of parsed.sessionKeys) {
      if (existingTimestamps.has(key)) count++;
    }
    return count;
  }, [parsed, existingTimestamps]);

  const toggleOption = (key: keyof ImportOptions) => {
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
      const parsedImport = parse(csvString);

      if (parsedImport.setCount === 0) {
        Alert.alert(
          'No Data Found',
          'The CSV file appears to be empty or in an unexpected format.'
        );
        setIsPicking(false);
        return;
      }

      setParsed(parsedImport);
      setStep('options');
    } catch {
      Alert.alert('Error', 'Failed to read the CSV file. Please try again.');
    }
    setIsPicking(false);
  }, [parse]);

  const handleImport = useCallback(async () => {
    if (!parsed) return;
    setStep('importing');

    const exerciseResolver = (name: string, type: ExerciseType): string => {
      const exercise = getOrCreate(name, type, metricsForLegacyType(type));
      return exercise.id;
    };

    const logs = parsed.buildLogs(options, exerciseResolver);

    // Lookup existing logs by session key for duplicate handling
    const existingByTimestamp = new Map<string, string>();
    for (const log of existingLogs) {
      existingByTimestamp.set(`${log.startedAt}|${log.completedAt}`, log.id);
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
        // Replace: update existing in place (avoids race with server hydration)
        updateLog(existingId, {
          templateName: log.templateName,
          exercises: log.exercises,
          startedAt: log.startedAt,
          completedAt: log.completedAt,
          durationSeconds: log.durationSeconds,
        });
      } else {
        addLog(log);
      }

      imported++;
      setImportedCount(imported);

      if (imported % 10 === 0) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }

    // Create templates from unique workout names
    const existingTemplateNames = new Set(
      existingTemplates.map((t) => t.name.toLowerCase())
    );
    const templatesByName = new Map<string, WorkoutLog>();
    for (const log of logs) {
      if (
        log.templateName &&
        !existingTemplateNames.has(log.templateName.toLowerCase()) &&
        !templatesByName.has(log.templateName.toLowerCase())
      ) {
        templatesByName.set(log.templateName.toLowerCase(), log);
      }
    }

    for (const [, log] of templatesByName) {
      const templateExercises: TemplateExercise[] = log.exercises.map(
        (ex, i) => ({
          id: generateId(),
          exerciseId: ex.exerciseId,
          name: ex.name,
          type: ex.type,
          metrics: ex.metrics,
          order: i,
          restTimeSeconds: ex.restTimeSeconds,
          defaultSetsCount: ex.sets.length || 3,
        })
      );
      addTemplate(log.templateName, templateExercises);
    }

    setImportedCount(imported);
    setSkippedCount(skipped);
    setStep('complete');
  }, [
    parsed,
    options,
    getOrCreate,
    addLog,
    updateLog,
    existingLogs,
    existingTemplates,
    addTemplate,
    duplicateHandling,
  ]);

  const allSelected = Object.values(options).every(Boolean);

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <View className="flex-row items-center gap-3 px-4 pb-4 pt-4">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back"
          onPress={() => {
            if (step === 'importing') return;
            router.back();
          }}
        >
          <Icon as={ArrowLeft} size={24} className="text-foreground" />
        </Pressable>
        <Text className="text-3xl font-bold">{title}</Text>
      </View>

      <ScrollView className="flex-1 px-4">
        {step === 'instructions' && (
          <View>
            <Text className="mb-3 mt-4 text-sm font-medium text-muted-foreground">
              {instructionsTitle}
            </Text>
            <View className="rounded-xl bg-card px-4 py-4">{instructions}</View>

            <Text className="mb-3 mt-8 text-sm font-medium text-muted-foreground">
              UPLOAD FILE
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Select CSV file"
              accessibilityHint={pickerHint}
              accessibilityState={{ disabled: isPicking, busy: isPicking }}
              onPress={handlePickFile}
              disabled={isPicking}
              className="items-center justify-center rounded-xl border-2 border-dashed border-border bg-card px-4 py-8"
            >
              {isPicking ? (
                <ActivityIndicator color={iconColor} />
              ) : (
                <>
                  <Icon as={FileUp} size={32} className="text-primary" />
                  <Text className="mt-3 font-medium">Select CSV File</Text>
                  <Text className="mt-1 text-sm text-muted-foreground">
                    {pickerHint}
                  </Text>
                </>
              )}
            </Pressable>
          </View>
        )}

        {step === 'options' && parsed && (
          <OptionsStep
            summary={parsed.summary}
            options={options}
            allSelected={allSelected}
            duplicateCount={duplicateCount}
            duplicateHandling={duplicateHandling}
            onSetDuplicateHandling={setDuplicateHandling}
            onToggleOption={toggleOption}
            onToggleAll={toggleAll}
            onImport={handleImport}
          />
        )}

        {step === 'importing' && parsed && (
          <ImportingStep
            importedCount={importedCount}
            totalCount={parsed.summary.workoutCount}
          />
        )}

        {step === 'complete' && (
          <CompleteStep
            importedCount={importedCount}
            skippedCount={skippedCount}
            onDone={() => router.dismissAll()}
          />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function OptionsStep({
  summary,
  options,
  allSelected,
  duplicateCount,
  duplicateHandling,
  onSetDuplicateHandling,
  onToggleOption,
  onToggleAll,
  onImport,
}: {
  summary: ImportSummary;
  options: ImportOptions;
  allSelected: boolean;
  duplicateCount: number;
  duplicateHandling: DuplicateHandling;
  onSetDuplicateHandling: (handling: DuplicateHandling) => void;
  onToggleOption: (key: keyof ImportOptions) => void;
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
              <Icon as={AlertTriangle} size={20} className="text-yellow-500" />
              <Text className="flex-1 text-sm text-foreground">
                {duplicateCount} workout{duplicateCount === 1 ? '' : 's'} already
                exist{duplicateCount === 1 ? 's' : ''} in your history.
              </Text>
            </View>
            <View className="mt-3 flex-row rounded-lg bg-secondary">
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Skip duplicates"
                accessibilityState={{ selected: duplicateHandling === 'skip' }}
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
                accessibilityRole="button"
                accessibilityLabel="Replace existing"
                accessibilityState={{
                  selected: duplicateHandling === 'replace',
                }}
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
          accessibilityRole="checkbox"
          accessibilityLabel="Import all"
          accessibilityState={{ checked: allSelected }}
          onPress={onToggleAll}
          className="flex-row items-center gap-3 px-4 py-4"
        >
          {allSelected ? (
            <Icon as={CheckCircle} size={22} className="text-primary" />
          ) : (
            <Icon as={Circle} size={22} className="text-muted-foreground" />
          )}
          <Text className="flex-1 font-bold">Import All</Text>
        </Pressable>

        {OPTION_ITEMS.map((item) => (
          <React.Fragment key={item.key}>
            <View className="mx-4 border-b border-border" />
            <Pressable
              accessibilityRole="checkbox"
              accessibilityLabel={item.label}
              accessibilityHint={item.description}
              accessibilityState={{ checked: options[item.key] }}
              onPress={() => onToggleOption(item.key)}
              className="flex-row items-center gap-3 px-4 py-4"
            >
              {options[item.key] ? (
                <Icon as={CheckCircle} size={22} className="text-primary" />
              ) : (
                <Icon as={Circle} size={22} className="text-muted-foreground" />
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
        accessibilityRole="button"
        accessibilityLabel="Import workouts"
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
  onDone,
}: {
  importedCount: number;
  skippedCount: number;
  onDone: () => void;
}) {
  return (
    <View className="mt-20 items-center">
      <Icon as={Check} size={48} className="text-primary" />
      <Text className="mt-4 text-lg font-bold">Import Complete</Text>
      <Text className="mt-2 text-center text-muted-foreground">
        Successfully imported {importedCount} workout
        {importedCount === 1 ? '' : 's'}.
        {skippedCount > 0 &&
          `\n${skippedCount} duplicate${skippedCount === 1 ? '' : 's'} skipped.`}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Done"
        onPress={onDone}
        className="mt-8 items-center rounded-xl bg-primary px-8 py-4"
      >
        <Text className="font-bold text-primary-foreground">Done</Text>
      </Pressable>
    </View>
  );
}
