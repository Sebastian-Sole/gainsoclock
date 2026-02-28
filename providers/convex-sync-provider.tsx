import React, { useEffect } from "react";
import { useQuery, useConvexAuth, useConvex } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useTemplateStore } from "@/stores/template-store";
import { useHistoryStore } from "@/stores/history-store";
import { useSettingsStore } from "@/stores/settings-store";
import { useExerciseLibraryStore } from "@/stores/exercise-library-store";
import { useRecipeStore } from "@/stores/recipe-store";
import { useNutritionGoalsStore } from "@/stores/nutrition-goals-store";
import { setConvexClient } from "@/lib/convex-sync";
import { useDataMigration } from "@/hooks/use-data-migration";

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
  const exercises = useQuery(api.exercises.list);
  const templates = useQuery(api.templates.listWithExercises);
  const logs = useQuery(api.workoutLogs.listMeta);
  const settings = useQuery(api.settings.get);
  const recipes = useQuery(api.recipes.listRecipes);
  const nutritionGoals = useQuery(api.nutritionGoals.get);

  // Run one-time migration of local data to Convex
  useDataMigration();

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

  return null;
}
