import React, { useState } from 'react';
import { View, Pressable, Platform } from 'react-native';
import { Text } from '@/components/ui/text';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useColorScheme } from 'nativewind';
import { format, isSameDay, startOfDay, subDays } from 'date-fns';
import { Calendar } from 'lucide-react-native';

import { Colors } from '@/constants/theme';
import { PRESET_OPTIONS, type PresetKey, type DateRangeFilter } from '@/lib/stats';
import { useSettingsStore } from '@/stores/settings-store';

interface DateRangePickerProps {
  value: DateRangeFilter;
  onChange: (filter: DateRangeFilter) => void;
}

export function DateRangePicker({ value, onChange }: DateRangePickerProps) {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === 'dark';
  const mutedColor = Colors[isDark ? 'dark' : 'light'].icon;

  const savedFrom = useSettingsStore((s) => s.customRangeFrom);
  const savedTo = useSettingsStore((s) => s.customRangeTo);
  const setCustomRange = useSettingsStore((s) => s.setCustomRange);
  const [isCustomOpen, setIsCustomOpen] = useState(false);
  const [draftFrom, setDraftFrom] = useState<Date>(() => {
    if (savedFrom) return new Date(savedFrom);
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d;
  });
  const [draftTo, setDraftTo] = useState<Date>(() => {
    if (savedTo) return new Date(savedTo);
    return new Date();
  });
  const [showFromPicker, setShowFromPicker] = useState(false);
  const [showToPicker, setShowToPicker] = useState(false);

  const handlePresetPress = (key: PresetKey) => {
    if (key === 'custom') {
      if (value.preset === 'custom') {
        // Already on custom — toggle the editor open/closed
        if (isCustomOpen) {
          setIsCustomOpen(false);
          setShowFromPicker(false);
          setShowToPicker(false);
        } else {
          // Pre-fill draft from current custom values
          if (value.from) {
            setDraftFrom(value.from);
            setDraftTo(value.to ?? new Date());
          }
          setIsCustomOpen(true);
        }
        return;
      }

      // Not currently on custom — apply saved range and open editor
      if (savedFrom !== null) {
        const from = new Date(savedFrom);
        const to = savedTo ? new Date(savedTo) : null;
        setDraftFrom(from);
        setDraftTo(to ?? new Date());
        onChange({ preset: 'custom', from, to });
      }

      // Open the picker (whether or not there's a saved range)
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
      onChange({ preset: key, from: subDays(now, daysMap[key]), to: null });
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
    // Normalize from to start of day so early workouts aren't excluded
    const normalizedFrom = startOfDay(draftFrom);
    // If the end date is today, store null so it always means "current date"
    const toIsToday = isSameDay(draftTo, new Date());
    const normalizedTo = toIsToday ? null : draftTo;
    setCustomRange(normalizedFrom, normalizedTo);
    onChange({ preset: 'custom', from: normalizedFrom, to: normalizedTo });
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
