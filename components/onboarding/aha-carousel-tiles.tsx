import { useState } from "react";
import { Pressable, View } from "react-native";

import { Text } from "@/components/ui/text";
import {
  approxMaintenanceCalories,
  mifflinStJeorBmr,
  type BiologicalSex,
} from "@/lib/bmr";
import { useReduceMotion } from "@/hooks/use-reduce-motion";

const DAY_SHORT: Record<number, string> = {
  0: "Sun",
  1: "Mon",
  2: "Tue",
  3: "Wed",
  4: "Thu",
  5: "Fri",
  6: "Sat",
};

type Profile = {
  weightKg?: number;
  heightCm?: number;
  ageYears?: number;
  biologicalSex?: BiologicalSex;
  trainingDaysOfWeek: number[];
};

type TileProps = {
  title: string;
  value: string;
  detail: string;
  testID?: string;
};

function Tile({ title, value, detail, testID }: TileProps) {
  const reduceMotion = useReduceMotion();
  const [expanded, setExpanded] = useState(false);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}: ${value}`}
      accessibilityHint="Double-tap for more detail"
      accessibilityState={{ expanded }}
      onPress={() => setExpanded((v) => !v)}
      className="rounded-xl border border-border bg-card px-4 py-3"
      testID={testID}
    >
      <Text className="text-xs uppercase tracking-wide text-muted-foreground">
        {title}
      </Text>
      <Text className="mt-1 text-base font-semibold">{value}</Text>
      {expanded ? (
        <Text
          className={`mt-2 text-xs text-muted-foreground ${
            reduceMotion ? "" : ""
          }`}
        >
          {detail}
        </Text>
      ) : null}
    </Pressable>
  );
}

type Props = {
  profile: Profile;
  planSummary: string;
};

export function AhaCarouselTiles({ profile, planSummary }: Props) {
  const { weightKg, heightCm, ageYears, biologicalSex, trainingDaysOfWeek } =
    profile;

  const canComputeCalories =
    weightKg !== undefined &&
    heightCm !== undefined &&
    ageYears !== undefined &&
    biologicalSex !== undefined;

  const calorieValue = canComputeCalories
    ? (() => {
        const bmr = mifflinStJeorBmr({
          weightKg: weightKg!,
          heightCm: heightCm!,
          ageYears: ageYears!,
          sex: biologicalSex!,
        });
        // activityLevel is a ForbiddenKey — never leaks to PostHog; this value
        // is display-only on the tile (master plan §3.3).
        return `${approxMaintenanceCalories(bmr, "moderate")} kcal/day`;
      })()
    : "Add weight + height to see your calorie target";

  const calorieDetail = canComputeCalories
    ? "Approximate maintenance calories — moderate activity, Mifflin-St Jeor."
    : "We need weight, height, age, and biological sex to estimate this.";

  const scheduleValue = trainingDaysOfWeek.length
    ? trainingDaysOfWeek
        .slice()
        .sort((a, b) => a - b)
        .map((d) => DAY_SHORT[d] ?? "?")
        .join(" · ")
    : "—";

  return (
    <View className="mt-4 gap-2">
      <Tile
        title="Calorie target"
        value={calorieValue}
        detail={calorieDetail}
        testID="aha-tile-calorie"
      />
      <Tile
        title="Training schedule"
        value={scheduleValue}
        detail={`${trainingDaysOfWeek.length} sessions each week.`}
        testID="aha-tile-schedule"
      />
      <Tile
        title="Plan summary"
        value="Your first session"
        detail={planSummary}
        testID="aha-tile-summary"
      />
    </View>
  );
}
