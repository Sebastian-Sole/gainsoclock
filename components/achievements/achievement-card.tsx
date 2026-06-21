import { format } from 'date-fns';
import { icons, Lock, Trophy, type LucideIcon } from 'lucide-react-native';
import { View } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { Progress } from '@/components/ui/progress';
import { Text } from '@/components/ui/text';
import {
  romanNumeral,
  type AchievementGroup,
  type AchievementTier,
} from '@/lib/achievements';
import { cn } from '@/lib/utils';

// `AchievementGroup.icon` is a lucide export name (string), so look components
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
  group: AchievementGroup;
  className?: string;
}

export function AchievementCard({ group, className }: AchievementCardProps) {
  const IconGlyph = getAchievementIcon(group.icon);
  const isUnlocked = group.level >= 1;
  const isLeveled = group.maxLevel > 1;
  const isMaxed = isLeveled && group.level === group.maxLevel;
  const { progress } = group;

  const clampedCurrent = progress ? Math.min(Math.round(progress.current), progress.target) : 0;
  const pct = progress && progress.target > 0 ? (clampedCurrent / progress.target) * 100 : 0;
  const unlockDateLabel = group.unlockedAt
    ? format(new Date(group.unlockedAt), 'MMM d, yyyy')
    : null;

  // Top-right marker: lock while locked, the roman level (or "MAX") once
  // leveled-up, nothing for an unlocked one-off.
  const levelBadge =
    isLeveled && isUnlocked ? (isMaxed ? 'MAX' : romanNumeral(group.level)) : null;

  const tierWord = TIER_LABEL[group.tier];
  const progressClause = progress ? `, ${clampedCurrent} of ${progress.target}` : '';
  const a11yLabel = isUnlocked
    ? `${group.title}, ${tierWord} achievement, unlocked ${unlockDateLabel}${progressClause}. ${group.description}`
    : `${group.title}, ${tierWord} achievement, locked${progressClause}. ${group.description}`;

  return (
    <View
      testID={`achievement-card-${group.key}`}
      accessible
      accessibilityLabel={a11yLabel}
      className={cn('rounded-xl border border-border bg-card p-4', className)}
    >
      <View className="flex-row items-start justify-between">
        <View
          className={cn(
            'h-12 w-12 items-center justify-center rounded-full',
            isUnlocked ? TIER_CIRCLE[group.tier] : 'bg-muted'
          )}
        >
          <Icon
            as={IconGlyph}
            size={22}
            className={isUnlocked ? 'text-primary' : 'text-muted-foreground/60'}
          />
        </View>
        {levelBadge ? (
          <View className="rounded-full bg-primary/15 px-2 py-0.5">
            <Text className="text-[11px] font-bold text-primary">{levelBadge}</Text>
          </View>
        ) : !isUnlocked ? (
          <Icon as={Lock} size={14} className="text-muted-foreground/60" />
        ) : null}
      </View>

      <Text
        className={cn('mt-3 font-semibold', !isUnlocked && 'text-muted-foreground')}
        numberOfLines={2}
      >
        {group.title}
      </Text>
      <Text className="mt-0.5 text-xs text-muted-foreground" numberOfLines={2}>
        {group.description}
      </Text>

      {unlockDateLabel ? (
        <Text className="mt-2 text-xs font-medium text-primary">
          {isMaxed ? `Max level · ${unlockDateLabel}` : unlockDateLabel}
        </Text>
      ) : null}

      {progress ? (
        <View className="mt-2 gap-1">
          <Progress value={pct} className="h-1.5 bg-muted" indicatorClassName="bg-primary/70" />
          <Text className="text-xs text-muted-foreground">
            {clampedCurrent.toLocaleString()}/{progress.target.toLocaleString()}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
