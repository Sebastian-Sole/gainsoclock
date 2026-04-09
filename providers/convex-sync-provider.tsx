import React, { useEffect } from "react";
import { Platform } from "react-native";
import { useQuery, useConvexAuth, useConvex, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useTemplateStore } from "@/stores/template-store";
import { useHistoryStore } from "@/stores/history-store";
import { useSettingsStore } from "@/stores/settings-store";
import { useExerciseLibraryStore } from "@/stores/exercise-library-store";
import { useRecipeStore } from "@/stores/recipe-store";
import { useNutritionGoalsStore } from "@/stores/nutrition-goals-store";
import { useSubscriptionStore } from "@/stores/subscription-store";
import { usePlanStore } from "@/stores/plan-store";
import { setConvexClient, syncToConvex } from "@/lib/convex-sync";
import type { ExerciseType } from "@/lib/types";
import { useDataMigration } from "@/hooks/use-data-migration";
import { configurePurchases } from "@/hooks/use-purchases";
import { useNetwork } from "@/hooks/use-network";
import { useNotificationSetup } from "@/hooks/use-notification-setup";

// Lazy-load Purchases to avoid crash when native module isn't linked
let Purchases: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const rnpModule = require("react-native-purchases");
  Purchases = rnpModule.default ?? rnpModule;
} catch {
  // Native module not available
}

export function ConvexSyncProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isAuthenticated } = useConvexAuth();
  const convex = useConvex();

  // Register the Convex client so stores can fire mutations
  useEffect(() => {
    setConvexClient(convex);
  }, [convex]);

  return (
    <>
      {isAuthenticated && <SyncEngine />}
      {children}
    </>
  );
}

function SyncEngine() {
  const { isOffline } = useNetwork();
  const exercises = useQuery(api.exercises.list);
  const templates = useQuery(api.templates.listWithExercises);
  const loadedRange = useHistoryStore((s) => s.loadedRange);
  const logs = useQuery(api.workoutLogs.listMeta, {
    from: loadedRange.from,
    to: loadedRange.to,
  });
  const settings = useQuery(api.settings.get);
  const recipes = useQuery(api.recipes.listRecipes);
  const nutritionGoals = useQuery(api.nutritionGoals.get);
  const subscription = useQuery(api.subscriptions.getStatus);
  const plans = useQuery(api.plans.listPlans);
  const activePlanWithDays = useQuery(api.plans.getActivePlanWithDays);
  const userId = useQuery(api.user.me);
  const registerCurrentUser = useMutation(api.subscriptions.registerCurrentUser);

  // Run one-time migration of local data to Convex
  useDataMigration();

  // Set up notification scheduling (recurring reminders, morning plan alerts)
  useNotificationSetup();

  // Initialize RevenueCat SDK
  useEffect(() => {
    if (Platform.OS === "web") return;
    configurePurchases();
  }, []);

  // Identify RevenueCat user with Convex userId (skip when offline to avoid warnings)
  useEffect(() => {
    if (!userId || Platform.OS === "web" || !Purchases || isOffline) return;
    Purchases.logIn(userId)
      .then(() => registerCurrentUser())
      .catch((err: unknown) => console.warn("[Purchases] logIn failed:", err));
  }, [registerCurrentUser, userId, isOffline]);

  // Hydrate exercise library from server, supplementing with exercises found in templates/logs
  useEffect(() => {
    if (exercises === undefined) return;

    const knownIds = new Set(exercises.map((e) => e.clientId));
    const extras: Array<{ clientId: string; name: string; type: ExerciseType; createdAt: string }> = [];

    // Extract exercises embedded in local templates that may not exist in the exercises table
    const localTemplates = useTemplateStore.getState().templates;
    for (const t of localTemplates) {
      for (const e of t.exercises) {
        if (!knownIds.has(e.exerciseId)) {
          knownIds.add(e.exerciseId);
          extras.push({
            clientId: e.exerciseId,
            name: e.name,
            type: e.type,
            createdAt: t.createdAt,
          });
        }
      }
    }

    // Extract exercises embedded in local workout logs
    const localLogs = useHistoryStore.getState().logs;
    for (const log of localLogs) {
      if (!log.exercises) continue;
      for (const e of log.exercises) {
        if (!knownIds.has(e.exerciseId)) {
          knownIds.add(e.exerciseId);
          extras.push({
            clientId: e.exerciseId,
            name: e.name,
            type: e.type,
            createdAt: log.completedAt,
          });
        }
      }
    }

    const allExercises = [...exercises, ...extras];
    useExerciseLibraryStore.getState().hydrateFromServer(allExercises);

    // Backfill any missing exercises to Convex so they persist
    if (extras.length > 0) {
      syncToConvex(api.exercises.bulkUpsert, {
        exercises: extras.map((e) => ({
          clientId: e.clientId,
          name: e.name,
          type: e.type,
          createdAt: e.createdAt,
        })),
      });
    }
  }, [exercises, templates, logs]);

  // Hydrate template store from server
  useEffect(() => {
    if (templates === undefined) return;
    useTemplateStore.getState().hydrateFromServer(templates);
  }, [templates]);

  // Hydrate history store from server
  useEffect(() => {
    if (logs === undefined) return;
    useHistoryStore.getState().hydrateFromServer(logs);
    useHistoryStore.getState().setIsLoadingMore(false);
  }, [logs]);

  // Hydrate settings store from server
  useEffect(() => {
    if (settings === undefined || settings === null) return;
    useSettingsStore.getState().hydrateFromServer(settings);
  }, [settings]);

  // Hydrate recipe store from server
  useEffect(() => {
    if (recipes === undefined) return;
    useRecipeStore.getState().hydrateFromServer(recipes);
  }, [recipes]);

  // Hydrate nutrition goals from server
  useEffect(() => {
    if (nutritionGoals === undefined || nutritionGoals === null) return;
    useNutritionGoalsStore.getState().hydrateFromServer(nutritionGoals);
  }, [nutritionGoals]);

  // Hydrate plan store from server
  useEffect(() => {
    if (plans === undefined) return;
    usePlanStore.getState().hydrateFromServer(plans);
  }, [plans]);

  // Hydrate active plan with days from server
  useEffect(() => {
    if (activePlanWithDays === undefined) return;
    usePlanStore.getState().hydrateActivePlanFromServer(activePlanWithDays);
  }, [activePlanWithDays]);

  // Hydrate subscription store from server
  useEffect(() => {
    if (subscription === undefined) return;
    useSubscriptionStore.getState().hydrateFromServer(subscription);
  }, [subscription]);

  return null;
}
