import React from 'react';
import { View } from 'react-native';
import { Text } from '@/components/ui/text';

interface StatCardProps {
  icon: React.ReactNode;
  value: string;
  label: string;
}

export function StatCard({ icon, value, label }: StatCardProps) {
  return (
    <View className="flex-1 rounded-xl border border-border bg-card p-4">
      <View className="mb-2">{icon}</View>
      <Text className="text-xl font-bold">{value}</Text>
      <Text className="text-sm text-muted-foreground">{label}</Text>
    </View>
  );
}
