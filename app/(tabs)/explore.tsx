import React, { useState } from 'react';
import { View, ScrollView } from 'react-native';
import { Text } from '@/components/ui/text';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CalculatorsSection } from '@/components/explore/calculators-section';
import { MealsSection } from '@/components/explore/meals-section';

export default function ExploreScreen() {
  const [activeTab, setActiveTab] = useState('tools');

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <View className="px-4 pb-2 pt-2">
        <Text className="text-3xl font-bold">Explore</Text>
      </View>

      <View className="flex-1">
        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="flex-1"
        >
          <View className="px-4 pb-3">
            <TabsList className="w-full">
              <TabsTrigger value="tools" className="flex-1">
                <Text>Tools</Text>
              </TabsTrigger>
              <TabsTrigger value="meals" className="flex-1">
                <Text>Meals</Text>
              </TabsTrigger>
            </TabsList>
          </View>

          <TabsContent value="tools" className="flex-1">
            <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
              <CalculatorsSection />
            </ScrollView>
          </TabsContent>

          <TabsContent value="meals" className="flex-1">
            <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
              <MealsSection />
            </ScrollView>
          </TabsContent>
        </Tabs>
      </View>
    </SafeAreaView>
  );
}
