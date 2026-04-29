import { useCallback } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthActions } from '@convex-dev/auth/react';

import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';

// AI-Safety #7: hard 16+ age gate. No workaround, no "come back later" path.
// Rendered inline (not routed to) so the user can't side-route around it.
export function AgeGateBlock() {
  const router = useRouter();
  const { signOut } = useAuthActions();

  const handleClose = useCallback(async () => {
    try {
      await signOut();
    } catch (error) {
      console.warn('[age-gate] signOut failed', error);
    }
    router.replace('/(auth)/sign-up' as never);
  }, [router, signOut]);

  return (
    <View
      accessible
      accessibilityViewIsModal
      accessibilityLabel="You must be 16 or older to use Fitbull"
      className="flex-1 items-center justify-center bg-background px-6"
      testID="onboarding-age-gate-block"
    >
      <View accessibilityRole="header">
        <Text variant="h2" className="border-b-0 pb-0 text-center">
          Thanks for stopping by.
        </Text>
      </View>
      <Text className="mt-4 text-center text-base text-muted-foreground">
        Fitbull is for users 16 and older. Please come back when you&apos;re
        eligible.
      </Text>
      <View className="mt-8 w-full">
        <Button
          size="onboarding"
          onPress={handleClose}
          accessibilityRole="button"
          accessibilityLabel="Close and return to sign-up"
          testID="onboarding-age-gate-close"
        >
          <Text>Close</Text>
        </Button>
      </View>
    </View>
  );
}
