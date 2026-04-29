import { useCallback, useState } from 'react';
import {
  Linking,
  Pressable,
  ScrollView,
  View,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation } from 'convex/react';

import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { ConsentRow } from '@/components/onboarding/consent-row';
import { IntakeSummaryList } from '@/components/onboarding/intake-summary-list';
import { api } from '@/convex/_generated/api';
import { capture } from '@/lib/analytics';
import { computeCombinedHash } from '@/lib/consent';
import { ERROR_COPY } from '@/lib/copy/errors';
import { useIntakeDraftStore } from '@/stores/intake-draft-store';

type ConsentState = {
  health_data_personalization: boolean;
  ai_coach_inference: boolean;
  analytics: boolean;
};

const INITIAL_CONSENTS: ConsentState = {
  health_data_personalization: false,
  ai_coach_inference: false,
  analytics: false,
};

export default function OnboardingConsentScreen() {
  const router = useRouter();
  const draft = useIntakeDraftStore();
  const clearDraft = useIntakeDraftStore((s) => s.clearDraft);
  const completeOnboarding = useMutation(api.onboarding.completeOnboardingV2);

  const [consents, setConsents] = useState<ConsentState>(INITIAL_CONSENTS);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requiredGranted =
    consents.health_data_personalization && consents.ai_coach_inference;
  const canSubmit =
    requiredGranted &&
    (draft.goals?.length ?? 0) > 0 &&
    draft.primaryGoal !== undefined &&
    draft.experience !== undefined &&
    (draft.trainingDaysOfWeek?.length ?? 0) > 0 &&
    !submitting;

  const toggle = useCallback((key: keyof ConsentState) => {
    setConsents((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const submit = useCallback(async () => {
    if (!canSubmit) return;
    if (
      !draft.primaryGoal ||
      !draft.goals ||
      !draft.experience ||
      !draft.trainingDaysOfWeek
    ) {
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const versionHash = await computeCombinedHash();
      await completeOnboarding({
        clientIntakeId: draft.clientIntakeId,
        goals: draft.goals,
        primaryGoal: draft.primaryGoal,
        experience: draft.experience,
        trainingDaysOfWeek: draft.trainingDaysOfWeek,
        ageYears: draft.ageYears,
        biologicalSex: draft.biologicalSex,
        weightKg: draft.weightKg,
        heightCm: draft.heightCm,
        bodyFatPercent: draft.bodyFatPercent,
        dataSource: draft.dataSource ?? 'manual',
        consents,
        consentVersionHash: versionHash,
      });
      const grantedPurposes = (
        Object.keys(consents) as (keyof ConsentState)[]
      ).filter((k) => consents[k]);
      capture({
        name: 'consent_granted',
        props: { versionHash, purposes: grantedPurposes },
      });
      clearDraft();
      router.replace('/onboarding/analysis' as never);
    } catch (e) {
      console.warn('[onboarding] completeOnboardingV2 failed', e);
      setError(ERROR_COPY.NETWORK_SYNC);
    } finally {
      setSubmitting(false);
    }
  }, [canSubmit, draft, completeOnboarding, consents, clearDraft, router]);

  const openSubProcessors = useCallback(() => {
    void Linking.openURL('fitbull://methodology').catch(() => {
      // plan-07 ships the methodology route; swallow failures until then.
    });
  }, []);

  return (
    <ScrollView
      className="flex-1"
      contentContainerClassName="px-6 pb-10"
      keyboardShouldPersistTaps="handled"
    >
      <View className="pt-4">
        <Text variant="h2" className="border-b-0 pb-0">
          Review and confirm.
        </Text>
        <Text className="mt-1 text-muted-foreground">
          Check your answers and grant the consents we need.
        </Text>
      </View>

      <View className="mt-6">
        <Text className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Your answers
        </Text>
        <IntakeSummaryList />
      </View>

      <View className="mt-8 gap-3">
        <Text className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Consents
        </Text>
        <ConsentRow
          purpose="health_data_personalization"
          boldLine="OK, use my weight, height, and workouts on this device to personalise my coach."
          finePrint="Stored locally and in Fitbull's EU-region Convex database. Not shared with advertisers."
          checked={consents.health_data_personalization}
          onToggle={() => toggle('health_data_personalization')}
        />
        <ConsentRow
          purpose="ai_coach_inference"
          boldLine="OK, send my profile (weight, height, age, training goals) to OpenAI (United States, under Standard Contractual Clauses) so the AI coach can generate my plan."
          finePrint="Only while generating your plan. OpenAI does not retain the data (30-day zero-retention)."
          checked={consents.ai_coach_inference}
          onToggle={() => toggle('ai_coach_inference')}
        />
        <ConsentRow
          purpose="analytics"
          boldLine="OK, send anonymous usage analytics to PostHog (Frankfurt, EU) so Fitbull can improve the app."
          finePrint="No body stats; IP address not captured."
          checked={consents.analytics}
          onToggle={() => toggle('analytics')}
        />
      </View>

      <Pressable
        accessibilityRole="link"
        accessibilityLabel="Read about sub-processors and data flow"
        onPress={openSubProcessors}
        className="mt-4"
        testID="consent-subprocessors-link"
      >
        <Text className="text-sm text-primary underline">
          Who processes this data?
        </Text>
      </Pressable>

      <Text className="mt-4 text-xs text-muted-foreground">
        You can withdraw this in Settings anytime.
      </Text>

      {error ? (
        <View
          accessibilityRole="alert"
          className="mt-6 gap-3 rounded-xl border border-destructive bg-destructive/10 px-4 py-3"
        >
          <Text className="text-sm text-destructive">{error}</Text>
          <Button
            size="onboarding"
            variant="outline"
            onPress={submit}
            disabled={submitting}
            accessibilityRole="button"
            accessibilityLabel="Retry submission"
            testID="onboarding-consent-retry"
          >
            <Text>Retry</Text>
          </Button>
        </View>
      ) : null}

      <View className="mt-6">
        <Button
          size="onboarding"
          onPress={submit}
          disabled={!canSubmit}
          accessibilityRole="button"
          accessibilityLabel="Submit and continue"
          accessibilityState={{ disabled: !canSubmit }}
          testID="onboarding-consent-submit"
        >
          {submitting ? (
            <ActivityIndicator />
          ) : (
            <Text>Continue</Text>
          )}
        </Button>
      </View>
    </ScrollView>
  );
}
