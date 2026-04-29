import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { capture } from '@/lib/analytics';
import {
  parseAgeYears,
  parseHeightCm,
  parseLocaleNumber,
  parseWeightKg,
} from '@/lib/format';
import { useIntakeDraftStore } from '@/stores/intake-draft-store';

type ManualState = {
  age: string;
  weight: string;
  height: string;
  bodyFat: string;
};

export default function OnboardingManualStatsScreen() {
  const router = useRouter();
  const ageYears = useIntakeDraftStore((s) => s.ageYears);
  const weightKg = useIntakeDraftStore((s) => s.weightKg);
  const heightCm = useIntakeDraftStore((s) => s.heightCm);
  const bodyFatPercent = useIntakeDraftStore((s) => s.bodyFatPercent);
  const setDraftField = useIntakeDraftStore((s) => s.setDraftField);

  const [values, setValues] = useState<ManualState>(() => ({
    age: ageYears != null ? String(ageYears) : '',
    weight: weightKg != null ? String(weightKg) : '',
    height: heightCm != null ? String(heightCm) : '',
    bodyFat: bodyFatPercent != null ? String(bodyFatPercent) : '',
  }));
  const [errors, setErrors] = useState<Partial<ManualState>>({});
  const [showAgeGate, setShowAgeGate] = useState(false);

  const validation = useMemo(() => {
    const next: Partial<ManualState> = {};
    const age = parseAgeYears(values.age);
    const weight = parseWeightKg(values.weight);
    const height = parseHeightCm(values.height);
    const bodyFatRaw = parseLocaleNumber(values.bodyFat);

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
      if (bodyFatRaw == null || bodyFatRaw < 3 || bodyFatRaw > 60) {
        next.bodyFat = 'Body fat must be between 3 and 60%.';
      }
    }
    return {
      errors: next,
      age,
      weight,
      height,
      bodyFat: bodyFatRaw,
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
    setDraftField('dataSource', 'manual');

    capture({
      name: 'manual_stats_complete',
      props: { dataSource: 'manual' },
    });

    router.push('/onboarding/consent' as never);
  }, [canContinue, router, setDraftField, validation]);

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
            A few quick stats.
          </Text>
          <Text className="mt-2 text-muted-foreground">
            Stored on your device and in Fitbull&apos;s EU-region database.
          </Text>
        </View>

        <View className="mt-6 gap-5">
          <View>
            <Label nativeID="manual-age-label" className="mb-2">
              Age
            </Label>
            <TextInput
              value={values.age}
              onChangeText={(t) => setValues((v) => ({ ...v, age: t }))}
              placeholder="e.g. 29"
              placeholderTextColor="#9ca3af"
              keyboardType="number-pad"
              accessibilityLabelledBy="manual-age-label"
              className="min-h-[44px] rounded-xl border border-input bg-card px-4 py-3 text-[16px] text-foreground"
              testID="onboarding-manual-age"
            />
            {errors.age ? (
              <Text className="mt-1 text-sm text-destructive">{errors.age}</Text>
            ) : null}
          </View>

          <View>
            <Label nativeID="manual-weight-label" className="mb-2">
              Weight (kg)
            </Label>
            <TextInput
              value={values.weight}
              onChangeText={(t) => setValues((v) => ({ ...v, weight: t }))}
              placeholder="e.g. 78,5"
              placeholderTextColor="#9ca3af"
              keyboardType="decimal-pad"
              accessibilityLabelledBy="manual-weight-label"
              className="min-h-[44px] rounded-xl border border-input bg-card px-4 py-3 text-[16px] text-foreground"
              testID="onboarding-manual-weight"
            />
            {errors.weight ? (
              <Text className="mt-1 text-sm text-destructive">{errors.weight}</Text>
            ) : null}
          </View>

          <View>
            <Label nativeID="manual-height-label" className="mb-2">
              Height (cm)
            </Label>
            <TextInput
              value={values.height}
              onChangeText={(t) => setValues((v) => ({ ...v, height: t }))}
              placeholder="e.g. 178"
              placeholderTextColor="#9ca3af"
              keyboardType="decimal-pad"
              accessibilityLabelledBy="manual-height-label"
              className="min-h-[44px] rounded-xl border border-input bg-card px-4 py-3 text-[16px] text-foreground"
              testID="onboarding-manual-height"
            />
            {errors.height ? (
              <Text className="mt-1 text-sm text-destructive">{errors.height}</Text>
            ) : null}
          </View>

          <View>
            <Label nativeID="manual-bodyfat-label" className="mb-2">
              Body fat % (optional)
            </Label>
            <TextInput
              value={values.bodyFat}
              onChangeText={(t) => setValues((v) => ({ ...v, bodyFat: t }))}
              placeholder="e.g. 18,5"
              placeholderTextColor="#9ca3af"
              keyboardType="decimal-pad"
              accessibilityLabelledBy="manual-bodyfat-label"
              className="min-h-[44px] rounded-xl border border-input bg-card px-4 py-3 text-[16px] text-foreground"
              testID="onboarding-manual-bodyfat"
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
            testID="onboarding-manual-continue"
          >
            <Text>Continue</Text>
          </Button>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
