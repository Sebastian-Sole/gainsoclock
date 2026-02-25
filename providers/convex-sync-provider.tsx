import React, { useEffect } from "react";
import { Platform } from "react-native";
import { useQuery, useConvexAuth, useConvex } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useTemplateStore } from "@/stores/template-store";
import { useHistoryStore } from "@/stores/history-store";
import { useSettingsStore } from "@/stores/settings-store";
import { useExerciseLibraryStore } from "@/stores/exercise-library-store";
import { useSubscriptionStore } from "@/stores/subscription-store";
import { setConvexClient } from "@/lib/convex-sync";
import { useDataMigration } from "@/hooks/use-data-migration";
import { configurePurchases } from "@/hooks/use-purchases";

// Lazy-load Purchases to avoid crash when native module isn't linked
let Purchases: any = null;
try {
  Purchases = require("react-native-purchases").default;
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
  const exercises = useQuery(api.exercises.list);
  const templates = useQuery(api.templates.listWithExercises);
  const logs = useQuery(api.workoutLogs.listMeta);
  const settings = useQuery(api.settings.get);
  const subscription = useQuery(api.subscriptions.getStatus);
  const userId = useQuery(api.user.me);

  // Run one-time migration of local data to Convex
  useDataMigration();

  // Initialize RevenueCat SDK
  useEffect(() => {
    if (Platform.OS === "web") return;
    configurePurchases();
  }, []);

  // Identify RevenueCat user with Convex userId
  useEffect(() => {
    if (!userId || Platform.OS === "web" || !Purchases) return;
    Purchases.logIn(userId).catch((err: unknown) =>
      console.warn("[Purchases] logIn failed:", err)
    );
  }, [userId]);

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

  // Hydrate subscription store from server
  useEffect(() => {
    if (subscription === undefined) return;
    useSubscriptionStore.getState().hydrateFromServer(subscription);
  }, [subscription]);

  return null;
}
