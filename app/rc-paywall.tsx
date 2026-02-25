import React, { useCallback, useRef } from "react";
import { Alert } from "react-native";
import { useRouter } from "expo-router";
import { usePurchases } from "@/hooks/use-purchases";
import RevenueCatUI from "react-native-purchases-ui";
import { useSubscriptionStore } from "@/stores/subscription-store";

export default function RCPaywallScreen() {
  const router = useRouter();
  const { checkStatus } = usePurchases();
  const handledCompletionRef = useRef(false);

  const handleSuccess = useCallback(() => {
    handledCompletionRef.current = true;
    router.push("/purchase-success");
  }, [router]);

  const handleDismiss = useCallback(async () => {
    if (handledCompletionRef.current) return;

    // Fallback: paywall can dismiss after purchase callbacks on some SDK flows.
    await checkStatus();
    if (useSubscriptionStore.getState().isPro) {
      handleSuccess();
      return;
    }

    router.back();
  }, [checkStatus, handleSuccess, router]);

  const handleRestoreCompleted = useCallback(async () => {
    await checkStatus();
    if (useSubscriptionStore.getState().isPro) {
      handleSuccess();
      return;
    }

    Alert.alert(
      "No Active Subscription",
      "Purchases were restored, but no active Pro subscription was found."
    );
  }, [checkStatus, handleSuccess]);

  return (
    <RevenueCatUI.Paywall
      onPurchaseCompleted={() => {
        handleSuccess();
      }}
      onRestoreCompleted={() => {
        void handleRestoreCompleted();
      }}
      onDismiss={() => {
        void handleDismiss();
      }}
      onPurchaseError={({ error }: { error: any }) => {
        Alert.alert(
          "Purchase Failed",
          error?.message ||
            "Something went wrong with your purchase. Please try again."
        );
        router.back();
      }}
    />
  );
}
