import { Pressable, ScrollView, View } from "react-native";

import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";

export type PurchasesPackageLite = {
  identifier: string;
  packageType?: string;
  product: {
    identifier: string;
    priceString: string;
    /**
     * Raw float price in store currency. Optional because some legacy SDK
     * paths only surface `priceString`. Used for cross-package math (e.g.
     * computing annual-vs-monthly savings).
     */
    price?: number;
    title?: string;
    description?: string;
    subscriptionPeriod?: { unit: string; numberOfUnits: number } | null;
    introPrice?: { periodNumberOfUnits?: number; periodUnit?: string } | null;
  };
};

export type PurchasesOfferingLite = {
  identifier: string;
  availablePackages: PurchasesPackageLite[];
};

type Props = {
  offering: PurchasesOfferingLite;
  eligibility: Record<string, boolean>;
  onPurchase: (pkg: PurchasesPackageLite) => void;
  onSkip: () => void;
};

function periodLabel(pkg: PurchasesPackageLite): string {
  const p = pkg.product.subscriptionPeriod;
  if (!p) return "";
  const unit = p.unit.toLowerCase();
  const base =
    unit === "year"
      ? "year"
      : unit === "month"
        ? "month"
        : unit === "week"
          ? "week"
          : "day";
  return p.numberOfUnits > 1 ? `${p.numberOfUnits} ${base}s` : base;
}

export function PaywallFallback({
  offering,
  eligibility,
  onPurchase,
  onSkip,
}: Props) {
  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="px-6 pb-10 pt-4"
      testID="paywall-fallback"
    >
      <Text className="text-2xl font-bold text-foreground">Choose a plan</Text>
      <Text className="mt-2 text-base text-muted-foreground">
        Cancel anytime in Settings &gt; Apple ID &gt; Subscriptions.
      </Text>

      <View className="mt-6 gap-3">
        {offering.availablePackages.map((pkg) => {
          const period = periodLabel(pkg);
          const eligible = eligibility[pkg.product.identifier] === true;
          const copy = eligible
            ? `7 days free, then ${pkg.product.priceString}${period ? `/${period}` : ""}`
            : `${pkg.product.priceString}${period ? `/${period}` : ""}`;
          return (
            <Button
              key={pkg.identifier}
              size="onboarding"
              onPress={() => onPurchase(pkg)}
              accessibilityRole="button"
              accessibilityLabel={copy}
              testID={`paywall-fallback-pkg-${pkg.identifier}`}
            >
              <Text>{copy}</Text>
            </Button>
          );
        })}
      </View>

      <View className="mt-8">
        <Pressable
          onPress={onSkip}
          accessibilityRole="button"
          accessibilityLabel="I'll decide later"
          testID="paywall-fallback-skip"
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
