import { useEffect, useRef } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useTemplateStore } from "@/stores/template-store";
import { useHistoryStore } from "@/stores/history-store";
import { useSettingsStore } from "@/stores/settings-store";
import { generateId } from "@/lib/id";
import type { ExerciseType } from "@/lib/types";

const MIGRATION_KEY = "convex-migration-v2-complete";

type AnyExercise = Record<string, unknown>;

/**
 * Detect whether an exercise object is in the old embedded format
 * (has `sets` array, no `exerciseId`) vs new normalized format.
 */
function isOldFormatExercise(e: AnyExercise): boolean {
  return !("exerciseId" in e) || e.exerciseId === undefined;
}

/**
 * Build a stable exercise library ID from name+type.
 * For old-format data we need to generate exerciseIds deterministically
 * so the same exercise name maps to the same ID across templates and logs.
 */
function getExerciseKey(name: string, type: string): string {
  return `${name.toLowerCase()}::${type}`;
}

/**
 * One-time migration: push local AsyncStorage data to Convex.
 * Handles both old embedded format and new normalized format.
 * Uses bulkUpsert mutations that deduplicate by clientId, so it's safe to retry.
 */
export function useDataMigration() {
  const bulkUpsertTemplates = useMutation(api.templates.bulkUpsert);
  const bulkUpsertLogs = useMutation(api.workoutLogs.bulkUpsert);
  const bulkUpsertExercises = useMutation(api.exercises.bulkUpsert);
  const upsertSettings = useMutation(api.settings.upsert);
  const hasRun = useRef(false);

  useEffect(() => {
    if (hasRun.current) return;
    hasRun.current = true;

    (async () => {
      const migrated = await AsyncStorage.getItem(MIGRATION_KEY);
      if (migrated === "true") return;

      // Read raw data from stores (may be old or new format)
      const templates = useTemplateStore.getState().templates as unknown as Array<Record<string, unknown>>;
      const logs = useHistoryStore.getState().logs as unknown as Array<Record<string, unknown>>;
      const settings = useSettingsStore.getState();

      try {
        // Build a map of unique exercises (keyed by name+type for dedup)
        const exerciseMap = new Map<string, { id: string; name: string; type: string }>();

        function ensureExercise(name: string, type: string): string {
          const key = getExerciseKey(name, type);
          if (!exerciseMap.has(key)) {
            exerciseMap.set(key, { id: generateId(), name, type });
          }
          return exerciseMap.get(key)!.id;
        }

        // Scan all exercises from templates
        for (const t of templates) {
          const exercises = (t.exercises ?? []) as AnyExercise[];
          for (const e of exercises) {
            const name = e.name as string;
            const type = e.type as string;
            if (isOldFormatExercise(e)) {
              ensureExercise(name, type);
            } else {
              const exerciseId = e.exerciseId as string;
              const key = getExerciseKey(name, type);
              if (!exerciseMap.has(key)) {
                exerciseMap.set(key, { id: exerciseId, name, type });
              }
            }
          }
        }

        // Scan all exercises from logs
        for (const l of logs) {
          const exercises = (l.exercises ?? []) as AnyExercise[];
          for (const e of exercises) {
            const name = e.name as string;
            const type = e.type as string;
            if (isOldFormatExercise(e)) {
              ensureExercise(name, type);
            } else {
              const exerciseId = e.exerciseId as string;
              const key = getExerciseKey(name, type);
              if (!exerciseMap.has(key)) {
                exerciseMap.set(key, { id: exerciseId, name, type });
              }
            }
          }
        }

        // Upsert exercises
        const uniqueExercises = Array.from(exerciseMap.values());
        if (uniqueExercises.length > 0) {
          await bulkUpsertExercises({
            exercises: uniqueExercises.map((e) => ({
              clientId: e.id,
              name: e.name,
              type: e.type as ExerciseType,
              createdAt: new Date().toISOString(),
            })),
          });
        }

        // Migrate templates
        if (templates.length > 0) {
          await bulkUpsertTemplates({
            templates: templates.map((t) => {
              const exercises = (t.exercises ?? []) as AnyExercise[];
              return {
                clientId: t.id as string,
                name: t.name as string,
                createdAt: t.createdAt as string,
                updatedAt: t.updatedAt as string,
                exercises: exercises.map((e, i) => {
                  const name = e.name as string;
                  const type = e.type as string;
                  const isOld = isOldFormatExercise(e);
                  const exerciseId = isOld
                    ? exerciseMap.get(getExerciseKey(name, type))!.id
                    : (e.exerciseId as string);

                  return {
                    clientId: (e.id as string) ?? generateId(),
                    exerciseClientId: exerciseId,
                    exerciseName: name,
                    exerciseType: type as ExerciseType,
                    order: isOld ? i : ((e.order as number) ?? i),
                    restTimeSeconds: (e.restTimeSeconds as number) ?? 90,
                    defaultSetsCount: isOld
                      ? (Array.isArray(e.sets) ? (e.sets as unknown[]).length : 3)
                      : ((e.defaultSetsCount as number) ?? 3),
                  };
                }),
              };
            }),
          });
        }

        // Migrate workout logs
        if (logs.length > 0) {
          await bulkUpsertLogs({
            logs: logs.map((l) => {
              const exercises = (l.exercises ?? []) as AnyExercise[];
              return {
                clientId: l.id as string,
                templateId: l.templateId as string | undefined,
                templateName: l.templateName as string,
                startedAt: l.startedAt as string,
                completedAt: l.completedAt as string,
                durationSeconds: l.durationSeconds as number,
                exercises: exercises.map((e, i) => {
                  const name = e.name as string;
                  const type = e.type as string;
                  const isOld = isOldFormatExercise(e);
                  const exerciseId = isOld
                    ? exerciseMap.get(getExerciseKey(name, type))!.id
                    : (e.exerciseId as string);

                  const sets = (e.sets ?? []) as Array<Record<string, unknown>>;

                  return {
                    clientId: isOld ? generateId() : (e.id as string),
                    exerciseClientId: exerciseId,
                    order: isOld ? i : ((e.order as number) ?? i),
                    restTimeSeconds: (e.restTimeSeconds as number) ?? 90,
                    sets: sets.map((s, si) => ({
                      clientId: (s.id as string) ?? generateId(),
                      order: si,
                      completed: (s.completed as boolean) ?? false,
                      type: (s.type as ExerciseType) ?? type,
                      ...(s.reps !== undefined && { reps: s.reps as number }),
                      ...(s.weight !== undefined && { weight: s.weight as number }),
                      ...(s.time !== undefined && { time: s.time as number }),
                      ...(s.distance !== undefined && { distance: s.distance as number }),
                    })),
                  };
                }),
              };
            }),
          });
        }

        await upsertSettings({
          weightUnit: settings.weightUnit,
          distanceUnit: settings.distanceUnit,
          defaultRestTime: settings.defaultRestTime,
          hapticsEnabled: settings.hapticsEnabled,
        });

        // Clear old-format persisted stores so they re-hydrate from server
        await AsyncStorage.removeItem("template-storage");
        await AsyncStorage.removeItem("history-storage");

        await AsyncStorage.setItem(MIGRATION_KEY, "true");
      } catch (err) {
        console.error("[Migration] Failed:", err);
        // Will retry on next app launch since flag was not set
      }
    })();
  }, []);
}
