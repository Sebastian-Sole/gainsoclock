import React, { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useAction, useMutation } from 'convex/react';
import { Camera, Images, Sparkles, TriangleAlert, UtensilsCrossed, X } from 'lucide-react-native';

import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { parseLocaleNumber } from '@/lib/format';
import { lightHaptic } from '@/lib/haptics';
import { cn } from '@/lib/utils';
import { usePurchases } from '@/hooks/use-purchases';
import { useMealLogStore } from '@/stores/meal-log-store';
import type { Macros } from '@/lib/types';

// --- Backend contract (api.nutritionVision) ---
// Local copies of the action/mutation result shapes; the generated types land
// when the concurrent backend agent's functions deploy.

type Confidence = 'low' | 'medium' | 'high';

interface MealPhotoEstimate {
  title: string;
  portionDescription?: string;
  macros: Macros;
  confidence: Confidence;
  assumptions: string[];
}

type AnalyzeResult =
  | { status: 'ok'; estimate: MealPhotoEstimate }
  | { status: 'error'; code: 'pro_required' | 'not_food' | 'failed' };

type Step =
  | { kind: 'choose' }
  | { kind: 'preview'; photoUri: string; mime: string }
  | { kind: 'analyzing'; photoUri: string }
  | { kind: 'review'; photoUri: string; storageId: Id<'_storage'>; estimate: MealPhotoEstimate }
  | { kind: 'error'; code: 'pro_required' | 'not_food' | 'failed'; photoUri?: string };

interface PhotoMealSheetProps {
  visible: boolean;
  onClose: () => void;
  date: string; // YYYY-MM-DD
}

const PICKER_OPTIONS: ImagePicker.ImagePickerOptions = {
  mediaTypes: ['images'],
  quality: 0.5,
  allowsEditing: false,
  exif: false,
  selectionLimit: 1,
};

