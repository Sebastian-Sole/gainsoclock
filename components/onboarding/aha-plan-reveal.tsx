import { forwardRef } from "react";
import { View } from "react-native";

import { Text } from "@/components/ui/text";
import type { AhaExercise, AhaWorkout } from "@/lib/aha-schema";

type Props = {
  workout: AhaWorkout;
};

function ExerciseRow({ exercise }: { exercise: AhaExercise }) {
  return (
    <View className="gap-1 rounded-lg border border-border bg-card px-3 py-2">
      <Text className="text-sm font-semibold">
        {exercise.exerciseId}
      </Text>
      <Text className="text-xs text-muted-foreground">
        {exercise.sets} × {exercise.reps} · {exercise.restSeconds}s rest
      </Text>
      <Text className="text-xs text-foreground/80">
        {exercise.coachingNote}
      </Text>
    </View>
  );
}

function Section({
  title,
  exercises,
}: {
  title: string;
  exercises: AhaExercise[];
}) {
  return (
    <View className="mt-4 gap-2">
      <Text className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </Text>
      <View className="gap-2">
        {exercises.map((ex) => (
          <ExerciseRow key={ex.exerciseId} exercise={ex} />
        ))}
      </View>
    </View>
  );
}

export const AhaPlanReveal = forwardRef<View, Props>(function AhaPlanReveal(
  { workout },
  ref
) {
  const { workout: main, warmup, cooldown, intro } = workout;
  const summaryLabel = `Your first session: ${main.name}, ${main.durationMinutes} minutes, ${main.exercises.length} exercises.`;

  return (
    <View className="gap-3" accessible={false}>
      <View
        ref={ref}
        accessible
        accessibilityRole="header"
        accessibilityLabel={summaryLabel}
      >
        <Text variant="h3">{main.name}</Text>
        <Text className="mt-1 text-sm text-muted-foreground">
          {main.durationMinutes} min · {main.targetMuscleGroups.join(" · ")}
        </Text>
      </View>

      <Text className="text-base leading-6">{intro}</Text>

      <Section title="Warmup" exercises={warmup.exercises} />
      <Section title="Workout" exercises={main.exercises} />
      <Section title="Cooldown" exercises={cooldown.exercises} />
    </View>
  );
});
