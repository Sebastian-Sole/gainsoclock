import React, { useEffect, useRef } from 'react';
import { View, ScrollView, Pressable, Modal, Animated, Dimensions, StyleSheet } from 'react-native';
import { Text } from '@/components/ui/text';
import { X, Check, Dumbbell } from 'lucide-react-native';
import { useColorScheme } from 'nativewind';
import { Colors } from '@/constants/theme';
import { useTemplateStore } from '@/stores/template-store';

interface TemplatePickerProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (templateClientId: string) => void;
  currentTemplateId?: string;
}

export function TemplatePicker({ visible, onClose, onSelect, currentTemplateId }: TemplatePickerProps) {
  const { colorScheme } = useColorScheme();
  const primaryColor = Colors[colorScheme === 'dark' ? 'dark' : 'light'].tint;
  const templates = useTemplateStore((s) => s.templates);

  const screenHeight = Dimensions.get('window').height;
  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const sheetTranslateY = useRef(new Animated.Value(screenHeight)).current;
  const [modalVisible, setModalVisible] = React.useState(false);

  useEffect(() => {
    if (visible) {
      setModalVisible(true);
      Animated.parallel([
        Animated.timing(overlayOpacity, { toValue: 1, duration: 250, useNativeDriver: true }),
        Animated.spring(sheetTranslateY, { toValue: 0, damping: 20, stiffness: 200, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(overlayOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
        Animated.timing(sheetTranslateY, { toValue: screenHeight, duration: 200, useNativeDriver: true }),
      ]).start(() => setModalVisible(false));
    }
  }, [visible]);

  return (
    <Modal visible={modalVisible} transparent animationType="none">
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Animated.View
          style={{
            ...StyleSheet.absoluteFillObject,
            backgroundColor: 'rgba(0,0,0,0.5)',
            opacity: overlayOpacity,
          }}
        />
        <Pressable onPress={onClose} style={{ flex: 1 }} />
        <Animated.View
          style={{ maxHeight: '70%', transform: [{ translateY: sheetTranslateY }] }}
          className="rounded-t-3xl bg-background"
        >
          {/* Header */}
          <View className="flex-row items-center justify-between px-6 pb-2 pt-6">
            <Text className="text-lg font-bold">Choose Workout</Text>
            <Pressable onPress={onClose} className="p-2">
              <X size={20} color={colorScheme === 'dark' ? '#9ca3af' : '#6b7280'} />
            </Pressable>
          </View>

          {/* Template list */}
          <ScrollView className="px-6 pb-8" showsVerticalScrollIndicator={false}>
            {templates.length === 0 ? (
              <View className="items-center py-12">
                <Text className="text-muted-foreground">No templates yet</Text>
              </View>
            ) : (
              templates.map((template) => {
                const isSelected = template.id === currentTemplateId;
                return (
                  <Pressable
                    key={template.id}
                    onPress={() => onSelect(template.id)}
                    className="mb-2 flex-row items-center gap-3 rounded-xl border border-border bg-card p-4"
                    style={isSelected ? { borderColor: primaryColor } : undefined}
                  >
                    <View
                      className="h-10 w-10 items-center justify-center rounded-full"
                      style={{ backgroundColor: `${primaryColor}20` }}
                    >
                      <Dumbbell size={18} color={primaryColor} />
                    </View>
                    <View className="flex-1">
                      <Text className="text-base font-medium">{template.name}</Text>
                      <Text className="text-xs text-muted-foreground">
                        {template.exercises.length} exercise{template.exercises.length !== 1 ? 's' : ''}
                      </Text>
                    </View>
                    {isSelected && <Check size={20} color={primaryColor} />}
                  </Pressable>
                );
              })
            )}
            <View className="h-4" />
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}