export function PhotoMealSheet({ visible, onClose, date }: PhotoMealSheetProps) {
  const addMeal = useMealLogStore((s) => s.addMeal);
  const { presentPaywall } = usePurchases();

  const generateUploadUrl = useMutation(api.nutritionVision.generateMealPhotoUploadUrl);
  const registerMealPhoto = useMutation(api.nutritionVision.registerMealPhoto);
  const analyzeMealPhoto = useAction(api.nutritionVision.analyzeMealPhoto);
  const discardMealPhoto = useMutation(api.nutritionVision.discardMealPhoto);

  const [step, setStep] = useState<Step>({ kind: 'choose' });

  // Review-step editable fields
  const [title, setTitle] = useState('');
  const [calories, setCalories] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');

  const discardIfUploaded = (s: Step) => {
    if (s.kind === 'review') {
      discardMealPhoto({ storageId: s.storageId }).catch(() => {});
    }
  };

  const reset = () => {
    setStep({ kind: 'choose' });
    setTitle('');
    setCalories('');
    setProtein('');
    setCarbs('');
    setFat('');
  };

  const handleClose = () => {
    discardIfUploaded(step);
    reset();
    onClose();
  };

  const pick = async (source: 'camera' | 'library') => {
    let result: ImagePicker.ImagePickerResult;
    if (source === 'camera') {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) return;
      result = await ImagePicker.launchCameraAsync(PICKER_OPTIONS);
    } else {
      result = await ImagePicker.launchImageLibraryAsync(PICKER_OPTIONS);
    }
    if (result.canceled || result.assets.length === 0) return;
    const asset = result.assets[0];
    setStep({
      kind: 'preview',
      photoUri: asset.uri,
      mime: asset.mimeType ?? 'image/jpeg',
    });
  };

  const analyze = async (photoUri: string, mime: string) => {
    setStep({ kind: 'analyzing', photoUri });
    let storageId: Id<'_storage'> | null = null;
    try {
      // 1. Upload the photo to Convex storage
      const uploadUrl: string = await generateUploadUrl({});
      const photo = await fetch(photoUri);
      const blob = await photo.blob();
      const uploadResponse = await fetch(uploadUrl, {
        method: 'POST',
        headers: { 'Content-Type': mime },
        body: blob,
      });
      if (!uploadResponse.ok) throw new Error(`Upload failed: ${uploadResponse.status}`);
      const uploadJson: { storageId: Id<'_storage'> } = await uploadResponse.json();
      storageId = uploadJson.storageId;

      // 1b. Register ownership so analyze/discard can be enforced server-side.
      // A failure here throws into the catch below (same path as an upload
      // failure), which discards the photo and shows the error state.
      await registerMealPhoto({ storageId });

      // 2. Analyze
      const result: AnalyzeResult = await analyzeMealPhoto({ storageId });
      if (result.status === 'error') {
        if (storageId) discardMealPhoto({ storageId }).catch(() => {});
        setStep({ kind: 'error', code: result.code, photoUri });
        return;
      }

      const { estimate } = result;
      setTitle(estimate.title);
      setCalories(String(estimate.macros.calories));
      setProtein(String(estimate.macros.protein));
      setCarbs(String(estimate.macros.carbs));
      setFat(String(estimate.macros.fat));
      setStep({ kind: 'review', photoUri, storageId, estimate });
    } catch {
      if (storageId) discardMealPhoto({ storageId }).catch(() => {});
      setStep({ kind: 'error', code: 'failed', photoUri });
    }
  };

  const handleSave = () => {
    if (step.kind !== 'review' || !title.trim()) return;

    const macros: Macros = {
      calories: Math.round(parseLocaleNumber(calories) ?? 0),
      protein: Math.round(parseLocaleNumber(protein) ?? 0),
      carbs: Math.round(parseLocaleNumber(carbs) ?? 0),
      fat: Math.round(parseLocaleNumber(fat) ?? 0),
    };

    addMeal({
      date,
      title: title.trim(),
      portionMultiplier: 1,
      macros,
    });

    discardMealPhoto({ storageId: step.storageId }).catch(() => {});
    lightHaptic();
    reset();
    onClose();
  };

  const handleUpgrade = async () => {
    const result = await presentPaywall();
    if (result === 'purchased' && step.kind === 'error' && step.photoUri) {
      // Retake the flow from the preview so the new entitlement applies.
      setStep({ kind: 'choose' });
    }
  };

  const macroInputs: { label: string; value: string; set: (v: string) => void; testID?: string }[] = [
    { label: 'Calories', value: calories, set: setCalories, testID: 'photo-meal-calories-input' },
    { label: 'Protein (g)', value: protein, set: setProtein, testID: 'photo-meal-protein-input' },
    { label: 'Carbs (g)', value: carbs, set: setCarbs, testID: 'photo-meal-carbs-input' },
    { label: 'Fat (g)', value: fat, set: setFat, testID: 'photo-meal-fat-input' },
  ];

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1 bg-background"
      >
        {/* Header */}
        <View className="flex-row items-center justify-between px-4 pt-4 pb-2">
          <Text className="text-xl font-bold">Snap a Photo</Text>
          <Pressable
            onPress={handleClose}
            className="p-2"
            accessibilityRole="button"
            accessibilityLabel="Close photo meal logging"
            testID="photo-meal-close"
          >
            <Icon as={X} size={24} className="text-foreground" />
          </Pressable>
        </View>

        {step.kind === 'choose' && (
          <View className="flex-1 px-4 pt-4">
            <Text className="mb-4 text-muted-foreground">
              Take a photo of your meal and the AI coach estimates the macros for you.
            </Text>
            <Pressable
              onPress={() => pick('camera')}
              className="flex-row items-center justify-center gap-2 rounded-xl bg-primary py-4 mb-3"
              accessibilityRole="button"
              accessibilityLabel="Take a photo of your meal"
              testID="photo-meal-camera"
            >
              <Icon as={Camera} size={20} className="text-primary-foreground" />
              <Text className="font-semibold text-primary-foreground">Take Photo</Text>
            </Pressable>
            <Pressable
              onPress={() => pick('library')}
              className="flex-row items-center justify-center gap-2 rounded-xl border border-border py-4"
              accessibilityRole="button"
              accessibilityLabel="Choose a meal photo from your library"
              testID="photo-meal-library"
            >
              <Icon as={Images} size={20} className="text-foreground" />
              <Text className="font-semibold text-foreground">Choose from Library</Text>
            </Pressable>
          </View>
        )}

        {step.kind === 'preview' && (
          <View className="flex-1 px-4 pt-2">
            <Image
              source={{ uri: step.photoUri }}
              className="w-full flex-1 rounded-xl bg-muted"
              resizeMode="cover"
              accessibilityIgnoresInvertColors
            />
            <View className="flex-row gap-3 py-4">
              <Pressable
                onPress={() => setStep({ kind: 'choose' })}
                className="flex-1 items-center rounded-xl border border-border py-4"
                accessibilityRole="button"
                accessibilityLabel="Retake photo"
              >
                <Text className="font-medium">Retake</Text>
              </Pressable>
              <Pressable
                onPress={() => analyze(step.photoUri, step.mime)}
                className="flex-1 flex-row items-center justify-center gap-2 rounded-xl bg-primary py-4"
                accessibilityRole="button"
                accessibilityLabel="Analyze meal photo"
                testID="photo-meal-analyze"
              >
                <Icon as={Sparkles} size={18} className="text-primary-foreground" />
                <Text className="font-medium text-primary-foreground">Analyze</Text>
              </Pressable>
            </View>
          </View>
        )}

        {step.kind === 'analyzing' && (
          <View className="flex-1 px-4 pt-2" testID="photo-meal-analyzing">
            <Image
              source={{ uri: step.photoUri }}
              className="w-full flex-1 rounded-xl bg-muted opacity-60"
              resizeMode="cover"
              accessibilityIgnoresInvertColors
            />
            <View className="flex-row items-center justify-center gap-3 py-6">
              <ActivityIndicator />
              <Text className="text-muted-foreground">Analyzing your meal…</Text>
            </View>
          </View>
        )}

        {step.kind === 'review' && (
          <ScrollView
            className="flex-1 px-4"
            keyboardShouldPersistTaps="handled"
            contentContainerClassName="pb-8"
          >
            <Image
              source={{ uri: step.photoUri }}
              className="h-40 w-full rounded-xl bg-muted mb-4"
              resizeMode="cover"
              accessibilityIgnoresInvertColors
            />

            <View className="flex-row items-center gap-2 mb-1">
              <Icon as={Sparkles} size={16} className="text-primary" />
              <Text className="text-sm font-medium text-muted-foreground">
                AI estimate — adjust if needed
              </Text>
            </View>
            {step.estimate.confidence === 'low' && (
              <View className="flex-row items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 mb-3">
                <Icon as={TriangleAlert} size={16} className="text-amber-500" />
                <Text className="flex-1 text-sm text-amber-600 dark:text-amber-400">
                  Low confidence — double-check these numbers before saving.
                </Text>
              </View>
            )}

            <Text className="mb-2 mt-2 text-sm font-medium text-muted-foreground">MEAL NAME</Text>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="e.g. Chicken & rice bowl"
              placeholderTextColor="#9ca3af"
              accessibilityLabel="Meal name"
              testID="photo-meal-title-input"
              className="mb-4 rounded-xl border border-input bg-card px-4 py-4 text-[18px] text-foreground"
            />

            <Text className="mb-2 text-sm font-medium text-muted-foreground">MACROS</Text>
            <View className="flex-row gap-2 mb-4">
              {macroInputs.map((input) => (
                <View key={input.label} className="flex-1">
                  <Text className="text-xs text-muted-foreground mb-1">{input.label}</Text>
                  <TextInput
                    value={input.value}
                    onChangeText={input.set}
                    placeholder="0"
                    placeholderTextColor="#9ca3af"
                    keyboardType="decimal-pad"
                    accessibilityLabel={input.label}
                    testID={input.testID}
                    className="rounded-xl border border-input bg-card px-3 py-3 text-foreground text-center"
                  />
                </View>
              ))}
            </View>

            {(step.estimate.portionDescription || step.estimate.assumptions.length > 0) && (
              <View className="rounded-xl border border-border bg-card p-4 mb-6">
                {step.estimate.portionDescription && (
                  <Text className="text-sm text-foreground mb-1">
                    Portion: {step.estimate.portionDescription}
                  </Text>
                )}
                {step.estimate.assumptions.map((assumption) => (
                  <Text key={assumption} className="text-sm text-muted-foreground">
                    • {assumption}
                  </Text>
                ))}
              </View>
            )}

            <Pressable
              onPress={handleSave}
              disabled={!title.trim()}
              className={cn(
                'items-center rounded-xl py-4',
                title.trim() ? 'bg-primary' : 'bg-primary/30',
              )}
              accessibilityRole="button"
              accessibilityLabel="Save meal log"
              accessibilityState={{ disabled: !title.trim() }}
              testID="photo-meal-save"
            >
              <Text
                className={cn(
                  'font-medium',
                  title.trim() ? 'text-primary-foreground' : 'text-primary-foreground/50',
                )}
              >
                Log Meal
              </Text>
            </Pressable>
          </ScrollView>
        )}

        {step.kind === 'error' && (
          <View className="flex-1 items-center justify-center px-8">
            {step.code === 'pro_required' ? (
              <>
                <Icon as={Sparkles} size={32} className="text-primary" />
                <Text className="mt-4 text-center text-lg font-semibold">
                  Photo logging is a Pro feature
                </Text>
                <Text className="mt-2 text-center text-muted-foreground">
                  Upgrade to Fitbull Pro to log meals from photos with AI macro estimates.
                </Text>
                <Pressable
                  onPress={handleUpgrade}
                  className="mt-6 w-full items-center rounded-xl bg-primary py-4"
                  accessibilityRole="button"
                  accessibilityLabel="Upgrade to Fitbull Pro"
                  testID="photo-meal-upgrade"
                >
                  <Text className="font-medium text-primary-foreground">Upgrade to Pro</Text>
                </Pressable>
              </>
            ) : (
              <>
                <Icon as={UtensilsCrossed} size={32} className="text-primary" />
                <Text className="mt-4 text-center text-lg font-semibold">
                  {step.code === 'not_food'
                    ? "That doesn't look like food"
                    : "Couldn't analyze the photo"}
                </Text>
                <Text className="mt-2 text-center text-muted-foreground">
                  {step.code === 'not_food'
                    ? 'Try a clearer photo of your meal — good lighting helps.'
                    : 'Something went wrong. Check your connection and try again.'}
                </Text>
                <Pressable
                  onPress={() => setStep({ kind: 'choose' })}
                  className="mt-6 w-full items-center rounded-xl bg-primary py-4"
                  accessibilityRole="button"
                  accessibilityLabel="Try another photo"
                  testID="photo-meal-retry"
                >
                  <Text className="font-medium text-primary-foreground">Try Again</Text>
                </Pressable>
              </>
            )}
          </View>
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}
