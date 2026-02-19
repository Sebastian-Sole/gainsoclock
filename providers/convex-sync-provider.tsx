import React, { useEffect } from "react";
import { useQuery, useConvexAuth, useConvex } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useTemplateStore } from "@/stores/template-store";
import { useHistoryStore } from "@/stores/history-store";
import { useSettingsStore } from "@/stores/settings-store";
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
  const templates = useQuery(api.templates.list);
  const logs = useQuery(api.workoutLogs.list);
  const settings = useQuery(api.settings.get);

  // Run one-time migration of local data to Convex
  useDataMigration();

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

  return null;
}
