import React from 'react';
import { View, ScrollView } from 'react-native';
import { Text } from '@/components/ui/text';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CalculatorsSection } from '@/components/explore/calculators-section';
import { SettingsHeaderButton } from '@/components/shared/settings-header-button';

export default function ExploreScreen() {
  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <View className="flex-row items-center justify-between px-4 pb-2 pt-2">
        <Text className="text-3xl font-bold">Explore</Text>
        <SettingsHeaderButton />
      </View>

      <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
        <CalculatorsSection />
      </ScrollView>
    </SafeAreaView>
  );
}
