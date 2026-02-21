import React from 'react';
import { Pressable, View } from 'react-native';
import { Text } from '@/components/ui/text';
import { ChevronRight } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useColorScheme } from 'nativewind';

interface CalculatorCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  href: string;
}

export function CalculatorCard({ icon, title, description, href }: CalculatorCardProps) {
  const router = useRouter();
  const { colorScheme } = useColorScheme();
  const chevronColor = colorScheme === 'dark' ? '#a8a29e' : '#78716c';

  return (
    <Pressable
      onPress={() => router.push(href as any)}
      className="flex-row items-center gap-3 rounded-xl border border-border bg-card px-4 py-4 active:opacity-70"
    >
      <View className="h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
        {icon}
      </View>
      <View className="flex-1">
        <Text className="font-medium">{title}</Text>
        <Text className="text-sm text-muted-foreground">{description}</Text>
      </View>
      <ChevronRight size={18} color={chevronColor} />
    </Pressable>
  );
}
