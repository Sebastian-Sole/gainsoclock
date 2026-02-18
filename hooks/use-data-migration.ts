import { useEffect, useRef } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useTemplateStore } from "@/stores/template-store";
import { useHistoryStore } from "@/stores/history-store";
import { useSettingsStore } from "@/stores/settings-store";

const MIGRATION_KEY = "convex-migration-complete";

/**
 * One-time migration: push local AsyncStorage data to Convex on first login.
 * Uses bulkUpsert mutations that deduplicate by clientId, so it's safe to retry.
 */
export function useDataMigration() {
  const bulkUpsertTemplates = useMutation(api.templates.bulkUpsert);
  const bulkUpsertLogs = useMutation(api.workoutLogs.bulkUpsert);
  const upsertSettings = useMutation(api.settings.upsert);
  const hasRun = useRef(false);

  useEffect(() => {
    if (hasRun.current) return;
    hasRun.current = true;

    (async () => {
      const migrated = await AsyncStorage.getItem(MIGRATION_KEY);
      if (migrated === "true") return;

      const templates = useTemplateStore.getState().templates;
      const logs = useHistoryStore.getState().logs;
      const settings = useSettingsStore.getState();

      try {
        if (templates.length > 0) {
          await bulkUpsertTemplates({
            templates: templates.map((t) => ({
              clientId: t.id,
              name: t.name,
              exercises: t.exercises,
              createdAt: t.createdAt,
              updatedAt: t.updatedAt,
            })),
          });
        }

        if (logs.length > 0) {
          await bulkUpsertLogs({
            logs: logs.map((l) => ({
              clientId: l.id,
              templateId: l.templateId,
              templateName: l.templateName,
              exercises: l.exercises,
              startedAt: l.startedAt,
              completedAt: l.completedAt,
              durationSeconds: l.durationSeconds,
            })),
          });
        }

        await upsertSettings({
          weightUnit: settings.weightUnit,
          distanceUnit: settings.distanceUnit,
          defaultRestTime: settings.defaultRestTime,
          hapticsEnabled: settings.hapticsEnabled,
        });

        await AsyncStorage.setItem(MIGRATION_KEY, "true");
      } catch (err) {
        console.error("[Migration] Failed:", err);
        // Will retry on next app launch since flag was not set
      }
    })();
  }, []);
}
