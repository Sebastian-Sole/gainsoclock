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
import { setConvexClient } from "@/lib/convex-sync";
import { useDataMigration } from "@/hooks/use-data-migration";
import { configurePurchases } from "@/hooks/use-purchases";
import { useNetwork } from "@/hooks/use-network";

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
  const logs = useQuery(api.workoutLogs.listMeta);
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

  // Hydrate exercise library from server
  useEffect(() => {
    if (exercises === undefined) return;
    useExerciseLibraryStore.getState().hydrateFromServer(exercises);
  }, [exercises]);

  // Hydrate template store from server
  useEffect(() => {
    if (templates === undefined) return;
    useTemplateStore.getState().hydrateFromServer(templates);
  }, [templates]);

  // Hydrate history store from server
  useEffect(() => {
    if (logs === undefined) return;
    useHistoryStore.getState().hydrateFromServer(logs);
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
