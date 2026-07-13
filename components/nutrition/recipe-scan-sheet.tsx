import React, { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  View,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { useAction, useMutation } from 'convex/react';
import {
  Camera,
  ChefHat,
  FileText,
  Images,
  ScanText,
  Sparkles,
  X,
} from 'lucide-react-native';

import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { lightHaptic } from '@/lib/haptics';
import { cn } from '@/lib/utils';
import type { ScanErrorCode, ScannedRecipe, ScanRecipeResult } from '@/lib/recipe-scan';
import { usePurchases } from '@/hooks/use-purchases';

// Upload flow reuses the transient meal-photo storage infrastructure
// (generate URL → register ownership → discard); see convex/recipeVision.ts.

const MAX_IMAGES = 4;
const MAX_PDF_BYTES = 15 * 1024 * 1024;

interface PickedFile {
  uri: string;
  mime: string;
  kind: 'image' | 'pdf';
  name?: string;
}

type Step =
  | { kind: 'choose' }
  | { kind: 'preview'; files: PickedFile[] }
  | { kind: 'analyzing'; files: PickedFile[] }
  | { kind: 'error'; code: ScanErrorCode };

interface RecipeScanSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Called with the parsed recipe; the caller pre-fills its editable form. */
  onParsed: (recipe: ScannedRecipe) => void;
}

const IMAGE_PICKER_OPTIONS: ImagePicker.ImagePickerOptions = {
  mediaTypes: ['images'],
  quality: 0.5,
  allowsEditing: false,
  exif: false,
  allowsMultipleSelection: true,
  selectionLimit: MAX_IMAGES,
};

