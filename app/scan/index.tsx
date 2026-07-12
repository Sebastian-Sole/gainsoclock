import React, { useRef, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, TextInput, View } from 'react-native';
import { keyboardDoneAccessoryID } from '@/components/shared/keyboard-done-accessory';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { useAction } from 'convex/react';
import { useRouter } from 'expo-router';
import { format } from 'date-fns';
import { Camera, Flashlight, FlashlightOff, ScanBarcode, X } from 'lucide-react-native';

import { api } from '@/convex/_generated/api';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { LogMealModal } from '@/components/nutrition/log-meal-modal';
import { parseLocaleNumber } from '@/lib/format';
import { lightHaptic } from '@/lib/haptics';
import { scalePer100gMacros } from '@/lib/ingredient-macros';
import { cn } from '@/lib/utils';
import { useIngredientStore } from '@/stores/ingredient-store';
import { useMealLogStore } from '@/stores/meal-log-store';
import type { Macros } from '@/lib/types';

// --- Backend contract (api.barcode.lookupBarcode) ---
// Local copies of the action result shape; the generated types land when the
// concurrent backend agent's functions deploy.

interface BarcodeProduct {
  title: string;
  per100g: Macros;
  servingSizeG?: number;
  imageUrl?: string;
}

type LookupResult =
  | { status: 'ok'; product: BarcodeProduct }
  | { status: 'not_found' }
  | { status: 'error' };

type ScanState =
  | { kind: 'scanning' }
  | { kind: 'looking_up'; code: string }
  | { kind: 'found'; code: string; product: BarcodeProduct }
  | { kind: 'not_found'; code: string }
  | { kind: 'error'; code: string };

/** Ignore repeat scans of the same code within this window. */
const SAME_CODE_DEBOUNCE_MS = 3000;

const BARCODE_TYPES = ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128'] as const;

function getToday(): string {
  return format(new Date(), 'yyyy-MM-dd');
}

