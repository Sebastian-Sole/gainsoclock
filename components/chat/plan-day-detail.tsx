import React, { useEffect, useRef, useState } from 'react';
import { View, ScrollView, Pressable, Modal, Animated, Dimensions, StyleSheet, TextInput, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { Text } from '@/components/ui/text';
import { X, Play, Dumbbell, Check, Pencil, ChevronRight, Moon, ArrowRightLeft, Trash2 } from 'lucide-react-native';
import { useColorScheme } from 'nativewind';
import { useRouter } from 'expo-router';
import { useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { Colors } from '@/constants/theme';
import { useTemplateStore } from '@/stores/template-store';
import { TemplatePicker } from '@/components/plan/template-picker';
import { cn } from '@/lib/utils';
import { isPast } from '@/lib/plan-dates';
import { lightHaptic } from '@/lib/haptics';

interface PlanDayDetailProps {
  visible: boolean;
  onClose: () => void;
  onStartWorkout: () => void;
  onMoveDay?: (week: number, dayOfWeek: number) => void;
  planClientId: string;
  week: number;
  dayOfWeek: number;
  label?: string;
  notes?: string;
  templateClientId?: string;
  status: string;
  date?: Date;
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function PlanDayDetail({
  visible,
  onClose,
  onStartWorkout,
  onMoveDay,
  planClientId,
  week,
  dayOfWeek,
  label,
  notes,
  templateClientId,
  status,
  date,
}: PlanDayDetailProps) {
  const { colorScheme } = useColorScheme();
  const router = useRouter();
  const isMissed = status === 'pending' && !!date && isPast(date);
  const primaryColor = Colors[colorScheme === 'dark' ? 'dark' : 'light'].tint;
  const templates = useTemplateStore((s) => s.templates);
  const template = useTemplateStore((s) =>
    templateClientId ? s.getTemplate(templateClientId) : undefined
  );

  const updatePlanDay = useMutation(api.plans.updatePlanDay);

  const [isEditing, setIsEditing] = useState(false);
  const [editLabel, setEditLabel] = useState(label ?? '');
  const [editNotes, setEditNotes] = useState(notes ?? '');
  const [editTemplateId, setEditTemplateId] = useState(templateClientId);
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);

  // Reset edit state when day changes
  useEffect(() => {
    setIsEditing(false);
    setEditLabel(label ?? '');
    setEditNotes(notes ?? '');
    setEditTemplateId(templateClientId);
  }, [week, dayOfWeek, label, notes, templateClientId]);

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

  const handleSaveDay = async () => {
    const args: {
      planClientId: string;
      week: number;
      dayOfWeek: number;
      templateClientId?: string;
      clearTemplate?: boolean;
      label?: string;
      notes?: string;
      status?: 'pending' | 'completed' | 'skipped' | 'rest';
    } = {
      planClientId,
      week,
      dayOfWeek,
    };

    if (editTemplateId !== templateClientId) {
      if (editTemplateId) {
        args.templateClientId = editTemplateId;
        const selectedTemplate = templates.find((t) => t.id === editTemplateId);
        if (!editLabel.trim() && selectedTemplate) {
          args.label = selectedTemplate.name;
        }
        if (status === 'rest') {
          args.status = 'pending';
        }
      } else {
        args.clearTemplate = true;
        args.status = 'rest';
        args.label = '';
      }
    }

    const trimmedLabel = editLabel.trim();
    if (trimmedLabel !== (label ?? '')) {
      args.label = trimmedLabel;
    }

    const trimmedNotes = editNotes.trim();
    if (trimmedNotes !== (notes ?? '')) {
      args.notes = trimmedNotes;
    }

    await updatePlanDay(args);
    lightHaptic();
    setIsEditing(false);
  };

  const handleToggleEdit = () => {
    if (isEditing) {
      handleSaveDay();
    } else {
      setEditLabel(label ?? '');
      setEditNotes(notes ?? '');
      setEditTemplateId(templateClientId);
      setIsEditing(true);
    }
  };

  const handleEditExercises = () => {
    if (templateClientId) {
      onClose();
      router.push(`/template/${templateClientId}`);
    }
  };

  const handleRemoveWorkout = () => {
    Alert.alert(
      'Remove Workout',
      'This will set the day to rest. You can reassign a workout later.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            await updatePlanDay({
              planClientId,
              week,
              dayOfWeek,
              clearTemplate: true,
              status: 'rest',
              label: '',
            });
            lightHaptic();
          },
        },
      ]
    );
  };

  const editTemplateName = editTemplateId
    ? templates.find((t) => t.id === editTemplateId)?.name ?? 'Unknown'
    : undefined;

  return (
    <Modal visible={modalVisible} transparent animationType="none">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <View style={{ flex: 1, justifyContent: 'flex-end' }}>
          {/* Overlay */}
          <Animated.View
            style={{
              ...StyleSheet.absoluteFillObject,
              backgroundColor: 'rgba(0,0,0,0.5)',
              opacity: overlayOpacity,
            }}
          />
          {/* Tap-to-dismiss area */}
          <Pressable onPress={onClose} style={{ flex: 1 }} />
          {/* Sheet */}
          <Animated.View
            style={{ maxHeight: '80%', transform: [{ translateY: sheetTranslateY }] }}
            className="rounded-t-3xl bg-background"
          >
            {/* Header */}
            <View className="flex-row items-center justify-between px-6 pb-2 pt-6">
              <View className="flex-1">
                <Text className="text-lg font-bold">{label ?? 'Rest Day'}</Text>
                <Text className="text-sm text-muted-foreground">
                  Week {week} · {DAY_NAMES[dayOfWeek]}
                </Text>
              </View>
              <Pressable onPress={handleToggleEdit} className="p-2">
                {isEditing ? (
                  <Check size={20} color={primaryColor} />
                ) : (
                  <Pencil size={20} color={colorScheme === 'dark' ? '#9ca3af' : '#6b7280'} />
                )}
              </Pressable>
              <Pressable onPress={onClose} className="p-2">
                <X size={20} color={colorScheme === 'dark' ? '#9ca3af' : '#6b7280'} />
              </Pressable>
            </View>

            <ScrollView
              className="px-6"
              style={{ maxHeight: 400 }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {isEditing ? (
                /* ── Edit Mode ── */
                <View className="pb-4">
                  <Text className="mb-1 text-xs font-medium text-muted-foreground">LABEL</Text>
                  <TextInput
                    value={editLabel}
                    onChangeText={setEditLabel}
                    placeholder="Day label (e.g. Push Day)"
                    placeholderTextColor="#9ca3af"
                    className="mb-4 rounded-xl border border-input bg-card px-4 py-3 text-foreground"
                  />

                  <Text className="mb-1 text-xs font-medium text-muted-foreground">NOTES</Text>
                  <TextInput
                    value={editNotes}
                    onChangeText={setEditNotes}
                    placeholder="Notes (optional)"
                    placeholderTextColor="#9ca3af"
                    multiline
                    className="mb-4 rounded-xl border border-input bg-card px-4 py-3 text-foreground"
                    style={{ minHeight: 60 }}
                  />

                  <Text className="mb-1 text-xs font-medium text-muted-foreground">WORKOUT</Text>
                  <Pressable
                    onPress={() => setShowTemplatePicker(true)}
                    className="mb-3 flex-row items-center justify-between rounded-xl border border-input bg-card px-4 py-3"
                  >
                    <Text className={editTemplateId ? 'text-foreground' : 'text-muted-foreground'}>
                      {editTemplateName ?? 'No workout (Rest Day)'}
                    </Text>
                    <ChevronRight size={16} color="#9ca3af" />
                  </Pressable>

                  {editTemplateId && (
                    <Pressable
                      onPress={() => setEditTemplateId(undefined)}
                      className="flex-row items-center justify-center gap-2 rounded-xl border border-border bg-muted py-3"
                    >
                      <Moon size={16} color={colorScheme === 'dark' ? '#9ca3af' : '#6b7280'} />
                      <Text className="text-sm font-medium text-muted-foreground">Set as Rest Day</Text>
                    </Pressable>
                  )}
                </View>
              ) : (
                /* ── View Mode ── */
                <View>
                  {/* Status badge */}
                  <View className="pb-3">
                    <View
                      className={cn(
                        'self-start rounded-full px-3 py-1',
                        status === 'completed' && 'bg-green-500/15',
                        status === 'skipped' && 'bg-yellow-500/10',
                        isMissed && 'bg-red-500/10',
                        status === 'pending' && !isMissed && 'bg-primary/10',
                        status === 'rest' && 'bg-muted'
                      )}
                    >
                      <Text
                        className={cn(
                          'text-xs font-medium capitalize',
                          status === 'completed' && 'text-green-500',
                          status === 'skipped' && 'text-yellow-600',
                          isMissed && 'text-red-500',
                          status === 'pending' && !isMissed && 'text-primary',
                          status === 'rest' && 'text-muted-foreground'
                        )}
                      >
                        {isMissed ? 'missed' : status}
                      </Text>
                    </View>
                  </View>

                  {/* Notes */}
                  {notes && (
                    <View className="pb-3">
                      <Text className="text-sm text-muted-foreground">{notes}</Text>
                    </View>
                  )}

                  {/* Exercise list */}
                  {template && (
                    <View>
                      <View className="flex-row items-center justify-between mb-2">
                        <Text className="text-sm font-medium text-muted-foreground">Exercises</Text>
                        <Pressable onPress={handleEditExercises}>
                          <Text className="text-xs font-medium text-primary">Edit</Text>
                        </Pressable>
                      </View>
                      {template.exercises.map((exercise) => (
                        <View
                          key={exercise.id}
                          className="mb-2 flex-row items-center gap-3 rounded-xl border border-border bg-card p-3"
                        >
                          <View className="h-8 w-8 items-center justify-center rounded-full bg-primary/10">
                            <Dumbbell size={14} color={primaryColor} />
                          </View>
                          <View className="flex-1">
                            <Text className="text-sm font-medium">{exercise.name}</Text>
                            <Text className="text-xs text-muted-foreground">
                              {exercise.defaultSetsCount} sets · {exercise.restTimeSeconds}s rest
                            </Text>
                          </View>
                        </View>
                      ))}
                    </View>
                  )}

                  {/* Template notes */}
                  {template?.notes && (
                    <View className="pb-3">
                      <Text className="text-sm text-muted-foreground italic">{template.notes}</Text>
                    </View>
                  )}
                </View>
              )}
            </ScrollView>

            {/* Footer actions (non-edit mode only) */}
            {!isEditing && (
              <View className="px-6 pb-8 pt-4">
                {/* Completed indicator */}
                {templateClientId && status === 'completed' && (
                  <View className="flex-row items-center justify-center gap-2 rounded-xl bg-green-500/10 py-4 mb-3">
                    <Check size={18} color="#22c55e" />
                    <Text className="text-base font-semibold text-green-500">Workout Completed</Text>
                  </View>
                )}

                {/* Start Workout button */}
                {templateClientId && status !== 'completed' && (
                  <Pressable
                    onPress={onStartWorkout}
                    className="flex-row items-center justify-center gap-2 rounded-xl py-4 mb-3"
                    style={{ backgroundColor: primaryColor }}
                  >
                    <Play size={18} color="#fff" />
                    <Text className="text-base font-semibold text-white">Start Workout</Text>
                  </Pressable>
                )}

                {/* Move to / Remove workout buttons */}
                {templateClientId && (
                  <View className="flex-row gap-3">
                    {onMoveDay && (
                      <Pressable
                        onPress={() => onMoveDay(week, dayOfWeek)}
                        className="flex-1 flex-row items-center justify-center gap-2 rounded-xl border border-border bg-card py-3"
                      >
                        <ArrowRightLeft size={16} color={colorScheme === 'dark' ? '#9ca3af' : '#6b7280'} />
                        <Text className="text-sm font-medium text-muted-foreground">Move to...</Text>
                      </Pressable>
                    )}
                    <Pressable
                      onPress={handleRemoveWorkout}
                      className="flex-1 flex-row items-center justify-center gap-2 rounded-xl border border-destructive/30 py-3"
                    >
                      <Trash2 size={16} color="#ef4444" />
                      <Text className="text-sm font-medium text-destructive">Remove</Text>
                    </Pressable>
                  </View>
                )}

                {!templateClientId && (
                  <Text className="text-center text-sm text-muted-foreground">
                    Rest day — tap edit to assign a workout
                  </Text>
                )}
              </View>
            )}
          </Animated.View>
        </View>
      </KeyboardAvoidingView>

      {/* Template picker — always rendered so close animation can play */}
      <TemplatePicker
        visible={showTemplatePicker}
        onClose={() => setShowTemplatePicker(false)}
        onSelect={(id) => {
          setEditTemplateId(id);
          const selected = templates.find((t) => t.id === id);
          if (selected) {
            setEditLabel(selected.name);
            setEditNotes('');
          }
          setShowTemplatePicker(false);
        }}
        currentTemplateId={editTemplateId}
      />
    </Modal>
  );
}
