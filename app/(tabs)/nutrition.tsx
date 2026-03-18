import React, { useState } from 'react';
import { View } from 'react-native';
import { Text } from '@/components/ui/text';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SettingsHeaderButton } from '@/components/shared/settings-header-button';
import { RecipesTab } from '@/components/nutrition/recipes-tab';
import { TodayTab } from '@/components/nutrition/today-tab';
import { NutritionHistoryTab } from '@/components/nutrition/history-tab';

export default function NutritionScreen() {
  const [activeTab, setActiveTab] = useState('today');

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <View className="flex-row items-center justify-between px-4 pb-2 pt-2">
        <Text className="text-3xl font-bold">Nutrition</Text>
        <SettingsHeaderButton />
      </View>

      <View className="flex-1">
        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="flex-1"
        >
          <View className="px-4 pb-3">
            <TabsList className="w-full">
              <TabsTrigger value="today" className="flex-1">
                <Text>Today</Text>
              </TabsTrigger>
              <TabsTrigger value="recipes" className="flex-1">
                <Text>Recipes</Text>
              </TabsTrigger>
              <TabsTrigger value="history" className="flex-1">
                <Text>History</Text>
              </TabsTrigger>
            </TabsList>
          </View>

          <TabsContent value="today" className="flex-1">
            <TodayTab />
          </TabsContent>

          <TabsContent value="recipes" className="flex-1">
            <RecipesTab />
          </TabsContent>

          <TabsContent value="history" className="flex-1">
            <NutritionHistoryTab />
          </TabsContent>
        </Tabs>
      </View>
    </SafeAreaView>
  );
}
