import React from 'react';
import { View, Pressable } from 'react-native';
import { Text } from '@/components/ui/text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useColorScheme } from 'nativewind';
import { ArrowLeft, ChevronRight, Dumbbell } from 'lucide-react-native';

export default function ImportSourceScreen() {
  const router = useRouter();
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === 'dark';
  const iconColor = isDark ? '#fb923c' : '#f97316';

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <View className="flex-row items-center gap-3 px-4 pb-4 pt-4">
        <Pressable onPress={() => router.back()}>
          <ArrowLeft size={24} className="text-foreground" />
        </Pressable>
        <Text className="text-3xl font-bold">Import Data</Text>
      </View>

      <View className="flex-1 px-4">
        <Text className="mb-3 mt-4 text-sm font-medium text-muted-foreground">
          CHOOSE SOURCE
        </Text>
        <View className="rounded-xl bg-card">
          <Pressable
            onPress={() => router.push('/import/fitnotes')}
            className="flex-row items-center gap-3 px-4 py-4"
          >
            <Dumbbell size={20} color={iconColor} />
            <View className="flex-1">
              <Text className="font-medium">FitNotes</Text>
              <Text className="text-sm text-muted-foreground">
                Import workout history from FitNotes
              </Text>
            </View>
            <ChevronRight size={20} className="text-muted-foreground" />
          </Pressable>
        </View>

        <Text className="mt-4 text-sm text-muted-foreground">
          More import sources coming soon.
        </Text>
      </View>
    </SafeAreaView>
  );
}
