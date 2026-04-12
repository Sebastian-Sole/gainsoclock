import React, { useState } from 'react';
import { View, Pressable } from 'react-native';
import { Text } from '@/components/ui/text';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ShoppingCart } from 'lucide-react-native';
import { useColorScheme } from 'nativewind';

import { Colors } from '@/constants/theme';
import { Icon } from '@/components/ui/icon';
import { SettingsHeaderButton } from '@/components/shared/settings-header-button';
import { RecipesTab } from '@/components/nutrition/recipes-tab';
import { TodayTab } from '@/components/nutrition/today-tab';
import { NutritionHistoryTab } from '@/components/nutrition/history-tab';
import { GroceryListModal } from '@/components/nutrition/grocery-list-modal';
import { useGroceryStore } from '@/stores/grocery-store';

export default function NutritionScreen() {
  const [activeTab, setActiveTab] = useState('today');
  const [showGroceryModal, setShowGroceryModal] = useState(false);

  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const primaryColor = Colors[colorScheme === 'dark' ? 'dark' : 'light'].tint;
  const groceryItemCount = useGroceryStore((s) => s.items.length);

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <View className="flex-row items-center justify-between px-4 pb-2 pt-2">
        <Text className="text-3xl font-bold">Nutrition</Text>
        <View className="flex-row items-center">
          <Pressable
            onPress={() => setShowGroceryModal(true)}
            className="p-2 relative"
            hitSlop={8}
          >
            <Icon
              as={ShoppingCart}
              size={22}
              className={groceryItemCount > 0 ? 'text-primary' : 'text-foreground'}
            />
            {groceryItemCount > 0 && (
              <View
                className="absolute top-0 right-0 h-4 min-w-[16px] items-center justify-center rounded-full px-1"
                style={{ backgroundColor: primaryColor }}
              >
                <Text className="text-[10px] font-bold text-white">{groceryItemCount}</Text>
              </View>
            )}
          </Pressable>
          <SettingsHeaderButton />
        </View>
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

      <GroceryListModal
        visible={showGroceryModal}
        onClose={() => setShowGroceryModal(false)}
      />
    </View>
  );
}
