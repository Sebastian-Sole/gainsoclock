import React, { useState } from 'react';
import { View, Pressable, Platform } from 'react-native';
import { Text } from '@/components/ui/text';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useColorScheme } from 'nativewind';
import { format } from 'date-fns';
import { Calendar } from 'lucide-react-native';

import { PRESET_OPTIONS, type PresetKey, type DateRangeFilter } from '@/lib/stats';

interface DateRangePickerProps {
  value: DateRangeFilter;
  onChange: (filter: DateRangeFilter) => void;
}

export function DateRangePicker({ value, onChange }: DateRangePickerProps) {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === 'dark';
  const mutedColor = isDark ? '#9BA1A6' : '#687076';

  const [isCustomOpen, setIsCustomOpen] = useState(false);
  const [draftFrom, setDraftFrom] = useState<Date>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d;
  });
  const [draftTo, setDraftTo] = useState<Date>(() => new Date());
  const [showFromPicker, setShowFromPicker] = useState(false);
  const [showToPicker, setShowToPicker] = useState(false);

  const handlePresetPress = (key: PresetKey) => {
    if (key === 'custom') {
      // Open the custom picker UI without applying yet
      if (value.preset === 'custom' && value.from && value.to) {
        setDraftFrom(value.from);
        setDraftTo(value.to);
      }
      setIsCustomOpen(true);
      return;
    }

    // Any preset immediately applies and closes custom
    setIsCustomOpen(false);
    setShowFromPicker(false);
    setShowToPicker(false);

    if (key === 'all') {
      onChange({ preset: 'all', from: null, to: null });
    } else {
      const now = new Date();
      const daysMap: Record<string, number> = { '7d': 7, '30d': 30, '90d': 90, '1y': 365 };
      const from = new Date();
      from.setDate(now.getDate() - daysMap[key]);
      onChange({ preset: key, from, to: null });
    }
  };

  const handleFromChange = (_: DateTimePickerEvent, date?: Date) => {
    if (Platform.OS === 'android') setShowFromPicker(false);
    if (date) setDraftFrom(date);
  };

  const handleToChange = (_: DateTimePickerEvent, date?: Date) => {
    if (Platform.OS === 'android') setShowToPicker(false);
    if (date) setDraftTo(date);
  };

  const handleApply = () => {
    setShowFromPicker(false);
    setShowToPicker(false);
    setIsCustomOpen(false);
    onChange({ preset: 'custom', from: draftFrom, to: draftTo });
  };

  // Show "Custom" chip as selected if either the picker is open or custom is already applied
  const isCustomActive = isCustomOpen || value.preset === 'custom';

  return (
    <View className="gap-2">
      {/* Preset chips */}
      <View className="flex-row gap-2">
        {PRESET_OPTIONS.map((option) => {
          const isSelected = option.key === 'custom'
            ? isCustomActive
            : !isCustomOpen && value.preset === option.key;
          return (
            <Pressable
              key={option.key}
              onPress={() => handlePresetPress(option.key)}
              className={`rounded-lg px-3 py-1.5 ${
                isSelected ? 'bg-primary' : 'bg-muted'
              }`}
            >
              <Text
                className={`text-sm font-medium ${
                  isSelected ? 'text-primary-foreground' : 'text-muted-foreground'
                }`}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Custom date range editor */}
      {isCustomOpen && (
        <View className="gap-2">
          <View className="flex-row items-center gap-2">
            {/* From date */}
            <Pressable
              onPress={() => {
                setShowFromPicker(!showFromPicker);
                setShowToPicker(false);
              }}
              className="flex-1 flex-row items-center gap-2 rounded-lg border border-border bg-card px-3 py-2"
            >
              <Calendar size={14} color={mutedColor} />
              <Text className="text-sm">
                {format(draftFrom, 'MMM d, yyyy')}
              </Text>
            </Pressable>

            <Text className="text-sm text-muted-foreground">to</Text>

            {/* To date */}
            <Pressable
              onPress={() => {
                setShowToPicker(!showToPicker);
                setShowFromPicker(false);
              }}
              className="flex-1 flex-row items-center gap-2 rounded-lg border border-border bg-card px-3 py-2"
            >
              <Calendar size={14} color={mutedColor} />
              <Text className="text-sm">
                {format(draftTo, 'MMM d, yyyy')}
              </Text>
            </Pressable>
          </View>

          {/* Date pickers */}
          {showFromPicker && (
            <DateTimePicker
              value={draftFrom}
              mode="date"
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              onChange={handleFromChange}
              maximumDate={draftTo}
              themeVariant={isDark ? 'dark' : 'light'}
            />
          )}

          {showToPicker && (
            <DateTimePicker
              value={draftTo}
              mode="date"
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              onChange={handleToChange}
              minimumDate={draftFrom}
              maximumDate={new Date()}
              themeVariant={isDark ? 'dark' : 'light'}
            />
          )}

          {/* Apply button */}
          <Pressable
            onPress={handleApply}
            className="items-center rounded-lg bg-primary px-4 py-2.5"
          >
            <Text className="text-sm font-semibold text-primary-foreground">
              Set Date Range
            </Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}
