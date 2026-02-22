import React from 'react';
import { View } from 'react-native';
import { Text } from '@/components/ui/text';
import { RefreshCw } from 'lucide-react-native';
import { useColorScheme } from 'nativewind';
import { Colors } from '@/constants/theme';

interface DayUpdate {
  week: number;
  dayOfWeek: number;
  templateName?: string;
  label?: string;
  notes?: string;
  remove?: boolean;
}

interface NewTemplate {
  name: string;
  exercises: Array<{ name: string; type?: string }>;
}

interface UpdatePlanPayload {
  planClientId: string;
  updates: {
    name?: string;
    description?: string;
    daysToUpdate?: DayUpdate[];
    newTemplates?: NewTemplate[];
  };
}

interface UpdatePlanPreviewProps {
  data: UpdatePlanPayload;
  collapsed?: boolean;
}

const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export function UpdatePlanPreview({ data, collapsed }: UpdatePlanPreviewProps) {
  const { colorScheme } = useColorScheme();
  const primaryColor = Colors[colorScheme === 'dark' ? 'dark' : 'light'].tint;

  const daysToUpdate = data.updates?.daysToUpdate ?? [];
  const newTemplates = data.updates?.newTemplates ?? [];

  // Build a map of week-day -> update info
  const updateMap = new Map<string, DayUpdate>();
  let maxWeek = 0;
  for (const day of daysToUpdate) {
    updateMap.set(`${day.week}-${day.dayOfWeek}`, day);
    if (day.week > maxWeek) maxWeek = day.week;
  }

  const weeksToShow = collapsed ? Math.min(maxWeek, 3) : maxWeek;

  return (
    <View>
      <View className="flex-row items-center gap-2 mb-1 pb-2 border-b border-border">
        <RefreshCw size={16} color={primaryColor} />
        <Text className="font-semibold">Plan Update</Text>
      </View>

      {data.updates?.name && (
        <Text className="text-sm font-medium mt-2">New name: {data.updates.name}</Text>
      )}
      {!collapsed && data.updates?.description && (
        <Text className="text-xs text-muted-foreground mt-0.5">{data.updates.description}</Text>
      )}

      <Text className="text-xs text-muted-foreground mt-1 mb-2">
        {daysToUpdate.length} day{daysToUpdate.length !== 1 ? 's' : ''} modified
        {newTemplates.length > 0
          ? ` · ${newTemplates.length} new template${newTemplates.length !== 1 ? 's' : ''}`
          : ''}
      </Text>

      {/* Mini calendar grid showing changes */}
      {weeksToShow > 0 && (
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
          {Array.from({ length: weeksToShow }, (_, weekIndex) => {
            const week = weekIndex + 1;
            return (
              <View key={week} className="flex-row border-t border-border">
                <View className="w-10 items-center justify-center py-1.5">
                  <Text className="text-[10px] text-muted-foreground">{week}</Text>
                </View>
                {Array.from({ length: 7 }, (_, dayIndex) => {
                  const update = updateMap.get(`${week}-${dayIndex}`);
                  return (
                    <View key={dayIndex} className="flex-1 items-center justify-center py-1.5">
                      {update ? (
                        update.remove ? (
                          <View className="h-3 w-3 rounded-sm bg-red-500 items-center justify-center">
                            <Text className="text-[7px] text-white font-bold">x</Text>
                          </View>
                        ) : (
                          <View className="h-3 w-3 rounded-full bg-primary" />
                        )
                      ) : (
                        <View className="h-3 w-3 rounded-full bg-muted" />
                      )}
                    </View>
                  );
                })}
              </View>
            );
          })}

          {maxWeek > weeksToShow && (
            <View className="items-center border-t border-border py-1">
              <Text className="text-[10px] text-muted-foreground">
                +{maxWeek - weeksToShow} more weeks
              </Text>
            </View>
          )}
        </View>
      )}

      {/* Legend */}
      {!collapsed && weeksToShow > 0 && (
        <View className="flex-row items-center gap-3 mt-1.5">
          <View className="flex-row items-center gap-1">
            <View className="h-2 w-2 rounded-full bg-primary" />
            <Text className="text-[10px] text-muted-foreground">Modified</Text>
          </View>
          {daysToUpdate.some((d) => d.remove) && (
            <View className="flex-row items-center gap-1">
              <View className="h-2 w-2 rounded-sm bg-red-500" />
              <Text className="text-[10px] text-muted-foreground">Removed</Text>
            </View>
          )}
          <View className="flex-row items-center gap-1">
            <View className="h-2 w-2 rounded-full bg-muted" />
            <Text className="text-[10px] text-muted-foreground">Unchanged</Text>
          </View>
        </View>
      )}

      {/* Day change details — expanded only */}
      {!collapsed && daysToUpdate.length > 0 && (
        <View className="mt-3">
          <Text className="text-xs font-medium text-muted-foreground mb-1">Changes:</Text>
          {daysToUpdate.map((day, i) => (
            <View key={i} className="mb-1.5">
              <Text className="text-xs">
                <Text className="text-xs font-medium">Wk {day.week}, {DAY_LABELS[day.dayOfWeek] ?? '?'}</Text>
                {day.remove
                  ? ' — removed'
                  : day.templateName
                    ? ` — ${day.templateName}`
                    : ''}
              </Text>
              {day.label && !day.remove && (
                <Text className="text-[11px] text-muted-foreground ml-3">{day.label}</Text>
              )}
              {day.notes && !day.remove && (
                <Text className="text-[11px] text-muted-foreground ml-3 italic">{day.notes}</Text>
              )}
            </View>
          ))}
        </View>
      )}

      {/* New templates — expanded only */}
      {!collapsed && newTemplates.length > 0 && (
        <View className="mt-2">
          <Text className="text-xs font-medium text-muted-foreground mb-1">New templates:</Text>
          {newTemplates.map((template, i) => (
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

      {/* Collapsed template summary */}
      {collapsed && newTemplates.length > 0 && (
        <View className="mt-1">
          <Text className="text-xs text-muted-foreground">
            New: {newTemplates.map((t) => t.name).join(', ')}
          </Text>
        </View>
      )}
    </View>
  );
}
