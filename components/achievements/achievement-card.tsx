import { format } from 'date-fns';
import { icons, Lock, Trophy, type LucideIcon } from 'lucide-react-native';
import { View } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { Progress } from '@/components/ui/progress';
import { Text } from '@/components/ui/text';
import type { AchievementDef, AchievementTier } from '@/lib/achievements';
import { cn } from '@/lib/utils';

// `AchievementDef.icon` is a lucide export name (string), so look components
// up in the `icons` map. Widened to a string-keyed record — no cast needed,
// every value is a LucideIcon.
const ICON_BY_NAME: Record<string, LucideIcon> = icons;

/** Resolve an achievement's lucide icon by name, falling back to Trophy. */
export function getAchievementIcon(name: string): LucideIcon {
  return ICON_BY_NAME[name] ?? Trophy;
}

// Tier tints derived from the primary token (the theme has no metallic
// tokens): heavier primary saturation = higher tier. Calibrated for both
// light and dark since `--primary` stays a mid-tone orange in each.
const TIER_CIRCLE: Record<AchievementTier, string> = {
  bronze: 'bg-primary/10',
  silver: 'bg-primary/20',
  gold: 'bg-primary/35',
};

export const TIER_LABEL: Record<AchievementTier, string> = {
  bronze: 'Bronze',
  silver: 'Silver',
  gold: 'Gold',
};

interface AchievementCardProps {
  def: AchievementDef;
  /** ISO timestamp when unlocked, null while locked. */
  unlockedAt: string | null;
  /** Progress toward the unlock target, null when not trackable. */
  progress: { current: number; target: number } | null;
  className?: string;
}

export function AchievementCard({ def, unlockedAt, progress, className }: AchievementCardProps) {
  const IconGlyph = getAchievementIcon(def.icon);
  const isUnlocked = unlockedAt !== null;

  const clampedCurrent = progress ? Math.min(Math.round(progress.current), progress.target) : 0;
  const pct = progress && progress.target > 0 ? (clampedCurrent / progress.target) * 100 : 0;
  const unlockDateLabel = isUnlocked ? format(new Date(unlockedAt), 'MMM d, yyyy') : null;

  const a11yLabel = isUnlocked
    ? `${def.title}, ${TIER_LABEL[def.tier]} achievement, unlocked ${unlockDateLabel}. ${def.description}`
    : `${def.title}, ${TIER_LABEL[def.tier]} achievement, locked${
        progress ? `, ${clampedCurrent} of ${progress.target}` : ''
      }. ${def.description}`;

  return (
    <View
      testID={`achievement-card-${def.key}`}
      accessible
      accessibilityLabel={a11yLabel}
      className={cn('rounded-xl border border-border bg-card p-4', className)}
    >
      <View className="flex-row items-start justify-between">
        <View
          className={cn(
            'h-12 w-12 items-center justify-center rounded-full',
            isUnlocked ? TIER_CIRCLE[def.tier] : 'bg-muted'
          )}
        >
          <Icon
            as={IconGlyph}
            size={22}
            className={isUnlocked ? 'text-primary' : 'text-muted-foreground/60'}
          />
        </View>
        {!isUnlocked && <Icon as={Lock} size={14} className="text-muted-foreground/60" />}
      </View>

      <Text
        className={cn('mt-3 font-semibold', !isUnlocked && 'text-muted-foreground')}
        numberOfLines={2}
      >
        {def.title}
      </Text>
      <Text className="mt-0.5 text-xs text-muted-foreground" numberOfLines={2}>
        {def.description}
      </Text>

      {isUnlocked ? (
        <Text className="mt-2 text-xs font-medium text-primary">{unlockDateLabel}</Text>
      ) : progress ? (
        <View className="mt-2 gap-1">
          <Progress
            value={pct}
            className="h-1.5 bg-muted"
            indicatorClassName="bg-primary/70"
          />
          <Text className="text-xs text-muted-foreground">
            {clampedCurrent.toLocaleString()}/{progress.target.toLocaleString()}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
