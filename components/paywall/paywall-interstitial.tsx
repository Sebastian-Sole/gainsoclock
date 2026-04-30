import { useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Pressable,
  ScrollView,
  View,
  findNodeHandle,
} from "react-native";

import { FounderLetter } from "@/components/paywall/founder-letter";
import { NonPromisePledge } from "@/components/paywall/non-promise-pledge";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronUp } from "lucide-react-native";

export type SubscriptionPeriodUnit = "day" | "week" | "month" | "year";

export type PaywallInterstitialProps = {
  priceString: string | null;
  introPriceString?: string | null;
  trialLength: string;
  trialEligible: boolean;
  subscriptionPeriod: { unit: SubscriptionPeriodUnit; numberOfUnits: number };
  ctaDisabled?: boolean;
  offlineMessage?: string | null;
  onCta: () => void;
  onSkip: () => void;
  onMethodology: () => void;
};

function formatPeriod(unit: SubscriptionPeriodUnit, numberOfUnits: number) {
  const base =
    unit === "year"
      ? "year"
      : unit === "month"
        ? "month"
        : unit === "week"
          ? "week"
          : "day";
  return numberOfUnits > 1 ? `${numberOfUnits} ${base}s` : base;
}

type AccordionRowProps = {
  title: string;
  testID?: string;
  children: React.ReactNode;
};

function AccordionRow({ title, testID, children }: AccordionRowProps) {
  const [expanded, setExpanded] = useState(false);
  return (
    <View className="rounded-xl border border-border bg-card">
      <Pressable
        onPress={() => setExpanded((v) => !v)}
        accessibilityRole="button"
        accessibilityLabel={title}
        accessibilityState={{ expanded }}
        testID={testID}
        className="flex-row items-center justify-between px-4 py-4"
      >
        <Text className="flex-1 text-base font-medium text-foreground">
          {title}
        </Text>
        <Icon
          as={expanded ? ChevronUp : ChevronDown}
          size={20}
          className="text-muted-foreground"
        />
      </Pressable>
      {expanded ? (
        <View className="border-t border-border px-4 py-4">{children}</View>
      ) : null}
    </View>
  );
}

export function PaywallInterstitial({
  priceString,
  introPriceString,
  trialLength,
  trialEligible,
  subscriptionPeriod,
  ctaDisabled,
  offlineMessage,
  onCta,
  onSkip,
  onMethodology,
}: PaywallInterstitialProps) {
  const headingRef = useRef<View>(null);
  const [reduceTransparency, setReduceTransparency] = useState(false);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceTransparencyEnabled?.()
      .then((on) => {
        if (mounted) setReduceTransparency(!!on);
      })
      .catch(() => {
        // API not available on platform — keep default (false).
      });
    const sub = AccessibilityInfo.addEventListener(
      "reduceTransparencyChanged",
      (on: boolean) => setReduceTransparency(!!on),
    );
    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);

  useEffect(() => {
    const handle = findNodeHandle(headingRef.current);
    if (handle != null) {
      AccessibilityInfo.setAccessibilityFocus(handle);
    }
  }, []);

  const period = formatPeriod(
    subscriptionPeriod.unit,
    subscriptionPeriod.numberOfUnits,
  );

  const disclosureCopy = (() => {
    if (offlineMessage) return offlineMessage;
    if (!priceString) {
      return "Pricing will load when you're back online.";
    }
    if (trialEligible) {
      return `${trialLength} free, then ${priceString}/${period}. Cancel anytime in Settings > Apple ID > Subscriptions.`;
    }
    return `${priceString}/${period}, cancel anytime in Settings > Apple ID > Subscriptions.`;
  })();

  const ctaLabel = trialEligible ? "Start trial" : "Subscribe";

  return (
    <ScrollView
      className={cn(
        "flex-1",
        reduceTransparency ? "bg-background" : "bg-background",
      )}
      contentContainerClassName="px-6 pb-10 pt-4"
      testID="paywall-interstitial"
    >
      <View ref={headingRef} accessibilityRole="header" className="gap-2">
        <Text className="text-3xl font-bold text-foreground">Fitbull Pro.</Text>
        <Text className="text-base text-muted-foreground">
          Plans that adapt to your week. Coach on call.
        </Text>
      </View>

      {/* 3.1.2 disclosure — above the fold. Readable in full (no truncation). */}
      <View className="mt-6 rounded-xl border border-border bg-card px-4 py-4">
        <Text
          className="text-base text-foreground"
          accessibilityLabel={disclosureCopy}
          testID="paywall-disclosure"
        >
          {disclosureCopy}
        </Text>
        {introPriceString && trialEligible ? (
          <Text className="mt-2 text-sm text-muted-foreground">
            {introPriceString}
          </Text>
        ) : null}
      </View>

      <View className="mt-4">
        <Button
          size="onboarding"
          onPress={onCta}
          disabled={ctaDisabled}
          accessibilityRole="button"
          accessibilityLabel={ctaLabel}
          testID="paywall-primary-cta"
        >
          <Text>{ctaLabel}</Text>
        </Button>
      </View>

      {/* Below fold */}
      <View className="mt-8 gap-3">
        <AccordionRow
          title="4 things we promise — tap to read"
          testID="paywall-pledge-accordion"
        >
          <NonPromisePledge />
        </AccordionRow>

        <AccordionRow
          title="A note from the founder"
          testID="paywall-founder-accordion"
        >
          <FounderLetter />
        </AccordionRow>
      </View>

      <View className="mt-8 gap-3">
        <Pressable
          onPress={onMethodology}
          accessibilityRole="link"
          accessibilityLabel="How we build your plan"
          testID="paywall-methodology-link"
          hitSlop={10}
        >
          <Text className="text-base font-medium text-primary underline">
            How we build your plan
          </Text>
        </Pressable>
        <Pressable
          onPress={onSkip}
          accessibilityRole="button"
          accessibilityLabel="I'll decide later"
          testID="paywall-skip"
          hitSlop={10}
        >
          <Text className="text-base font-medium text-primary underline">
            I&apos;ll decide later
          </Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}
