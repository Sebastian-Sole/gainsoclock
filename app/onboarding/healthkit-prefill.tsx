import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Text } from '@/components/ui/text';
import { AgeGateBlock } from '@/components/onboarding/age-gate-block';
import { useHealthKit } from '@/hooks/use-healthkit';
import { capture } from '@/lib/analytics';
import {
  parseAgeYears,
  parseHeightCm,
  parseLocaleNumber,
  parseWeightKg,
} from '@/lib/format';
import { useIntakeDraftStore } from '@/stores/intake-draft-store';

type PrefillState = {
  age: string;
  weight: string;
  height: string;
  bodyFat: string;
};

function formatStat(value: number | null | undefined, digits = 1): string {
  if (value == null || !Number.isFinite(value)) return '';
  return Number.isInteger(value) ? String(value) : value.toFixed(digits);
}

export default function OnboardingHealthKitPrefillScreen() {
  const router = useRouter();
  const { getLatestStats } = useHealthKit();
  const weightKg = useIntakeDraftStore((s) => s.weightKg);
  const heightCm = useIntakeDraftStore((s) => s.heightCm);
  const bodyFatPercent = useIntakeDraftStore((s) => s.bodyFatPercent);
  const ageYears = useIntakeDraftStore((s) => s.ageYears);
  const setDraftField = useIntakeDraftStore((s) => s.setDraftField);

  const [values, setValues] = useState<PrefillState>(() => ({
    age: ageYears != null ? String(ageYears) : '',
    weight: formatStat(weightKg),
    height: formatStat(heightCm, 0),
    bodyFat: formatStat(bodyFatPercent),
  }));
  const [errors, setErrors] = useState<Partial<PrefillState>>({});
  const [showAgeGate, setShowAgeGate] = useState(false);

  // Capture the snapshot of prefilled values when the screen mounts so we can
  // detect if the user edited any of them — which flips `dataSource` to
  // "mixed".
  const prefilledSnapshot = useRef<{
    weight: string;
    height: string;
    bodyFat: string;
  }>({
    weight: formatStat(weightKg),
    height: formatStat(heightCm, 0),
    bodyFat: formatStat(bodyFatPercent),
  });

  // Performance #10: prefill ≤ 300ms. If the draft is missing any field we
  // re-query here (the primer screen already fires getLatestStats; this is a
  // belt-and-suspenders refresh for direct navigation cases).
  useEffect(() => {
    let mounted = true;
    void getLatestStats().then((stats) => {
      if (!mounted) return;
      if (weightKg == null && stats.weightKg != null) {
        setDraftField('weightKg', stats.weightKg);
        const formatted = formatStat(stats.weightKg);
        prefilledSnapshot.current.weight = formatted;
        setValues((v) => ({ ...v, weight: formatted }));
      }
      if (heightCm == null && stats.heightCm != null) {
        setDraftField('heightCm', stats.heightCm);
        const formatted = formatStat(stats.heightCm, 0);
        prefilledSnapshot.current.height = formatted;
        setValues((v) => ({ ...v, height: formatted }));
      }
      if (bodyFatPercent == null && stats.bodyFatPercent != null) {
        setDraftField('bodyFatPercent', stats.bodyFatPercent);
        const formatted = formatStat(stats.bodyFatPercent);
        prefilledSnapshot.current.bodyFat = formatted;
        setValues((v) => ({ ...v, bodyFat: formatted }));
      }
    });
    return () => {
      mounted = false;
    };
    // Intentionally only on mount — later edits come through onChangeText.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const validation = useMemo(() => {
    const next: Partial<PrefillState> = {};
    const age = parseAgeYears(values.age);
    const weight = parseWeightKg(values.weight);
    const height = parseHeightCm(values.height);
    const bodyFatRaw = parseLocaleNumber(values.bodyFat);
    const bodyFat = bodyFatRaw == null ? null : bodyFatRaw;

    if (values.age.trim().length > 0 && age == null) {
      const n = parseLocaleNumber(values.age);
      next.age =
        n != null && Number.isInteger(n) && n < 16
          ? 'You must be 16 or older.'
          : 'Enter an age between 16 and 100.';
    }
    if (values.weight.trim().length > 0 && weight == null) {
      next.weight = 'Weight must be between 30 and 250 kg.';
    }
    if (values.height.trim().length > 0 && height == null) {
      next.height = 'Height must be between 120 and 230 cm.';
    }
    if (values.bodyFat.trim().length > 0) {
      if (bodyFat == null || bodyFat < 3 || bodyFat > 60) {
        next.bodyFat = 'Body fat must be between 3 and 60%.';
      }
    }
    return {
      errors: next,
      age,
      weight,
      height,
      bodyFat,
    };
  }, [values]);

  useEffect(() => {
    setErrors(validation.errors);
  }, [validation.errors]);

  const canContinue =
    validation.age != null &&
    validation.weight != null &&
    validation.height != null &&
    Object.keys(validation.errors).length === 0;

  const handleContinue = useCallback(() => {
    if (validation.age != null && validation.age < 16) {
      setShowAgeGate(true);
      return;
    }
    if (!canContinue) return;

    setDraftField('ageYears', validation.age ?? undefined);
    setDraftField('weightKg', validation.weight ?? undefined);
    setDraftField('heightCm', validation.height ?? undefined);
    if (validation.bodyFat != null) {
      setDraftField('bodyFatPercent', validation.bodyFat);
    }

    const edited =
      values.weight !== prefilledSnapshot.current.weight ||
      values.height !== prefilledSnapshot.current.height ||
      values.bodyFat !== prefilledSnapshot.current.bodyFat;
    const hadAnyPrefill =
      prefilledSnapshot.current.weight !== '' ||
      prefilledSnapshot.current.height !== '' ||
      prefilledSnapshot.current.bodyFat !== '';
    const dataSource: 'healthkit' | 'mixed' = !hadAnyPrefill
      ? 'mixed'
      : edited
        ? 'mixed'
        : 'healthkit';
    setDraftField('dataSource', dataSource);

    capture({
      name: 'manual_stats_complete',
      props: { dataSource },
    });

    router.push('/onboarding/consent' as never);
  }, [canContinue, router, setDraftField, validation, values]);

  if (showAgeGate) {
    return <AgeGateBlock />;
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      className="flex-1"
    >
      <ScrollView
        className="flex-1"
        contentContainerClassName="px-6 pb-10"
        keyboardShouldPersistTaps="handled"
      >
        <View className="pt-4">
          <Text variant="h2" className="border-b-0 pb-0">
            Confirm your stats.
          </Text>
          <Text className="mt-2 text-muted-foreground">
            We pulled these from Apple Health. Tweak anything that looks off.
          </Text>
        </View>

        <View className="mt-6 gap-5">
          <View>
            <Label nativeID="prefill-age-label" className="mb-2">
              Age
            </Label>
            <TextInput
              value={values.age}
              onChangeText={(t) => setValues((v) => ({ ...v, age: t }))}
              placeholder="e.g. 29"
              placeholderTextColor="#9ca3af"
              keyboardType="number-pad"
              accessibilityLabelledBy="prefill-age-label"
              className="min-h-[44px] rounded-xl border border-input bg-card px-4 py-3 text-[16px] text-foreground"
              testID="onboarding-prefill-age"
            />
            {errors.age ? (
              <Text className="mt-1 text-sm text-destructive">{errors.age}</Text>
            ) : null}
          </View>

          <View>
            <Label nativeID="prefill-weight-label" className="mb-2">
              Weight (kg)
            </Label>
            <TextInput
              value={values.weight}
              onChangeText={(t) => setValues((v) => ({ ...v, weight: t }))}
              placeholder="e.g. 78.5"
              placeholderTextColor="#9ca3af"
              keyboardType="decimal-pad"
              accessibilityLabelledBy="prefill-weight-label"
              className="min-h-[44px] rounded-xl border border-input bg-card px-4 py-3 text-[16px] text-foreground"
              testID="onboarding-prefill-weight"
            />
            {errors.weight ? (
              <Text className="mt-1 text-sm text-destructive">{errors.weight}</Text>
            ) : null}
          </View>

          <View>
            <Label nativeID="prefill-height-label" className="mb-2">
              Height (cm)
            </Label>
            <TextInput
              value={values.height}
              onChangeText={(t) => setValues((v) => ({ ...v, height: t }))}
              placeholder="e.g. 178"
              placeholderTextColor="#9ca3af"
              keyboardType="decimal-pad"
              accessibilityLabelledBy="prefill-height-label"
              className="min-h-[44px] rounded-xl border border-input bg-card px-4 py-3 text-[16px] text-foreground"
              testID="onboarding-prefill-height"
            />
            {errors.height ? (
              <Text className="mt-1 text-sm text-destructive">{errors.height}</Text>
            ) : null}
          </View>

          <View>
            <Label nativeID="prefill-bodyfat-label" className="mb-2">
              Body fat % (optional)
            </Label>
            <TextInput
              value={values.bodyFat}
              onChangeText={(t) => setValues((v) => ({ ...v, bodyFat: t }))}
              placeholder="e.g. 18.5"
              placeholderTextColor="#9ca3af"
              keyboardType="decimal-pad"
              accessibilityLabelledBy="prefill-bodyfat-label"
              className="min-h-[44px] rounded-xl border border-input bg-card px-4 py-3 text-[16px] text-foreground"
              testID="onboarding-prefill-bodyfat"
            />
            {errors.bodyFat ? (
              <Text className="mt-1 text-sm text-destructive">{errors.bodyFat}</Text>
            ) : null}
          </View>
        </View>

        <View className="mt-8">
          <Button
            size="onboarding"
            onPress={handleContinue}
            disabled={!canContinue}
            accessibilityRole="button"
            accessibilityLabel="Continue to consent step"
            accessibilityState={{ disabled: !canContinue }}
            testID="onboarding-prefill-continue"
          >
            <Text>Continue</Text>
          </Button>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
