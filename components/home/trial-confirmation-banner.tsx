import { useRouter } from "expo-router";
import { X } from "lucide-react-native";
import { useEffect, useMemo, useRef } from "react";
import { Pressable, View } from "react-native";

import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { capture } from "@/lib/analytics";
import { useAuthCacheStore } from "@/stores/auth-cache-store";
import { useSubscriptionStore } from "@/stores/subscription-store";

const AUTO_DISMISS_MS = 24 * 60 * 60 * 1000; // 24h

function formatTrialEnd(iso: string | null): string {
  if (!iso) return "";
  const parsed = Date.parse(iso);
  if (!Number.isFinite(parsed)) return "";
  return new Date(parsed).toLocaleDateString();
}

export function TrialConfirmationBanner() {
  const router = useRouter();
  const status = useSubscriptionStore((s) => s.status);
  const trialExpiresAt = useSubscriptionStore((s) => s.trialExpiresAt);
  const firstShownAt = useAuthCacheStore((s) => s.trialBannerFirstShownAt);
  const dismissedPermanently = useAuthCacheStore(
    (s) => s.trialBannerDismissedPermanently,
  );
  const markShown = useAuthCacheStore((s) => s.markTrialBannerShown);
  const dismissPermanently = useAuthCacheStore(
    (s) => s.dismissTrialBannerPermanently,
  );
  const announcedRef = useRef(false);

  const autoDismissed = useMemo(() => {
    if (!firstShownAt) return false;
    const first = Date.parse(firstShownAt);
    if (!Number.isFinite(first)) return false;
    return Date.now() - first >= AUTO_DISMISS_MS;
  }, [firstShownAt]);

  const shouldShow =
    status === "trial" &&
    !!trialExpiresAt &&
    !dismissedPermanently &&
    !autoDismissed;

  useEffect(() => {
    if (!shouldShow || announcedRef.current) return;
    announcedRef.current = true;
    markShown();
    capture({ name: "trial_confirmation_shown", props: {} });
  }, [shouldShow, markShown]);

  if (!shouldShow) return null;

  const endLabel = formatTrialEnd(trialExpiresAt);

  return (
    <View
      className="mx-4 mb-3 flex-row items-center gap-3 rounded-xl border border-primary/20 bg-primary/10 px-4 py-3"
      accessibilityRole="summary"
      accessibilityLabel={`Trial active. 7 days free. Ends ${endLabel}. Manage in Settings.`}
      testID="trial-confirmation-banner"
    >
      <View className="flex-1">
        <Text className="text-sm font-semibold text-primary">
          Trial active · 7 days free · ends {endLabel}
        </Text>
        <Pressable
          onPress={() => router.push("/settings" as never)}
          hitSlop={8}
          accessibilityRole="link"
          accessibilityLabel="Manage in Settings"
          testID="trial-banner-manage"
        >
          <Text className="mt-1 text-xs font-medium text-primary underline">
            Manage in Settings
          </Text>
        </Pressable>
      </View>
      <Pressable
        onPress={dismissPermanently}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel="Dismiss trial banner"
        testID="trial-banner-dismiss"
        className="h-11 w-11 items-center justify-center"
      >
        <Icon as={X} size={18} className="text-primary" />
      </Pressable>
    </View>
  );
}
