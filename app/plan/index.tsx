import React from 'react';
import { View, Pressable } from 'react-native';
import { Text } from '@/components/ui/text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { useColorScheme } from 'nativewind';
import { PlansList } from '@/components/chat/plans-list';

export default function PlansIndexScreen() {
  const router = useRouter();
  const { colorScheme } = useColorScheme();

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <View className="flex-row items-center gap-2 px-4 pb-2 pt-2">
        <Pressable onPress={() => router.back()} className="p-1">
          <ChevronLeft
            size={24}
            color={colorScheme === 'dark' ? '#fff' : '#000'}
          />
        </Pressable>
        <Text className="flex-1 text-lg font-bold">Workout Plans</Text>
      </View>
      <PlansList />
    </SafeAreaView>
  );
}
