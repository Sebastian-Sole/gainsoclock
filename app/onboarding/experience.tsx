import { useCallback } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';

import { Text } from '@/components/ui/text';
import { ExperienceChip } from '@/components/onboarding/experience-chip';
import { capture } from '@/lib/analytics';
import { useIntakeDraftStore, type Experience } from '@/stores/intake-draft-store';

type ChipConfig = {
  id: Experience;
  title: string;
  description: string;
  srDescription: string;
};

const CHIPS: readonly ChipConfig[] = [
  {
    id: 'beginner',
    title: 'Beginner',
    description: 'New to training, start slow.',
    srDescription: 'Beginner — new to training, start slow',
  },
  {
    id: 'returning',
    title: 'Returning',
    description: 'Some training history, coming back after a break.',
    srDescription:
      'Returning — some training history, coming back after a break',
  },
  {
    id: 'experienced',
    title: 'Experienced',
    description: 'Confident with programming, know your ceilings.',
    srDescription:
      'Experienced — confident with programming, know your ceilings',
  },
];

export default function OnboardingExperienceScreen() {
  const router = useRouter();
  const experience = useIntakeDraftStore((s) => s.experience);
  const setDraftField = useIntakeDraftStore((s) => s.setDraftField);

  const handleSelect = useCallback(
    (id: Experience) => {
      setDraftField('experience', id);
      capture({ name: 'experience_set', props: { experience: id } });
      router.push('/onboarding/days' as never);
    },
    [router, setDraftField],
  );

  return (
    <View className="flex-1 px-6 pb-8">
      <View className="pt-4">
        <Text variant="h2" className="border-b-0 pb-0">
          Experience.
        </Text>
        <Text className="mt-1 text-muted-foreground">
          Roughly where are you at?
        </Text>
      </View>

      <View className="mt-6 gap-3">
        {CHIPS.map((chip) => (
          <ExperienceChip
            key={chip.id}
            id={chip.id}
            title={chip.title}
            description={chip.description}
            srDescription={chip.srDescription}
            selected={experience === chip.id}
            onSelect={() => handleSelect(chip.id)}
          />
        ))}
      </View>
    </View>
  );
}
