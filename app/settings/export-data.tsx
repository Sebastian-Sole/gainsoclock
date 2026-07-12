import { useConvex } from "convex/react";
import Constants from "expo-constants";
import { File, Paths } from "expo-file-system";
import { useRouter } from "expo-router";
import * as Sharing from "expo-sharing";
import { ChevronLeft, FileJson, WifiOff } from "lucide-react-native";
import { useState } from "react";
import { Alert, Pressable, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { api } from "@/convex/_generated/api";
import { useNetwork } from "@/hooks/use-network";
import {
  EXPORT_TABLES,
  buildExportDocument,
  exportFileName,
  serializeExport,
  type ExportRow,
  type ExportTable,
} from "@/lib/data-export";

// Progress copy while each table downloads. Keys mirror EXPORT_TABLES.
const TABLE_LABELS: Record<ExportTable, string> = {
  exercises: "exercises",
  templates: "templates",
  templateExercises: "template exercises",
  workoutLogs: "workout logs",
  workoutLogExercises: "workout exercises",
  workoutSets: "workout sets",
  workoutPlans: "workout plans",
  planDays: "plan days",
  recipes: "recipes",
  ingredients: "ingredients",
  mealLogs: "meal logs",
  chatConversations: "chat conversations",
  chatMessages: "chat messages",
  externalWorkouts: "imported workouts",
  healthDailyMetrics: "health metrics",
  weeklyReviews: "weekly reviews",
  userConsents: "consent history",
  onboardingAha: "onboarding previews",
  aiSafetyIncidents: "safety records",
};

type Phase = "idle" | "exporting" | "error";

export default function ExportDataScreen() {
  const router = useRouter();
  const convex = useConvex();
  const { isOffline } = useNetwork();

  const [phase, setPhase] = useState<Phase>("idle");
  const [progressText, setProgressText] = useState<string | null>(null);

  const handleExport = async () => {
    if (isOffline) {
      Alert.alert(
        "You're offline",
        "Exporting your data needs an internet connection. Try again once you're back online."
      );
      return;
    }

    setPhase("exporting");
    setProgressText("Preparing export…");

    try {
      // Profile, settings & account info first (one small query)…
      const user = await convex.query(api.dataExport.exportUser, {});

      // …then page through every user-owned table. Pages are assembled
      // on-device so no single request can exceed Convex payload limits.
      const tables: Partial<Record<ExportTable, ExportRow[]>> = {};
      for (let i = 0; i < EXPORT_TABLES.length; i++) {
        const table = EXPORT_TABLES[i];
        setProgressText(
          `Exporting ${TABLE_LABELS[table]}… (${i + 1} of ${EXPORT_TABLES.length})`
        );
        const rows: ExportRow[] = [];
        let cursor: string | null = null;
        do {
          // Explicit annotation: `cursor` feeds the query args and is then
          // reassigned from the result, which otherwise trips TS7022.
          const result: {
            page: ExportRow[];
            isDone: boolean;
            continueCursor: string;
          } = await convex.query(api.dataExport.exportPage, {
            table,
            cursor,
          });
          rows.push(...result.page);
          cursor = result.isDone ? null : result.continueCursor;
        } while (cursor !== null);
        tables[table] = rows;
      }

      setProgressText("Writing file…");
      const exportedAt = new Date().toISOString();
      const document = buildExportDocument({
        exportedAt,
        appVersion: Constants.expoConfig?.version ?? "unknown",
        user,
        tables,
      });

      const file = new File(Paths.cache, exportFileName(exportedAt));
      file.create({ overwrite: true, intermediates: true });
      file.write(serializeExport(document));

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(file.uri, {
          mimeType: "application/json",
          dialogTitle: "Export Fitbull data",
          UTI: "public.json",
        });
        setPhase("idle");
        setProgressText(null);
      } else {
        setPhase("idle");
        setProgressText(null);
        Alert.alert(
          "Sharing unavailable",
          "This device can't open the share sheet, so the export couldn't be delivered."
        );
      }
    } catch (error) {
      if (__DEV__) console.warn("[export-data] export failed:", error);
      setPhase("error");
      setProgressText(null);
    }
  };

  const isExporting = phase === "exporting";

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      <View className="flex-row items-center gap-2 px-4 pb-2 pt-2">
        <Pressable
          onPress={() => router.back()}
          className="p-1"
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Icon as={ChevronLeft} size={24} className="text-foreground" />
        </Pressable>
        <Text className="text-3xl font-bold">Export My Data</Text>
      </View>

      <ScrollView className="flex-1 px-4">
        <View className="mt-4 rounded-xl bg-card p-4">
          <View className="flex-row items-center gap-3">
            <Icon as={FileJson} size={20} className="text-primary" />
            <Text className="flex-1 font-medium">
              Everything you&apos;ve saved, as one JSON file
            </Text>
          </View>
          <Text className="mt-3 text-sm leading-5 text-muted-foreground">
            The export includes your profile, settings, exercises, templates,
            workout logs, plans, recipes, ingredients, meals, nutrition goals,
            chat history, imported health data, weekly reviews, and consent
            history. It doesn&apos;t include sign-in credentials or payment
            details.
          </Text>
          <Text className="mt-2 text-sm leading-5 text-muted-foreground">
            Generating the file can take a little while if you have a lot of
            history. When it&apos;s ready, the share sheet opens so you can save or
            send it.
          </Text>
        </View>

        {isOffline && (
          <View
            className="mt-4 flex-row items-center gap-3 rounded-xl bg-card p-4"
            accessibilityRole="alert"
          >
            <Icon as={WifiOff} size={20} className="text-destructive" />
            <Text className="flex-1 text-sm leading-5 text-muted-foreground">
              You&apos;re offline. Exporting needs an internet connection — try
              again once you&apos;re back online.
            </Text>
          </View>
        )}

        {phase === "error" && (
          <View
            className="mt-4 rounded-xl bg-card p-4"
            accessibilityRole="alert"
          >
            <Text className="font-medium text-destructive">Export failed</Text>
            <Text className="mt-1 text-sm leading-5 text-muted-foreground">
              Something went wrong while gathering your data. Check your
              connection and try again.
            </Text>
          </View>
        )}

        <View className="mt-6 pb-8">
          <Button
            onPress={() => {
              void handleExport();
            }}
            disabled={isExporting || isOffline}
            accessibilityLabel="Export my data"
            accessibilityHint="Gathers all your data and opens the share sheet"
            accessibilityState={{
              disabled: isExporting || isOffline,
              busy: isExporting,
            }}
            testID="export-data-start"
          >
            <Text>
              {isExporting
                ? "Exporting…"
                : phase === "error"
                  ? "Try Again"
                  : "Export My Data"}
            </Text>
          </Button>

          {isExporting && progressText !== null && (
            <Text
              className="mt-3 text-center text-sm text-muted-foreground"
              accessibilityLiveRegion="polite"
            >
              {progressText}
            </Text>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
