import { View } from 'react-native';

import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';

export type HealthKitPrimerSectionKind = 'wont-read' | 'read' | 'write' | 'revocation';

type Props = {
  kind: HealthKitPrimerSectionKind;
  heading: string;
  body: string;
};

const TONE: Record<HealthKitPrimerSectionKind, string> = {
  'wont-read': 'border-l-muted',
  read: 'border-l-primary',
  write: 'border-l-primary',
  revocation: 'border-l-muted',
};

// Mobile-A11y #4: one accessible group per section. Children are hidden from
// rotor-sweep so VoiceOver lands on the heading + the consolidated label
// rather than announcing each bullet. Without grouping the primer becomes an
// 8-item rotor nightmare.
export function HealthKitPrimerSection({ kind, heading, body }: Props) {
  const consolidatedLabel = `${heading}. ${body}`;
  return (
    <View
      accessible
      accessibilityLabel={consolidatedLabel}
      className={cn(
        'gap-1 rounded-xl border border-border bg-card px-4 py-3',
        'border-l-4',
        TONE[kind]
      )}
      testID={`healthkit-primer-section-${kind}`}
    >
      <View accessibilityRole="header">
        <Text className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {heading}
        </Text>
      </View>
      <Text className="text-base leading-6 text-foreground">{body}</Text>
    </View>
  );
}
