import React from 'react';
import { FlatList, Pressable, View } from 'react-native';
import { Text } from '@/components/ui/text';
import { useRouter } from 'expo-router';
import { usePlanStore } from '@/stores/plan-store';
import { Calendar, ChevronRight } from 'lucide-react-native';
import { Icon } from '@/components/ui/icon';
import { cn } from '@/lib/utils';

export function PlansList() {
  const plans = usePlanStore((s) => s.plans);
  const router = useRouter();

  if (plans.length === 0) {
    return (
      <View className="flex-1 items-center justify-center px-4">
        <View className="items-center rounded-xl border border-dashed border-border px-8 py-12">
          <Icon as={Calendar} size={32} className="text-primary" />
          <Text className="mt-3 text-center text-muted-foreground">
            Create a workout plan through the chat to get started
          </Text>
        </View>
      </View>
    );
  }

  return (
    <FlatList
      data={plans}
      keyExtractor={(item) => item.id}
      contentContainerClassName="px-4 pb-8 gap-2"
      renderItem={({ item }) => (
        <Pressable
          onPress={() => router.push(`/plan/${item.id}`)}
          className="flex-row items-center gap-3 rounded-xl border border-border bg-card px-4 py-3"
        >
          <View
            className={cn(
              'h-10 w-10 items-center justify-center rounded-full',
              item.status === 'active' ? 'bg-green-500/10' : 'bg-muted'
            )}
          >
            <Icon
              as={Calendar}
              size={20}
              className={item.status === 'active' ? 'text-green-500' : 'text-muted-foreground'}
            />
          </View>
          <View className="flex-1">
            <Text className="font-semibold" numberOfLines={1}>
              {item.name}
            </Text>
            <Text className="text-xs text-muted-foreground">
              {item.durationWeeks} weeks
              {item.goal ? ` \u00b7 ${item.goal}` : ''}
              {item.status === 'active' ? ' \u00b7 Active' : ''}
            </Text>
          </View>
          <Icon as={ChevronRight} size={16} className="text-muted-foreground" />
        </Pressable>
      )}
    />
  );
}
