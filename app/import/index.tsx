import React from 'react';
import { View, Pressable } from 'react-native';
import { Text } from '@/components/ui/text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, type Href } from 'expo-router';
import {
  ArrowLeft,
  ChevronRight,
  Dumbbell,
  Weight,
  Activity,
  FileSpreadsheet,
  type LucideIcon,
} from 'lucide-react-native';
import { Icon } from '@/components/ui/icon';

interface ImportSourceEntry {
  key: string;
  title: string;
  description: string;
  icon: LucideIcon;
  route: Href;
}

// Registry of workout-history import sources. Each route hosts a screen
// built on components/import/csv-import-flow.tsx.
const IMPORT_SOURCES: ImportSourceEntry[] = [
  {
    key: 'fitnotes',
    title: 'FitNotes',
    description: 'Import workout history from FitNotes',
    icon: Dumbbell,
    route: '/import/fitnotes',
  },
  {
    key: 'strong',
    title: 'Strong',
    description: 'Import workout history from Strong',
    icon: Weight,
    route: '/import/strong',
  },
  {
    key: 'hevy',
    title: 'Hevy',
    description: 'Import workout history from Hevy',
    icon: Activity,
    route: '/import/hevy',
  },
  {
    key: 'generic',
    title: 'Generic CSV',
    description: 'Any CSV with date, exercise, weight and reps columns',
    icon: FileSpreadsheet,
    route: '/import/generic',
  },
];

export default function ImportSourceScreen() {
  const router = useRouter();

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <View className="flex-row items-center gap-3 px-4 pb-4 pt-4">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back"
          onPress={() => router.back()}
        >
          <Icon as={ArrowLeft} size={24} className="text-foreground" />
        </Pressable>
        <Text className="text-3xl font-bold">Import Data</Text>
      </View>

      <View className="flex-1 px-4">
        <Text className="mb-3 mt-4 text-sm font-medium text-muted-foreground">
          CHOOSE SOURCE
        </Text>
        <View className="rounded-xl bg-card">
          {IMPORT_SOURCES.map((source, index) => (
            <React.Fragment key={source.key}>
              {index > 0 && <View className="mx-4 border-b border-border" />}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={source.title}
                accessibilityHint={source.description}
                onPress={() => router.push(source.route)}
                className="flex-row items-center gap-3 px-4 py-4"
              >
                <Icon as={source.icon} size={20} className="text-foreground" />
                <View className="flex-1">
                  <Text className="font-medium">{source.title}</Text>
                  <Text className="text-sm text-muted-foreground">
                    {source.description}
                  </Text>
                </View>
                <Icon
                  as={ChevronRight}
                  size={20}
                  className="text-muted-foreground"
                />
              </Pressable>
            </React.Fragment>
          ))}
        </View>
      </View>
    </SafeAreaView>
  );
}
