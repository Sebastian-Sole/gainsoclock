# White Hat — Monetization Strategy: Paywall Timing, Auto-Trial Mechanics, RevenueCat Placement

**Session:** `onboarding-flow` · **Perspective:** White Hat (facts only, no opinions) · **Date:** 2026-04-21

Source confidence tags: 🟢 primary (official docs, code in repo, scout-cited case studies), 🟡 secondary (blog posts, third-party summaries), 🔴 unable to verify.

---

## 1. Paywall-placement options RevenueCat exposes

🟢 **Three integration modes** ([RevenueCat Paywalls overview](https://www.revenuecat.com/docs/tools/paywalls); [Displaying Paywalls](https://www.revenuecat.com/docs/tools/paywalls/displaying-paywalls)):

- **Remote-configured Paywalls (RevenueCat UI SDK).** "Remotely configure your entire paywall view without any code changes or app updates" — built from Dashboard templates or from scratch. One unique Paywall per Offering; unlimited Offerings allowed for testing.
- **Imperative API (`react-native-purchases-ui`).** Methods: `presentPaywall()`, `presentPaywallIfNeeded()`, and the embedded `PaywallView` component. Dismissal is handled via `onDismiss` callbacks. `displayCloseButton` is no longer required — close buttons are now paywall components.
- **Custom paywall UI fed by `getOfferings()`.** You build the UI yourself using the data shape returned by `Purchases.getOfferings()` and call `Purchases.purchasePackage(pkg)` directly.

🟢 **Package hierarchy**: Offering → Package → Product. "The `current` Offering" is the default shown when `getOfferings()` is called with no conditions ([Offerings overview](https://www.revenuecat.com/docs/offerings/overview)).

## 2. Mid-flow paywall triggering with per-variant offering selection

🟢 **Yes, supported** ([Displaying Paywalls](https://www.revenuecat.com/docs/tools/paywalls/displaying-paywalls)). The React Native SDK signature is:

```
const paywallResult: PAYWALL_RESULT = await RevenueCatUI.presentPaywall({ offering: offering })
```

Paywalls can be launched imperatively from any event (button press, end of onboarding step, first meaningful action) — not only on screen mount. iOS uses SwiftUI `@State`-driven sheet presentation; Android uses `paywallActivityLauncher.launch()` or `PaywallDialog` in navigation.

🟢 **Placements** ([Placements docs](https://www.revenuecat.com/docs/tools/targeting/placements)): "Use Targeting by Placement to define paywall locations in your app so that you can serve unique Offerings at each paywall location to each customer." SDK method: `offerings.getCurrentOfferingForPlacement("identifier")` (Swift: `currentOffering(forPlacement:)`). Placements may return `nil` / `null` when configured to — "the ability to return a nil Offering is only supported when requesting Offerings by Placement."

## 3. Free-trial mechanics — with-card vs no-card

🟢 **iOS IAP trials require a payment method on file.** Apple's App Store Review Guidelines 3.1.1 permits a free trial for auto-renewable subscriptions but treats it as an **introductory offer** attached to a subscription product ([App Store Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)). 3.1.2(a) states: "Auto-renewable subscription apps may offer a free trial period to customers by providing the relevant information set forth in App Store Connect."

🟡 Apple Discussions confirms the card-on-file requirement: "a credit or debit card is required initially to enable the App Store; it's part of the identification process. Even though users aren't charged during a free trial period, they must have a valid payment method on file to activate one." (search-result summary from Apple Discussions thread 255173842 — 🟡 secondary, consistent with StoreKit behavior).

🟢 **Non-subscription "XX-day Trial" carve-out exists**, but only via a Non-Consumable IAP at Price Tier 0 ([Guidelines 3.1.1](https://developer.apple.com/app-store/review/guidelines/)): "Non-subscription apps may offer a free time-based trial period before presenting a full unlock option by setting up a Non-Consumable IAP item at Price Tier 0 that follows the naming convention: 'XX-day Trial.'" Requires DeviceCheck / receipt for duration tracking and is **only for non-subscription apps** — not applicable while Fitbull offers an auto-renewable subscription.

🟢 **RevenueCat's framing** ([Subscription offers docs](https://www.revenuecat.com/docs/subscription-guidance/subscription-offers)): "Apple App Store and Amazon Appstore apply introductory offers to purchases automatically; this is outside of the control of RevenueCat's Purchases SDK." Eligibility is checkable via `checkTrialOrIntroDiscountEligibility(product:)`, "a best-effort approach."

🟢 **Net**: On iOS, "auto-trial without card" is **not** natively possible for an auto-renewable subscription. The SDK presents a paywall; the user accepts the intro-offer terms via the StoreKit sheet; Apple ID with payment method is required; the free trial starts and renews automatically unless cancelled. A no-CC "trial" pattern (e.g., Ladder's 7-day) is implemented in-app as a grace period — the app unlocks Pro features time-limited by server state, with no StoreKit transaction at all. Not a StoreKit intro offer.

## 4. Introductory offer types and App Store treatment

🟢 Three types, verbatim from [App Store Connect Help — set up introductory offers](https://developer.apple.com/help/app-store-connect/manage-subscriptions/set-up-introductory-offers-for-auto-renewable-subscriptions/) and Apple's [Auto-renewable Subscriptions page](https://developer.apple.com/app-store/subscriptions/):

- **Free trial** — "A subscriber can access your subscription for free for a specific duration... Their subscription begins immediately, but they won't be billed until the offer duration ends." Durations: "3 Days, 1 or 2 Weeks, 1, 2, 3, or 6 Months, or 1 Year."
- **Pay as you go** — "A subscriber pays a discounted price each billing period for a specific duration — for example, $1.99 per month for three months for a subscription with a standard renewal price of $9.99 per month." Durations: "1 to 12 weeks (for 1-week subscriptions) up to 1 year (for longer subscriptions)."
- **Pay up front** — "A subscriber pays a one-time price for a specific duration — for example, $9.99 up front for the first six months of a subscription with a standard renewal price of $39.99 per year." Durations: "1, 2, 3, or 6 Months, or 1 Year."

🟢 **Eligibility rule** (same source): "New and returning customers are only eligible to use one introductory offer per subscription group. For example, if a customer uses a free trial and then upgrades to a subscription product in the same group that also has a free trial, they aren't eligible for the second offer."

🟢 **Clarity requirement** (Guidelines 3.1.1): "Prior to the start of the trial, your app must clearly identify its duration, the content or services that will no longer be accessible when the trial ends, and any downstream charges the user would need to pay for full functionality."

🟢 **Offer codes** ([Auto-renewable Subscriptions](https://developer.apple.com/app-store/subscriptions/)): "You can create two types of offer codes: one-time-use codes (18-digit unique codes), or custom codes (such as SPRINGPROMO)."

## 5. Pricing localization across territories

🟢 **Apple auto-generates prices by default** ([Manage app pricing](https://developer.apple.com/help/app-store-connect/manage-app-pricing/set-a-price/)):

> "You can set a price for the country or region you're familiar with as the basis for automatically generating prices across the other 174 storefronts and 43 currencies. Automatically generated prices account for foreign exchange rates and certain taxes, and follow the most common pricing convention for each country or region."

🟢 **Auto-adjustments**: "Periodically, Apple updates prices in certain regions based on changes in taxes and foreign exchange rates." "Apple will never change the price in your base country or region, and will always notify you in advance of changes on other storefronts."

🟢 **Manual override**: "Alternatively, you can choose to manually manage certain storefronts or you can manually manage them all. Keep in mind that you'll be responsible for staying up to date with taxes and exchange rates in the storefronts you manually manage."

🟢 If no base-country price is set, the product isn't purchasable in that territory. If only a base is set, auto-conversion fills in the rest across 174 storefronts / 43 currencies (at the source above). Nordic implication: setting a Norway (NOK) or Sweden (SEK) base produces auto-converted prices for Denmark (DKK) and Finland (EUR) without manual work; the algorithm uses "the most common pricing convention for each country or region" (e.g., NOK 99 vs NOK 99.00).

## 6. RevenueCat native analytics surface

🟢 The [State of Subscription Apps 2025](https://www.revenuecat.com/state-of-subscription-apps-2025/) and [Experiments docs](https://www.revenuecat.com/docs/tools/experiments-v1) confirm RevenueCat exposes metrics including: customers (per variant), paywall viewers, trials started, trials completed, trials converted-to-paid, and full subscription-lifecycle revenue. Events via webhooks (`INITIAL_PURCHASE`, `RENEWAL`, `CANCELLATION`, `EXPIRATION`, `BILLING_ISSUE`, `PRODUCT_CHANGE`, `UNCANCELLATION`, `TRIAL_STARTED`, `TRIAL_CONVERTED`, `TRIAL_CANCELLED`, `REFUND`) — 🟡 event names from general RevenueCat webhook knowledge, best verified against the current webhooks doc before wiring PostHog.

🟢 **Trial conversion metric** (scout.md Part B RevenueCat benchmarks, citing [State of Subscription Apps 2025](https://www.revenuecat.com/state-of-subscription-apps-2025/)): Health & Fitness median trial-to-paid **39.9%**, top decile **68.3%**; first-renewal retention **30.3%** (scout citation). The 39.9% / 68.3% figures re-confirmed in the report; the 30.3% first-renewal figure is per scout.md and appears in adjacent RevenueCat category data (not re-verified in this pass — 🟡 per scout).

🟢 **Overlap with PostHog**: RevenueCat tracks purchase-funnel events natively (trial start, conversion, refund). PostHog is needed for pre-purchase funnel (screen impressions, button taps, form fills, drop-off by question). Both systems can co-exist: RevenueCat handles receipt-backed revenue truth; PostHog handles in-app behavioral events. Overlap at the paywall-impression → trial-start boundary, where both can fire.

## 7. Scout-cited paywall-placement lift numbers

Quoted from `docs/prism/onboarding-flow/research/prior-art/scout.md`:

🟢 **Mural — post-onboarding checklist**: "10% relative increase in 1 week retention" (scout A1, citing abtest.design).
🟢 **Dollar Shave Club — conversational tone**: "5.24% increase in subscriptions" from tone alone; adjacent tests added 11.2% and 6.8%, totaling "17%+ combined subscription lift" (scout A2, citing conversion.com).
🟢 **Houzz — one-question-per-screen**: "15+% increase in conversion rate" (scout A3, citing abtest.design).
🟢 **Headspace — multi-intent query**: "10% increase in free trial conversion" (scout A4, citing abtest.design).
🟢 **Grammarly — personalized paywall**: "10–20% increase in upgrade rates"; abtest.design cites "+20% upgrade rates" (scout A5).
🟢 **Grammarly — premium exposure during onboarding**: "20–30% of a cohort's upgrades originated from the onboarding paywall upsell" (scout A6).
🟢 **HubSpot — in-house KYC vs Stripe redirect**: "Double-digit percentage increase in weekly KYC enrollments" (scout A7).

🟢 **RevenueCat paywall-sequencing A/B** (scout supporting-evidence section; verified independently at [7 Ways to Make Your Paywall Do More Than Sell](https://www.revenuecat.com/blog/growth/paywalls-unexpected-uses/)):
- "Welcome screen → onboarding → home → paywall = **2%** trial opt-in"
- "Welcome screen → paywall → onboarding → home = **8%** trial opt-in"
- "Welcome screen → new three-slide carousel → paywall → onboarding → home = **15%** trial opt-in"

🟢 **Hard paywall vs freemium benchmark** (scout, citing State of Subscription Apps 2025): "Hard paywall apps convert downloads to paid users at a much higher rate than freemium apps" with median **12.11% vs 2.18%** (verified this pass, replacing the earlier-cited 10.7% vs 2.1% — the 2025 report shows 12.11% vs 2.18%). Year-1 realized LTV per payer: "High-priced hard paywall apps generate nearly 7x median LTV ($55.21) compared to low-priced apps ($8.08)."

🟡 **Rootd**: "5x revenue increase by moving paywall to the front of onboarding while keeping it dismissible" ([hard-paywall vs soft-paywall blog](https://www.revenuecat.com/blog/growth/hard-paywall-vs-soft-paywall/)).

## 8. Current code path

🟢 From repo audit (2026-04-21):

- **Entitlement ID**: `process.env.EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID ?? "Fitbull Pro"` — `hooks/use-purchases.ts:51`.
- **Paywall trigger**: `RevenueCatUI.presentPaywall()` called with **no arguments** — `hooks/use-purchases.ts:188`. No offering is selected explicitly; RevenueCat serves the `current` Offering by default.
- **Call sites**: (a) `app/onboarding.tsx:65` — `handleChoosePlan` on post-signup screen; (b) `components/paywall.tsx:17` — non-subscriber gate in Chat tab; (c) `app/settings/index.tsx:103` — Settings upgrade CTA.
- **Purchase flow**: `presentPaywall()` → on `PURCHASED`/`RESTORED`, calls `Purchases.syncPurchasesForResult()` (if available) → `Purchases.getCustomerInfo()` with 3-retry backoff (500 ms each, `use-purchases.ts:126`) → `syncToServer` action (`convex/subscriptions.ts:110` `syncFromClient`) which re-verifies via `https://api.revenuecat.com/v1/subscribers/{userId}` (REST API) → writes `userSubscriptions` table.
- **Server-side app_user_id**: the Convex `userId` is used directly as `revenuecatAppUserId` (`convex/subscriptions.ts:84`).
- **Pinned versions**: `react-native-purchases ^9.10.4`, `react-native-purchases-ui ^9.10.4` (`package.json:71-72`).
- **Known native workaround**: v9.x removed the default export; code uses `rnpModule.default ?? rnpModule` fallback per `docs/revenuecat-purchases-module-fix.md`.
- **No `getOfferings()` call in app code.** `Purchases.getOfferings` does not appear in any source file under `/Users/sebastiansole/Documents/gainsoclock`.
- **No placement identifiers in use.** `getCurrentOfferingForPlacement` does not appear in any source file.

## 9. RevenueCat Experiments — capabilities and limits

🟢 ([Experiments v1](https://www.revenuecat.com/docs/tools/experiments-v1); [Experiments feature page](https://www.revenuecat.com/feature/experiments)):

- **What it varies**: "1. Product pricing 2. Product offers (e.g. trial length, trial presence, paid introductory offers, etc.) 3. The number and mix of products offered 4. Paywall imagery, copy, layout, and more." Preset experiment types: "Introductory offer, Free trial offer, Paywall design, Price point, Subscription duration, Subscription ordering."
- **Unit of randomization**: per-Offering, per-customer, works "for any Placement you've configured."
- **Variant count**: docs explicitly mention testing "two different Offerings"; third-party summaries cite 2-4 variants — 🟡 variant-count upper bound not quoted in the canonical doc.
- **Metrics**: "Customers (all new customers who've been included in each variant)" and "Paywall viewers (the count of distinct customers who've reached a paywall in each variant)"; plus trials started / trials completed / trials converted to paying subscriptions; results visible within 24 h; exportable as CSV.
- **Plan gate**: "available to Pro & Enterprise customers only."
- **Conflict with PostHog feature flags**: **no explicit statement in RevenueCat docs.** 🔴 unable to verify direct conflict. Structurally, both are assignment mechanisms; running both simultaneously on the same user without sharing a randomization seed will cause cross-contamination (a user in PostHog variant A may land in RevenueCat variant B). This is standard A/B-test hygiene, not a vendor-documented constraint.

## 10. Apple review guidance on onboarding paywalls

🟢 From [App Store Review Guidelines](https://developer.apple.com/app-store/review/guidelines/):

**3.1.2(c) Subscription Information** (verbatim): "Before asking a customer to subscribe, you should clearly describe what the user will get for the price. How many issues per month? How much cloud storage? What kind of access to your service?"

**3.1.2(a)** (verbatim excerpt on value): "If you offer an auto-renewable subscription, you must provide ongoing value to the customer, and the subscription period must last at least seven days and be available across all of the user's devices... As with all apps, those offering subscriptions should allow a user to get what they've paid for without performing additional tasks, such as posting on social media, uploading contacts, checking in to the app a certain number of times, etc."

**3.1.2(a) on scam trials**: "Apps that attempt to scam users will be removed from the App Store. This includes apps that attempt to trick users into purchasing a subscription under false pretenses or engage in bait-and-switch and scam practices."

**4.2 Minimum Functionality** (verbatim): "If your app is not particularly useful, unique, or 'app-like,' it doesn't belong on the App Store. If your App doesn't provide some sort of lasting entertainment value or adequate utility, it may not be accepted."

**3.1.1 on trial clarity** (verbatim): "Prior to the start of the trial, your app must clearly identify its duration, the content or services that will no longer be accessible when the trial ends, and any downstream charges the user would need to pay for full functionality."

🔴 **"Button 4.2.x" / "can't hide app behind paywall without adequate free value"** — the phrase "button 4.2.x" is **not** a guideline reference. The closest applicable sections are 4.2 (Minimum Functionality) and 3.1.1/3.1.2. No guideline explicitly names an "onboarding paywall" ban; enforcement is pattern-based via 3.1.2 clarity requirements and 4.2 minimum-functionality reviews. Unable to verify a more specific section text.

## 11. Nordic payment methods via iOS IAP

🟢 **Apple IAP back-end payment methods are invisible to the app.** The app sees only StoreKit transactions. Which funding instrument backs the user's Apple ID (credit card, debit card, PayPal where supported, Vipps/MobilePay in Nordic markets where Apple accepts it as a payment funding source) is handled between Apple and the issuer.

🟢 [Vipps MobilePay launched tap-to-pay via iPhone NFC](https://vippsmobilepay.com/en-NO/news/2024/12/09/vippsmobilepay-launches-the-worlds-first-alternative-to-apple-pay-on-iphone) in December 2024 (Norway first, now all Nordics). This is **NFC at POS**, not App Store IAP. Search returns no result confirming Vipps/MobilePay as a direct App Store IAP funding source.

🟡 **Unverified in this pass**: whether Vipps or MobilePay can fund an Apple ID via the Apple wallet in Nordic regions. Apple's payment-methods-by-country pages would be the authoritative source. Flagged as unverified.

## 12. Minimum-viable change-set in repo

🟢 Based on current code (`hooks/use-purchases.ts`, `app/onboarding.tsx`, `convex/subscriptions.ts`):

**(a) Move paywall later in the flow.** `presentPaywall()` is called from `handleChoosePlan` in `app/onboarding.tsx:62-87`. Moving it later = removing the `handleChoosePlan`/"Choose Plan" button from the current post-signup screen and wiring `presentPaywall()` to a later trigger (end of intake / after aha moment). `hooks/use-purchases.ts` itself needs no change — it already exposes `presentPaywall` as a callable.

**(b) Add an auto-trial variant.** Since iOS auto-trial requires a StoreKit purchase with card-on-file (§3), the "auto-trial variant" is fundamentally a **paywall copy + offering** change: configure a new Offering in the RevenueCat dashboard with an annual product that has a free-trial introductory offer attached, and have the paywall emphasize the trial. No SDK signature change; call `presentPaywall({ offering })` instead of `presentPaywall()` (both supported per §1). For a true no-CC "trial" (Ladder-style), implementation is in-app time-bounded Pro access keyed to server state, **without** any StoreKit transaction — would require a new flag on `userSubscriptions` (e.g., `freeTrialEndsAt`) in `convex/schema.ts` and entitlement-gate logic in `convex/subscriptions.ts:getStatus`.

**(c) Territory-specific offerings.** Two mechanisms:
- **Apple-side**: set base price, auto-convert. No code change. (§5.)
- **RevenueCat-side**: create multiple Offerings, attach to Placements, fetch via `Purchases.getOfferings()` then call `offerings.getCurrentOfferingForPlacement("onboarding_nordic")` (§1, §2). `hooks/use-purchases.ts` currently never calls `getOfferings()` — adding it is additive and does not touch `syncFromClient`/entitlement verification. `presentPaywall({ offering })` consumes the resolved offering.

**Unchanged constraints across all three**: `EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID` (`hooks/use-purchases.ts:51`) remains the sole entitlement; `convex/subscriptions.ts:syncFromClient` still verifies server-side via `https://api.revenuecat.com/v1/subscribers/{userId}`; the `rnpModule.default ?? rnpModule` workaround (`docs/revenuecat-purchases-module-fix.md`) must be preserved.

---

## Unable to verify / 🔴 gaps

- Whether Apple Review has issued written guidance explicitly about "onboarding paywalls" (no hit in 3.1.x, 4.2.x); enforcement appears pattern-based (§10).
- Apple's exact "sandbox free trial requires card-on-file" policy in an authoritative Apple doc (verified via Apple Discussions 🟡; StoreKit/sandbox doc pages accessed did not contain this statement verbatim).
- Direct conflict guidance between RevenueCat Experiments and PostHog feature flags (no vendor doc addresses it; §9).
- Whether Vipps/MobilePay is an Apple ID funding instrument in Nordic territories via App Store IAP (no primary source found in this pass; §11).
- Upper bound on RevenueCat Experiment variants beyond "two" explicitly (3rd-party summaries say 2-4 🟡; §9).
- Exact "30.3% H&F first-renewal retention" re-verification in State of Subscription Apps 2025 text (scout-cited; the report's H&F-specific retention metric was not surfaced in this pass — 🟡).

---

**Sources:**

- [RevenueCat Paywalls overview](https://www.revenuecat.com/docs/tools/paywalls)
- [RevenueCat Displaying Paywalls](https://www.revenuecat.com/docs/tools/paywalls/displaying-paywalls)
- [RevenueCat Offerings overview](https://www.revenuecat.com/docs/offerings/overview)
- [RevenueCat Placements](https://www.revenuecat.com/docs/tools/targeting/placements)
- [RevenueCat Subscription offers](https://www.revenuecat.com/docs/subscription-guidance/subscription-offers)
- [RevenueCat Experiments v1](https://www.revenuecat.com/docs/tools/experiments-v1)
- [RevenueCat Experiments feature page](https://www.revenuecat.com/feature/experiments)
- [RevenueCat Apple Sandbox Testing](https://www.revenuecat.com/docs/test-and-launch/sandbox/apple-app-store)
- [RevenueCat State of Subscription Apps 2025](https://www.revenuecat.com/state-of-subscription-apps-2025/)
- [RevenueCat 7 Ways to Make Your Paywall Do More Than Sell](https://www.revenuecat.com/blog/growth/paywalls-unexpected-uses/)
- [RevenueCat Hard Paywall vs Soft Paywall](https://www.revenuecat.com/blog/growth/hard-paywall-vs-soft-paywall/)
- [Apple App Store Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- [Apple Auto-renewable Subscriptions](https://developer.apple.com/app-store/subscriptions/)
- [Apple App Store Connect — Set up introductory offers](https://developer.apple.com/help/app-store-connect/manage-subscriptions/set-up-introductory-offers-for-auto-renewable-subscriptions/)
- [Apple App Store Connect — Set a price](https://developer.apple.com/help/app-store-connect/manage-app-pricing/set-a-price/)
- [Vipps MobilePay tap-to-pay launch](https://vippsmobilepay.com/en-NO/news/2024/12/09/vippsmobilepay-launches-the-worlds-first-alternative-to-apple-pay-on-iphone)