export default function ScanScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const addMeal = useMealLogStore((s) => s.addMeal);
  const addIngredient = useIngredientStore((s) => s.addIngredient);
  const lookupBarcode = useAction(api.barcode.lookupBarcode);

  const [state, setState] = useState<ScanState>({ kind: 'scanning' });
  const [torchOn, setTorchOn] = useState(false);
  const [grams, setGrams] = useState('100');
  const [showManualModal, setShowManualModal] = useState(false);
  const [ingredientSaved, setIngredientSaved] = useState(false);

  // Debounce bookkeeping — refs (not state) because the scanner callback
  // fires many times per second and this must not trigger re-renders.
  const lastScanRef = useRef<{ code: string; at: number } | null>(null);
  const busyRef = useRef(false);

  const handleBarcodeScanned = ({ data }: BarcodeScanningResult) => {
    if (!data || busyRef.current) return;
    const now = Date.now();
    const last = lastScanRef.current;
    if (last && last.code === data && now - last.at < SAME_CODE_DEBOUNCE_MS) return;
    lastScanRef.current = { code: data, at: now };
    busyRef.current = true;

    setState({ kind: 'looking_up', code: data });
    lightHaptic();

    lookupBarcode({ code: data })
      .then((result: LookupResult) => {
        if (result.status === 'ok') {
          setGrams(String(result.product.servingSizeG ?? 100));
          setIngredientSaved(false);
          setState({ kind: 'found', code: data, product: result.product });
        } else if (result.status === 'not_found') {
          setState({ kind: 'not_found', code: data });
        } else {
          setState({ kind: 'error', code: data });
        }
      })
      .catch(() => {
        setState({ kind: 'error', code: data });
      });
  };

  const resumeScanning = () => {
    busyRef.current = false;
    setIngredientSaved(false);
    setState({ kind: 'scanning' });
  };

  const computeMacros = (product: BarcodeProduct): Macros | null =>
    scalePer100gMacros(product.per100g, parseLocaleNumber(grams));

  const handleSaveIngredient = () => {
    if (state.kind !== 'found' || ingredientSaved) return;

    addIngredient({
      name: state.product.title,
      per100g: state.product.per100g,
      servingSizeG: state.product.servingSizeG,
      barcode: state.code,
      imageUrl: state.product.imageUrl,
      source: 'barcode',
    });

    lightHaptic();
    setIngredientSaved(true);
  };

  const handleLog = () => {
    if (state.kind !== 'found') return;
    const macros = computeMacros(state.product);
    if (!macros) return;
    const g = parseLocaleNumber(grams);

    addMeal({
      date: getToday(),
      title: state.product.title,
      portionMultiplier: 1,
      macros,
      notes: g !== null ? `${g} g` : undefined,
    });

    lightHaptic();
    router.back();
  };

  // --- Permission states ---

  if (!permission) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View
        className="flex-1 items-center justify-center bg-background px-8"
        style={{ paddingTop: insets.top }}
      >
        <Pressable
          onPress={() => router.back()}
          className="absolute right-4 p-2"
          style={{ top: insets.top + 8 }}
          accessibilityRole="button"
          accessibilityLabel="Close barcode scanner"
          testID="scan-close"
        >
          <Icon as={X} size={24} className="text-foreground" />
        </Pressable>
        <Icon as={Camera} size={32} className="text-primary" />
        <Text className="mt-4 text-center text-lg font-semibold">Camera access needed</Text>
        <Text className="mt-2 text-center text-muted-foreground">
          Fitbull uses the camera to scan food barcodes so you can log packaged foods in seconds.
        </Text>
        <Pressable
          onPress={() => {
            if (permission.canAskAgain) {
              requestPermission();
            } else {
              Linking.openSettings();
            }
          }}
          className="mt-6 w-full items-center rounded-xl bg-primary py-4"
          accessibilityRole="button"
          accessibilityLabel={
            permission.canAskAgain ? 'Allow camera access' : 'Open device settings'
          }
          testID="scan-grant-permission"
        >
          <Text className="font-medium text-primary-foreground">
            {permission.canAskAgain ? 'Allow Camera Access' : 'Open Settings'}
          </Text>
        </Pressable>
      </View>
    );
  }

  const macroPreview = state.kind === 'found' ? computeMacros(state.product) : null;

  return (
    <View className="flex-1 bg-background">
      <CameraView
        style={{ flex: 1 }}
        facing="back"
        enableTorch={torchOn}
        barcodeScannerSettings={{ barcodeTypes: [...BARCODE_TYPES] }}
        onBarcodeScanned={state.kind === 'scanning' ? handleBarcodeScanned : undefined}
        testID="scan-camera"
        accessibilityLabel="Barcode scanner camera"
      />

      {/* Top controls */}
      <View
        className="absolute left-0 right-0 flex-row items-center justify-between px-4"
        style={{ top: insets.top + 8 }}
      >
        <Pressable
          onPress={() => router.back()}
          className="h-11 w-11 items-center justify-center rounded-full bg-black/50"
          accessibilityRole="button"
          accessibilityLabel="Close barcode scanner"
          testID="scan-close"
        >
          <Icon as={X} size={22} className="text-white" />
        </Pressable>
        <Text className="font-semibold text-white">Scan Barcode</Text>
        <Pressable
          onPress={() => setTorchOn((v) => !v)}
          className="h-11 w-11 items-center justify-center rounded-full bg-black/50"
          accessibilityRole="button"
          accessibilityLabel={torchOn ? 'Turn torch off' : 'Turn torch on'}
          accessibilityState={{ selected: torchOn }}
          testID="scan-torch"
        >
          <Icon as={torchOn ? Flashlight : FlashlightOff} size={22} className="text-white" />
        </Pressable>
      </View>

      {/* Scan frame overlay */}
      {(state.kind === 'scanning' || state.kind === 'looking_up') && (
        <View pointerEvents="none" className="absolute inset-0 items-center justify-center">
          <View className="h-44 w-72 rounded-2xl border-2 border-white/80" />
          <Text className="mt-4 text-white/90">
            {state.kind === 'looking_up' ? 'Looking up product…' : 'Point at a barcode'}
          </Text>
        </View>
      )}

      {/* Bottom card */}
      {state.kind !== 'scanning' && (
        <View
          className="absolute bottom-0 left-0 right-0 rounded-t-2xl bg-background px-4 pt-4"
          style={{ paddingBottom: insets.bottom + 16 }}
        >
          {state.kind === 'looking_up' && (
            <View className="flex-row items-center justify-center gap-3 py-6">
              <ActivityIndicator />
              <Text className="text-muted-foreground">Looking up product…</Text>
            </View>
          )}

          {state.kind === 'found' && (
            <>
              <Text className="text-lg font-semibold" testID="scan-product-title">
                {state.product.title}
              </Text>
              <Text className="mt-1 text-sm text-muted-foreground">
                Per 100 g: {state.product.per100g.calories} cal · {state.product.per100g.protein}g
                P · {state.product.per100g.carbs}g C · {state.product.per100g.fat}g F
              </Text>

              <Text className="mb-2 mt-4 text-sm font-medium text-muted-foreground">
                QUANTITY (GRAMS)
              </Text>
              <TextInput
                value={grams}
                onChangeText={setGrams}
                placeholder="100"
                placeholderTextColor="#9ca3af"
                keyboardType="decimal-pad"
                inputAccessoryViewID={keyboardDoneAccessoryID}
                accessibilityLabel="Quantity in grams"
                testID="scan-quantity-input"
                className="rounded-xl border border-input bg-card px-4 py-3 text-[18px] text-foreground"
              />

              <View className="mt-3 flex-row justify-between rounded-xl border border-border bg-card p-4">
                {(['calories', 'protein', 'carbs', 'fat'] as const).map((key) => (
                  <View key={key} className="items-center">
                    <Text className="text-lg font-bold">
                      {macroPreview ? macroPreview[key] : '—'}
                      {key !== 'calories' && macroPreview ? 'g' : ''}
                    </Text>
                    <Text className="text-xs text-muted-foreground">{key}</Text>
                  </View>
                ))}
              </View>

              <Pressable
                onPress={handleSaveIngredient}
                disabled={ingredientSaved}
                className={cn(
                  'mt-4 items-center rounded-xl py-4',
                  ingredientSaved ? 'bg-primary/30' : 'bg-primary',
                )}
                accessibilityRole="button"
                accessibilityLabel={
                  ingredientSaved
                    ? 'Ingredient saved to library'
                    : 'Save this product as an ingredient'
                }
                accessibilityState={{ disabled: ingredientSaved }}
                testID="scan-save-ingredient"
              >
                <Text
                  className={cn(
                    'font-medium',
                    ingredientSaved ? 'text-primary-foreground/50' : 'text-primary-foreground',
                  )}
                >
                  {ingredientSaved ? 'Saved to Library' : 'Save Ingredient'}
                </Text>
              </Pressable>

              <View className="mt-3 flex-row gap-3">
                <Pressable
                  onPress={resumeScanning}
                  className="flex-1 items-center rounded-xl border border-border py-4"
                  accessibilityRole="button"
                  accessibilityLabel="Scan another barcode"
                  testID="scan-again"
                >
                  <Text className="font-medium">Scan Again</Text>
                </Pressable>
                <Pressable
                  onPress={handleLog}
                  disabled={!macroPreview}
                  className={cn(
                    'flex-1 items-center rounded-xl border py-4',
                    macroPreview ? 'border-primary' : 'border-border',
                  )}
                  accessibilityRole="button"
                  accessibilityLabel="Log this product"
                  accessibilityState={{ disabled: !macroPreview }}
                  testID="scan-log-button"
                >
                  <Text
                    className={cn('font-medium', macroPreview ? 'text-primary' : 'text-muted-foreground')}
                  >
                    Log It
                  </Text>
                </Pressable>
              </View>
            </>
          )}

          {(state.kind === 'not_found' || state.kind === 'error') && (
            <>
              <View className="items-center pt-2">
                <Icon as={ScanBarcode} size={28} className="text-primary" />
                <Text className="mt-3 text-center text-lg font-semibold">
                  {state.kind === 'not_found' ? 'Not in database' : 'Lookup failed'}
                </Text>
                <Text className="mt-1 text-center text-muted-foreground">
                  {state.kind === 'not_found'
                    ? "We couldn't find this barcode. You can log the meal manually instead."
                    : 'Something went wrong looking up this barcode. Check your connection and try again.'}
                </Text>
              </View>
              <View className="mt-4 flex-row gap-3">
                <Pressable
                  onPress={resumeScanning}
                  className="flex-1 items-center rounded-xl border border-border py-4"
                  accessibilityRole="button"
                  accessibilityLabel="Scan again"
                  testID="scan-again"
                >
                  <Text className="font-medium">Scan Again</Text>
                </Pressable>
                {state.kind === 'not_found' && (
                  <Pressable
                    onPress={() => setShowManualModal(true)}
                    className="flex-1 items-center rounded-xl bg-primary py-4"
                    accessibilityRole="button"
                    accessibilityLabel="Log meal manually"
                    testID="scan-log-manually"
                  >
                    <Text className="font-medium text-primary-foreground">Log Manually</Text>
                  </Pressable>
                )}
              </View>
            </>
          )}
        </View>
      )}

      <LogMealModal
        visible={showManualModal}
        onClose={() => {
          setShowManualModal(false);
          router.back();
        }}
        date={getToday()}
      />
    </View>
  );
}
