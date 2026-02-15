import React from 'react';
import { View } from 'react-native';
import { Text } from '@/components/ui/text';
import { Dumbbell } from 'lucide-react-native';
import { useColorScheme } from 'nativewind';

interface EmptyStateProps {
  title: string;
  description: string;
}

export function EmptyState({ title, description }: EmptyStateProps) {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === 'dark';

  return (
    <View className="flex-1 items-center justify-center gap-4 px-8">
      <View className="h-20 w-20 items-center justify-center rounded-full bg-accent">
        <Dumbbell size={40} color={isDark ? '#fb923c' : '#f97316'} />
      </View>
      <Text className="text-center text-xl font-semibold">{title}</Text>
      <Text className="text-center text-muted-foreground">{description}</Text>
    </View>
  );
}