export function RecipeScanSheet({ visible, onClose, onParsed }: RecipeScanSheetProps) {
  const { presentPaywall } = usePurchases();

  const generateUploadUrl = useMutation(api.nutritionVision.generateMealPhotoUploadUrl);
  const registerUpload = useMutation(api.nutritionVision.registerMealPhoto);
  const discardUpload = useMutation(api.nutritionVision.discardMealPhoto);
  const scanRecipe = useAction(api.recipeVision.scanRecipe);

  const [step, setStep] = useState<Step>({ kind: 'choose' });

  const handleClose = () => {
    setStep({ kind: 'choose' });
    onClose();
  };

  const pickImages = async (source: 'camera' | 'library') => {
    let result: ImagePicker.ImagePickerResult;
    if (source === 'camera') {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) return;
      result = await ImagePicker.launchCameraAsync({
        ...IMAGE_PICKER_OPTIONS,
        allowsMultipleSelection: false,
      });
    } else {
      result = await ImagePicker.launchImageLibraryAsync(IMAGE_PICKER_OPTIONS);
    }
    if (result.canceled || result.assets.length === 0) return;
    setStep({
      kind: 'preview',
      files: result.assets.slice(0, MAX_IMAGES).map((asset) => ({
        uri: asset.uri,
        mime: asset.mimeType ?? 'image/jpeg',
        kind: 'image' as const,
      })),
    });
  };

  const pickPdf = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: 'application/pdf',
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (result.canceled || result.assets.length === 0) return;
    const asset = result.assets[0];
    if (asset.size != null && asset.size > MAX_PDF_BYTES) {
      setStep({ kind: 'error', code: 'too_large' });
      return;
    }
    setStep({
      kind: 'preview',
      files: [
        {
          uri: asset.uri,
          mime: asset.mimeType ?? 'application/pdf',
          kind: 'pdf',
          name: asset.name,
        },
      ],
    });
  };

  const analyze = async (files: PickedFile[]) => {
    setStep({ kind: 'analyzing', files });
    const uploaded: Id<'_storage'>[] = [];
    try {
      // 1. Upload each file to Convex storage and register ownership.
      const scanFiles: { storageId: Id<'_storage'>; kind: 'image' | 'pdf' }[] = [];
      for (const file of files) {
        const uploadUrl: string = await generateUploadUrl({});
        const fetched = await fetch(file.uri);
        const blob = await fetched.blob();
        const uploadResponse = await fetch(uploadUrl, {
          method: 'POST',
          headers: { 'Content-Type': file.mime },
          body: blob,
        });
        if (!uploadResponse.ok) throw new Error(`Upload failed: ${uploadResponse.status}`);
        const uploadJson: { storageId: Id<'_storage'> } = await uploadResponse.json();
        uploaded.push(uploadJson.storageId);
        await registerUpload({ storageId: uploadJson.storageId });
        scanFiles.push({ storageId: uploadJson.storageId, kind: file.kind });
      }

      // 2. Extract the structured recipe.
      const result: ScanRecipeResult = await scanRecipe({ files: scanFiles });
      if (result.status === 'error') {
        setStep({ kind: 'error', code: result.code });
        return;
      }

      // 3. Hand off to the editable create form — nothing is saved here.
      lightHaptic();
      setStep({ kind: 'choose' });
      onParsed(result.recipe);
      onClose();
    } catch {
      setStep({ kind: 'error', code: 'failed' });
    } finally {
      // Scan inputs are transient: discard regardless of outcome.
      for (const storageId of uploaded) {
        discardUpload({ storageId }).catch(() => {});
      }
    }
  };

  const handleUpgrade = async () => {
    const result = await presentPaywall();
    if (result === 'purchased') {
      setStep({ kind: 'choose' });
    }
  };

  const errorCopy: Record<Exclude<ScanErrorCode, 'pro_required'>, { title: string; body: string }> = {
    not_recipe: {
      title: "Couldn't find a recipe",
      body: 'Try a clearer photo of the recipe — make sure the ingredients and steps are visible.',
    },
    too_large: {
      title: 'That PDF is too large',
      body: 'PDFs up to 15 MB are supported. Try exporting a smaller file or photographing the page instead.',
    },
    failed: {
      title: "Couldn't scan the recipe",
      body: 'Something went wrong. Check your connection and try again.',
    },
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View className="flex-1 bg-background">
        {/* Header */}
        <View className="flex-row items-center justify-between px-4 pt-4 pb-2">
          <Text className="text-xl font-bold">Scan Recipe</Text>
          <Pressable
            onPress={handleClose}
            className="p-2"
            accessibilityRole="button"
            accessibilityLabel="Close recipe scanning"
            testID="recipe-scan-close"
          >
            <Icon as={X} size={24} className="text-foreground" />
          </Pressable>
        </View>

        {step.kind === 'choose' && (
          <View className="flex-1 px-4 pt-4">
            <Text className="mb-4 text-muted-foreground">
              Photograph a cookbook page or pick a PDF, and the AI coach turns it into an
              editable recipe. You review everything before saving.
            </Text>
            <Pressable
              onPress={() => pickImages('camera')}
              className="flex-row items-center justify-center gap-2 rounded-xl bg-primary py-4 mb-3"
              accessibilityRole="button"
              accessibilityLabel="Take a photo of the recipe"
              testID="recipe-scan-camera"
            >
              <Icon as={Camera} size={20} className="text-primary-foreground" />
              <Text className="font-semibold text-primary-foreground">Take Photo</Text>
            </Pressable>
            <Pressable
              onPress={() => pickImages('library')}
              className="flex-row items-center justify-center gap-2 rounded-xl border border-border py-4 mb-3"
              accessibilityRole="button"
              accessibilityLabel="Choose recipe photos from your library"
              accessibilityHint={`Up to ${MAX_IMAGES} photos of the same recipe`}
              testID="recipe-scan-library"
            >
              <Icon as={Images} size={20} className="text-foreground" />
              <Text className="font-semibold text-foreground">Choose from Library</Text>
            </Pressable>
            <Pressable
              onPress={pickPdf}
              className="flex-row items-center justify-center gap-2 rounded-xl border border-border py-4"
              accessibilityRole="button"
              accessibilityLabel="Choose a recipe PDF"
              testID="recipe-scan-pdf"
            >
              <Icon as={FileText} size={20} className="text-foreground" />
              <Text className="font-semibold text-foreground">Choose a PDF</Text>
            </Pressable>
          </View>
        )}

        {(step.kind === 'preview' || step.kind === 'analyzing') && (
          <View className="flex-1 px-4 pt-2">
            {step.files[0].kind === 'image' ? (
              <View className="w-full flex-1">
                <Image
                  source={{ uri: step.files[0].uri }}
                  className={cn(
                    'w-full flex-1 rounded-xl bg-muted',
                    step.kind === 'analyzing' && 'opacity-60',
                  )}
                  resizeMode="cover"
                  accessibilityIgnoresInvertColors
                />
                {step.files.length > 1 && (
                  <View className="absolute bottom-2 right-2 rounded-full bg-background/80 px-3 py-1">
                    <Text className="text-xs font-medium">{step.files.length} photos</Text>
                  </View>
                )}
              </View>
            ) : (
              <View className="w-full flex-1 items-center justify-center rounded-xl border border-border bg-card">
                <Icon as={FileText} size={40} className="text-muted-foreground" />
                <Text className="mt-3 px-6 text-center font-medium" numberOfLines={2}>
                  {step.files[0].name ?? 'Recipe PDF'}
                </Text>
              </View>
            )}

            {step.kind === 'preview' ? (
              <View className="flex-row gap-3 py-4">
                <Pressable
                  onPress={() => setStep({ kind: 'choose' })}
                  className="flex-1 items-center rounded-xl border border-border py-4"
                  accessibilityRole="button"
                  accessibilityLabel="Choose a different source"
                >
                  <Text className="font-medium">Choose Again</Text>
                </Pressable>
                <Pressable
                  onPress={() => analyze(step.files)}
                  className="flex-1 flex-row items-center justify-center gap-2 rounded-xl bg-primary py-4"
                  accessibilityRole="button"
                  accessibilityLabel="Scan this recipe"
                  testID="recipe-scan-analyze"
                >
                  <Icon as={ScanText} size={18} className="text-primary-foreground" />
                  <Text className="font-medium text-primary-foreground">Scan Recipe</Text>
                </Pressable>
              </View>
            ) : (
              <View className="flex-row items-center justify-center gap-3 py-6" testID="recipe-scan-analyzing">
                <ActivityIndicator />
                <Text className="text-muted-foreground">Reading the recipe… this takes a few seconds</Text>
              </View>
            )}
          </View>
        )}

        {step.kind === 'error' && (
          <View className="flex-1 items-center justify-center px-8">
            {step.code === 'pro_required' ? (
              <>
                <Icon as={Sparkles} size={32} className="text-primary" />
                <Text className="mt-4 text-center text-lg font-semibold">
                  Recipe scanning is a Pro feature
                </Text>
                <Text className="mt-2 text-center text-muted-foreground">
                  Upgrade to Fitbull Pro to import recipes from photos and PDFs.
                </Text>
                <Pressable
                  onPress={handleUpgrade}
                  className="mt-6 w-full items-center rounded-xl bg-primary py-4"
                  accessibilityRole="button"
                  accessibilityLabel="Upgrade to Fitbull Pro"
                  testID="recipe-scan-upgrade"
                >
                  <Text className="font-medium text-primary-foreground">Upgrade to Pro</Text>
                </Pressable>
              </>
            ) : (
              <>
                <Icon as={ChefHat} size={32} className="text-primary" />
                <Text className="mt-4 text-center text-lg font-semibold">
                  {errorCopy[step.code].title}
                </Text>
                <Text className="mt-2 text-center text-muted-foreground">
                  {errorCopy[step.code].body}
                </Text>
                <Pressable
                  onPress={() => setStep({ kind: 'choose' })}
                  className="mt-6 w-full items-center rounded-xl bg-primary py-4"
                  accessibilityRole="button"
                  accessibilityLabel="Try another source"
                  testID="recipe-scan-retry"
                >
                  <Text className="font-medium text-primary-foreground">Try Again</Text>
                </Pressable>
              </>
            )}
          </View>
        )}
      </View>
    </Modal>
  );
}
