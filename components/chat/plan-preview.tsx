import React from 'react';
import { View } from 'react-native';
import { Text } from '@/components/ui/text';
import { Calendar } from 'lucide-react-native';
import { useColorScheme } from 'nativewind';
import { Colors } from '@/constants/theme';
import { cn } from '@/lib/utils';

interface PlanPreviewData {
  name: string;
  description: string;
  goal?: string;
  durationWeeks: number;
  days: Array<{
    week: number;
    dayOfWeek: number;
    templateName?: string;
    label?: string;
  }>;
  templates: Array<{
    name: string;
    exercises: Array<{ name: string }>;
  }>;
}

interface PlanPreviewProps {
  data: PlanPreviewData;
  collapsed?: boolean;
}

const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export function PlanPreview({ data, collapsed }: PlanPreviewProps) {
  const { colorScheme } = useColorScheme();
  const primaryColor = Colors[colorScheme === 'dark' ? 'dark' : 'light'].tint;

  // Build a map of week -> dayOfWeek -> day info
  const dayMap = new Map<string, { templateName?: string; label?: string }>();
  for (const day of data.days) {
    dayMap.set(`${day.week}-${day.dayOfWeek}`, day);
  }

  const previewWeeks = collapsed
    ? Math.min(data.durationWeeks, 3)
    : data.durationWeeks;

  return (
    <View>
      <View className="flex-row items-center gap-2 mb-1 pb-2 border-b border-border">
        <Calendar size={16} color={primaryColor} />
        <Text className="font-semibold">Workout Plan</Text>
      </View>
      <Text className="text-sm font-medium mt-2">{data.name}</Text>
      {data.goal && (
        <Text className="text-xs text-muted-foreground mb-1">Goal: {data.goal}</Text>
      )}
      <Text className="text-xs text-muted-foreground mb-2">
        {data.durationWeeks} weeks · {data.templates.length} workout types
      </Text>

      {/* Mini grid preview */}
      <View className="rounded-lg border border-border overflow-hidden">
        {/* Header row */}
        <View className="flex-row bg-muted/50">
          <View className="w-10 items-center justify-center py-1">
            <Text className="text-[10px] text-muted-foreground">Wk</Text>
          </View>
          {DAY_LABELS.map((label, i) => (
            <View key={i} className="flex-1 items-center py-1">
              <Text className="text-[10px] text-muted-foreground">{label}</Text>
            </View>
          ))}
        </View>

        {/* Week rows */}
        {Array.from({ length: previewWeeks }, (_, weekIndex) => {
          const week = weekIndex + 1;
          return (
            <View key={week} className="flex-row border-t border-border">
              <View className="w-10 items-center justify-center py-1.5">
                <Text className="text-[10px] text-muted-foreground">{week}</Text>
              </View>
              {Array.from({ length: 7 }, (_, dayIndex) => {
                const dayInfo = dayMap.get(`${week}-${dayIndex}`);
                const hasWorkout = dayInfo?.templateName;
                return (
                  <View key={dayIndex} className="flex-1 items-center justify-center py-1.5">
                    <View
                      className={cn(
                        'h-3 w-3 rounded-full',
                        hasWorkout ? 'bg-primary' : 'bg-muted'
                      )}
                    />
                  </View>
                );
              })}
            </View>
          );
        })}

        {data.durationWeeks > previewWeeks && (
          <View className="items-center border-t border-border py-1">
            <Text className="text-[10px] text-muted-foreground">
              +{data.durationWeeks - previewWeeks} more weeks
            </Text>
          </View>
        )}
      </View>

      {/* Template list — collapsed shows fewer */}
      {!collapsed && (
        <View className="mt-2">
          <Text className="text-xs font-medium text-muted-foreground mb-1">Workout types:</Text>
          {data.templates.map((template, i) => (
            <View key={i} className="mb-2">
              <Text className="text-xs font-medium">
                {template.name} ({template.exercises.length} exercises)
              </Text>
              {template.exercises.map((ex, j) => (
                <Text key={j} className="text-xs text-muted-foreground ml-3">
                  · {ex.name}
                </Text>
              ))}
            </View>
          ))}
        </View>
      )}

      {collapsed && data.templates.length > 0 && (
        <View className="mt-2">
          <Text className="text-xs text-muted-foreground">
            {data.templates.length} workout type{data.templates.length !== 1 ? 's' : ''}:{' '}
            {data.templates.map((t) => t.name).join(', ')}
          </Text>
        </View>
      )}
    </View>
  );
}
