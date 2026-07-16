import { useMutation } from 'convex/react';
import { format } from 'date-fns';
import { CheckCircle2, Link2, X } from 'lucide-react-native';
import React from 'react';
import { Alert, Modal, Pressable, ScrollView, View } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { api } from '@/convex/_generated/api';
import {
  humanizeActivityType,
  type MergeCandidate,
} from '@/components/history/external-workout-card';
import type { ExternalWorkout } from '@/hooks/use-external-workouts';

export interface MergeReviewItem {
  workout: ExternalWorkout;
  suggested: MergeCandidate | null;
  candidates: MergeCandidate[];
}

interface MergeReviewModalProps {
  visible: boolean;
  onClose: () => void;
  items: MergeReviewItem[];
}

/**
 * Batch "review imported workouts" sheet (#117, option D). Lists every imported
 * Apple Health workout that has a same-day Fitbull log it could belong to, so
 * the user can resolve the backlog in one pass instead of one push per import.
 * Merging / keeping-separate mutates server state; Convex reactivity shrinks the
 * list as each is resolved, and the empty state confirms when it's done.
 */
export function MergeReviewModal({ visible, onClose, items }: MergeReviewModalProps) {
  const linkWorkout = useMutation(api.healthData.linkExternalWorkout);
  const unlinkWorkout = useMutation(api.healthData.unlinkExternalWorkout);

  const merge = (uuid: string, logClientId: string) => {
    linkWorkout({ healthKitUuid: uuid, workoutLogClientId: logClientId }).catch(() =>
      Alert.alert('Could Not Merge', 'Check your connection and try again.')
    );
  };
  const keepSeparate = (uuid: string) => {
    unlinkWorkout({ healthKitUuid: uuid }).catch(() =>
      Alert.alert('Something Went Wrong', 'Check your connection and try again.')
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View className="flex-1 bg-background">
        <View className="flex-row items-center justify-between border-b border-border px-4 py-4">
          <Pressable
            testID="merge-review-close"
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close"
            className="h-10 w-10 items-center justify-center"
          >
            <Icon as={X} size={24} className="text-foreground" />
          </Pressable>
          <Text className="text-lg font-semibold">Review imported workouts</Text>
          <View className="w-10" />
        </View>

        {items.length === 0 ? (
          <View className="flex-1 items-center justify-center px-8">
            <Icon as={CheckCircle2} size={40} className="text-primary" />
            <Text className="mt-3 text-center text-base font-medium">All caught up</Text>
            <Text className="mt-1 text-center text-sm text-muted-foreground">
              No imported workouts left to review.
            </Text>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Done"
              className="mt-6 rounded-lg bg-primary/10 px-5 py-2.5"
            >
              <Text className="text-sm font-medium text-primary">Done</Text>
            </Pressable>
          </View>
        ) : (
          <ScrollView contentContainerClassName="px-4 pt-4 pb-10">
            <Text className="mb-4 text-sm text-muted-foreground">
              {items.length} imported workout{items.length === 1 ? '' : 's'} might belong to a
              workout you logged in Fitbull. Merge to add heart rate and calories, or keep separate.
            </Text>

            {items.map(({ workout, suggested, candidates }) => (
              <View key={workout.healthKitUuid} className="mb-4">
                <Text className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {humanizeActivityType(workout.activityType)} ·{' '}
                  {format(new Date(workout.startedAt), 'EEE, MMM d')}
                </Text>

                {suggested && (
                  <Pressable
                    testID="merge-review-merge-suggested"
                    onPress={() => merge(workout.healthKitUuid, suggested.id)}
                    accessibilityRole="button"
                    accessibilityLabel={`Merge into your ${suggested.templateName} workout`}
                    className="mb-2 flex-row items-center justify-between rounded-xl bg-primary px-4 py-3"
                  >
                    <Text className="flex-1 text-sm font-medium text-primary-foreground">
                      Merge into {suggested.templateName}
                    </Text>
                    <Icon as={Link2} size={16} className="text-primary-foreground" />
                  </Pressable>
                )}

                {candidates
                  .filter((c) => c.id !== suggested?.id)
                  .map((c) => (
                    <Pressable
                      key={c.id}
                      testID="merge-review-merge-candidate"
                      onPress={() => merge(workout.healthKitUuid, c.id)}
                      accessibilityRole="button"
                      accessibilityLabel={`Merge into ${c.templateName}`}
                      className="mb-2 flex-row items-center justify-between rounded-xl border border-border bg-card px-4 py-3"
                    >
                      <Text className="flex-1 text-sm font-medium">
                        Merge into {c.templateName}
                      </Text>
                      <Icon as={Link2} size={16} className="text-primary" />
                    </Pressable>
                  ))}

                <Pressable
                  testID="merge-review-keep-separate"
                  onPress={() => keepSeparate(workout.healthKitUuid)}
                  accessibilityRole="button"
                  accessibilityLabel="Keep separate"
                  accessibilityHint="Stops suggesting a merge for this imported workout"
                  className="items-center py-2"
                >
                  <Text className="text-xs text-muted-foreground">Keep separate</Text>
                </Pressable>
              </View>
            ))}
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}
