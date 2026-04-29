import { Pressable, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { Pencil } from 'lucide-react-native';

import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { useIntakeDraftStore } from '@/stores/intake-draft-store';

const GOAL_LABEL: Record<string, string> = {
  stronger: 'Stronger',
  leaner: 'Leaner',
  healthier: 'Healthier',
  routine: 'Routine',
};

const EXPERIENCE_LABEL: Record<string, string> = {
  beginner: 'Beginner',
  returning: 'Returning',
  experienced: 'Experienced',
};

const DAY_SHORT: Record<number, string> = {
  0: 'Sun',
  1: 'Mon',
  2: 'Tue',
  3: 'Wed',
  4: 'Thu',
  5: 'Fri',
  6: 'Sat',
};

function formatGoals(goals: string[] | undefined, primary: string | undefined): string {
  if (!goals || goals.length === 0) return '—';
  const ordered = primary
    ? [primary, ...goals.filter((g) => g !== primary)]
    : goals;
  return ordered.map((g) => GOAL_LABEL[g] ?? g).join(', ');
}

function formatDays(days: number[] | undefined): string {
  if (!days || days.length === 0) return '—';
  return [...days].sort((a, b) => a - b).map((d) => DAY_SHORT[d] ?? '').join(', ');
}

type Row = {
  label: string;
  value: string;
  editPath: Href;
  editTestID: string;
};

export function IntakeSummaryList() {
  const router = useRouter();
  const goals = useIntakeDraftStore((s) => s.goals);
  const primaryGoal = useIntakeDraftStore((s) => s.primaryGoal);
  const experience = useIntakeDraftStore((s) => s.experience);
  const trainingDaysOfWeek = useIntakeDraftStore((s) => s.trainingDaysOfWeek);
  const weightKg = useIntakeDraftStore((s) => s.weightKg);
  const heightCm = useIntakeDraftStore((s) => s.heightCm);
  const ageYears = useIntakeDraftStore((s) => s.ageYears);

  const rows: Row[] = [
    {
      label: 'Goal',
      value: formatGoals(goals, primaryGoal),
      editPath: '/onboarding/goal' as Href,
      editTestID: 'intake-summary-edit-goal',
    },
    {
      label: 'Experience',
      value: experience ? (EXPERIENCE_LABEL[experience] ?? experience) : '—',
      editPath: '/onboarding/experience' as Href,
      editTestID: 'intake-summary-edit-experience',
    },
    {
      label: 'Days',
      value: formatDays(trainingDaysOfWeek),
      editPath: '/onboarding/days' as Href,
      editTestID: 'intake-summary-edit-days',
    },
  ];

  const statsValue = [
    weightKg != null ? `${weightKg} kg` : null,
    heightCm != null ? `${heightCm} cm` : null,
    ageYears != null ? `${ageYears} yrs` : null,
  ]
    .filter((v): v is string => v !== null)
    .join(' · ');

  if (statsValue.length > 0) {
    rows.push({
      label: 'Stats',
      value: statsValue,
      editPath: '/onboarding/manual-stats' as Href,
      editTestID: 'intake-summary-edit-stats',
    });
  }

  return (
    <View className="gap-2">
      {rows.map((row) => (
        <View
          key={row.label}
          className="flex-row items-center justify-between rounded-xl border border-border bg-card px-4 py-3"
        >
          <View className="flex-1 pr-3">
            <Text className="text-xs uppercase tracking-wide text-muted-foreground">
              {row.label}
            </Text>
            <Text className="mt-0.5 text-base font-medium">{row.value}</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${row.label}: ${row.value}`}
            accessibilityHint="Double-tap to edit"
            onPress={() => router.push(row.editPath)}
            hitSlop={10}
            className="h-10 w-10 items-center justify-center rounded-full border border-border bg-background"
            testID={row.editTestID}
          >
            <Icon as={Pencil} size={16} className="text-foreground" />
          </Pressable>
        </View>
      ))}
    </View>
  );
}
