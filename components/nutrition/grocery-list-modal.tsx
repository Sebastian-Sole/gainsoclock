import React from 'react';
import { View, Modal, Pressable, FlatList, Alert } from 'react-native';
import { Text } from '@/components/ui/text';
import { X, Trash2 } from 'lucide-react-native';
import { useColorScheme } from 'nativewind';
import { Colors } from '@/constants/theme';
import { Icon } from '@/components/ui/icon';
import { lightHaptic } from '@/lib/haptics';
import { useGroceryStore, type GroceryItem } from '@/stores/grocery-store';

interface GroceryListModalProps {
  visible: boolean;
  onClose: () => void;
}

function GroceryRow({ item }: { item: GroceryItem }) {
  const { colorScheme } = useColorScheme();
  const primaryColor = Colors[colorScheme === 'dark' ? 'dark' : 'light'].tint;
  const toggleItem = useGroceryStore((s) => s.toggleItem);
  const removeItem = useGroceryStore((s) => s.removeItem);

  return (
    <View className="flex-row items-center gap-3 px-4 py-3">
      <Pressable
        onPress={() => {
          toggleItem(item.id);
          lightHaptic();
        }}
        className="h-6 w-6 items-center justify-center rounded-md border-2"
        style={{
          borderColor: item.checked ? primaryColor : '#9ca3af',
          backgroundColor: item.checked ? primaryColor : 'transparent',
        }}
      >
        {item.checked && (
          <Text className="text-xs font-bold text-white">✓</Text>
        )}
      </Pressable>
      <View className="flex-1">
        <Text
          className={`text-sm ${item.checked ? 'line-through text-muted-foreground' : ''}`}
        >
          {item.amount}{item.unit ? ` ${item.unit}` : ''} {item.name}
        </Text>
        <Text className="text-xs text-muted-foreground">{item.recipeTitle}</Text>
      </View>
      <Pressable
        onPress={() => {
          removeItem(item.id);
          lightHaptic();
        }}
        className="p-1"
        hitSlop={8}
      >
        <Icon as={Trash2} size={14} className="text-muted-foreground" />
      </Pressable>
    </View>
  );
}

export function GroceryListModal({ visible, onClose }: GroceryListModalProps) {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === 'dark';
  const items = useGroceryStore((s) => s.items);
  const clearChecked = useGroceryStore((s) => s.clearChecked);
  const clearAll = useGroceryStore((s) => s.clearAll);

  const unchecked = items.filter((i) => !i.checked);
  const checked = items.filter((i) => i.checked);
  const sortedItems = [...unchecked, ...checked];

  const handleClearAll = () => {
    Alert.alert('Clear All', 'Remove all items from your grocery list?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear All',
        style: 'destructive',
        onPress: () => {
          clearAll();
          lightHaptic();
        },
      },
    ]);
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View className="flex-1 bg-background">
        {/* Header */}
        <View className="flex-row items-center justify-between px-4 pt-4 pb-2">
          <View className="flex-row items-center gap-2">
            <Text className="text-xl font-bold">Grocery List</Text>
            <View className="rounded-full bg-muted px-2 py-0.5">
              <Text className="text-xs font-medium text-muted-foreground">
                {items.length}
              </Text>
            </View>
          </View>
          <Pressable onPress={onClose} className="p-2">
            <Icon as={X} size={24} className="text-foreground" />
          </Pressable>
        </View>

        {items.length === 0 ? (
          <View className="flex-1 items-center justify-center px-4">
            <Text className="text-center text-muted-foreground">
              No items yet. Swipe right on a recipe to add its ingredients.
            </Text>
          </View>
        ) : (
          <FlatList
            data={sortedItems}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => <GroceryRow item={item} />}
            contentContainerClassName="pb-4"
          />
        )}

        {/* Footer */}
        {items.length > 0 && (
          <View className="flex-row gap-3 px-4 pb-8 pt-3 border-t border-border">
            <Pressable
              onPress={() => {
                clearChecked();
                lightHaptic();
              }}
              className="flex-1 items-center rounded-xl border border-border py-4"
            >
              <Text className="font-medium">Clear Checked</Text>
            </Pressable>
            <Pressable
              onPress={handleClearAll}
              className="flex-1 items-center rounded-xl bg-destructive py-4"
            >
              <Text className="font-medium text-destructive-foreground">Clear All</Text>
            </Pressable>
          </View>
        )}
      </View>
    </Modal>
  );
}
