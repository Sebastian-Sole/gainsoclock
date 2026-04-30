# Yellow Hat reviews Black Hat — Monetization

**Perspective:** Yellow Hat (opportunity in the risks)
**Session:** `onboarding-flow`
**Date:** 2026-04-21
**Reviewing:** `docs/prism/onboarding-flow/research/monetization/black-hat.md`
**Facts reference:** `docs/prism/onboarding-flow/research/monetization/white-hat.md`

Source confidence: 🟢 verified in repo / official docs, 🟡 extrapolated from verified facts, 🔴 speculative.

---

## Framing

The Black Hat is right about every failure mode. What it misses is that the risks are *clustered*: they share a root cause and fixing the root cause nets multiple wins per unit effort. The monetization layer today is a thin, RC-coupled, magic-string-driven, UI-free, state-unaware adapter. Every critique points to the same absence: **we have no first-class monetization domain model of our own.** Building one — which is unavoidable the moment we ship any trial variant — is the Yellow Hat thesis. Ship it once, harvest it eight times.

---

## Per-risk opportunity map

### 1. D3 race condition — paywall + spotlight stack (🟢 verified)

**Risk:** `stores/onboarding-store.ts:26` Zustand flag never set by `app/onboarding.tsx:68`; spotlight trigger at `providers/onboarding-provider.tsx:105-109` reads `hasCompleted=false` AND `serverOnboardingDone=true` and fires under a mounted paywall.

**Opportunity:** The bug is a forcing function to delete the dual-source-of-truth onboarding status. Today two flags can disagree (Zustand local, Convex server). The correct shape is **one read path** — a derived `useOnboardingStatus()` hook that selects over `{ serverOnboardingDone, status, trialExpiresAt }` and returns a discriminated union (`needs_auth | needs_intake | needs_paywall | in_trial | pro | done`). Every call site — auth guard, spotlight trigger, tab gates, chat paywall — consumes one enum instead of reconstructing the decision.

**Second-order (🟡):** Spotlight overlay and paywall become mutually exclusive *by construction*, not by luck. The same hook gates every downstream "is the user done onboarding?" decision — including the one the intake rotation needs when we move sign-up later. Downstream bugs that disappear: chat tab gate (`app/(tabs)/chat.tsx:43`), settings upgrade CTA, future "resume mid-intake" restart logic.

**Effort:** small (one hook, refactor ~6 call sites, delete ~10 lines of parallel state).

**Compounds with:** intake-UX rotation. Building this now is free infrastructure for every downstream rotation.

---

### 2. `subscription-store.ts` has no trial state — 6-file refactor (🟢 verified lines 5–21)

**Risk:** Interface is `{ isPro, productId, expiresAt }` only. No `isInTrial`, `trialExpiresAt`, `willAutoRenew`, `trialSource`. Blocks every trial variant.

**Opportunity:** The six files are not tax — they are *necessary schema alignment*. Right shape:

```ts
type SubscriptionState = {
  status: "free" | "trial" | "pro" | "grace" | "lapsed";
  source: "rc_intro" | "app_local" | "rc_paid" | null;
  productId: string | null;
  expiresAt: string | null;
  willAutoRenew: boolean | null;
  lastVerifiedAt: string | null; // pivot for 6-monthly Nordic notification
};
```

Once this exists, **everything the Black Hat flagged in section B becomes implementable**: with-card trial countdowns (B1), no-card grace periods (B2), refund-vs-cancellation telemetry (`convex/subscriptions.ts:232-306` can finally distinguish), trial-aware UI copy, and the Norwegian active-notification duty (because `lastVerifiedAt` is the pivot the cron needs).

**Second-order (🟡):** The state machine makes "app_local" grace a *first-class citizen* alongside RC entitlements — not a hack. Every `isPro` check becomes `status !== "free"`, handling trial, grace, paid uniformly.

**Effort:** medium (6 files as black-hat stated).

**Compounds with:** items 3, 4, 5, 6, 7 below. Treat as prerequisite, not risk. Highest-leverage single change in the critique.

---

### 3. No-card trial invisible to RevenueCat — needs parallel entitlement (🟢 verified at `use-purchases.ts:53-82`)

**Risk:** `getActiveEntitlement` only resolves RC-reported entitlements. App-local trial needs Convex-side truth plus a cron enforcer.

**Opportunity:** **Owning the grace-period primitive is a moat, not a liability.** Once Convex is the source of truth for "time-bounded access," we can grant trials for *any* reason: referral credit, win-back after lapse, beta-tester extensions, customer-support refund substitutes, cohort-specific A/B extensions, influencer partnerships. None is possible when RC is the only clock. RC's own docs admit StoreKit intro offers are "outside the control of the Purchases SDK" (white-hat §3) — if we want discretion over grants, we must own it anyway. The Convex cron enforcer is also the **same cron** the Nordic 6-monthly notification needs. One piece of infrastructure, two policy requirements.

**Second-order (🟡):** Convex-owned entitlement is the substrate for product experiments the AI-coach rotation will want — e.g. "generate plan → grant 24h free access to chat with coach about this plan" as aha-moment amplifier. Impossible with StoreKit (one-intro-per-subscription-group, white-hat §4). Trivial with `grantAppLocalAccess(userId, hours, reason)`.

**Effort:** medium (one field on `userSubscriptions`, one mutation, one cron, one branch in `getStatus`). ~40% smaller if item 2 lands first.

**Compounds with:** aha moment + intake flow. This is the *mechanical* way to deliver "see value before you pay" without fighting Apple.

---

### 4. `ENTITLEMENT_ID = "Fitbull Pro"` duplicated (🟢 verified at `use-purchases.ts:51` and `convex/subscriptions.ts:139`)

**Risk:** Rename without lockstep env update silently masks misconfiguration — the fallback at `use-purchases.ts:65-75` picks *any* active entitlement (verified this pass).

**Opportunity:** Centralize as a literal-union validator in `convex/validators.ts` per the coding-conventions rule ("validators are the source of truth for enum-ish fields"). Ten-minute refactor — the *second-order* benefit is what matters.

**Second-order (🟡):** Typed entitlements let us ship **tiered offerings** without touching gate logic in 30 places. A `pro_core | pro_ai | pro_recipes` split (plausible given the brief's AI-coach differentiator) becomes a discriminated-union check at each surface: `if (entitlement === "pro_ai") show(...)`. TypeScript enforces exhaustiveness; forget a surface, the compiler tells you. Today, adding a tier is a find-and-replace archaeology dig. In the same PR, the silent-failure fallback at `use-purchases.ts:65-75` can be deleted.

**Effort:** tiny.

**Compounds with:** Nordic-first per-region offerings; future AI-coach add-on tier.

---

### 5. `presentPaywall()` has no fallback when `RevenueCatUI` is null (🟢 verified at `use-purchases.ts:186`)

**Risk:** Zero-arg call at line 188; "error" return when native UI is null. The v9 export bug (`docs/revenuecat-purchases-module-fix.md`) proved this failure class already happened.

**Opportunity:** **The fallback we are forced to build is the primary paywall we should have built first.** White-hat §1 names three integration modes; the third is a custom UI fed by `Purchases.getOfferings()` + `Purchases.purchasePackage(pkg)`. That mode is:

- Controllable for Apple 3.1.2 "conspicuousness" (no typography ceded to RC defaults).
- Styleable in NativeWind with the rest of the app (the current RC chrome is a visual discontinuity — users exit the app's design system to pay, a known conversion killer).
- Compatible with the Rootd pattern ("5x revenue by moving paywall front, keeping it dismissible" — white-hat §7) because *we control dismissal*.

So: build custom `<NativePaywall>` for the normal case; keep `RevenueCatUI.presentPaywall({ offering })` as the *rescue* path. The null-fallback requirement becomes the forcing function for the conversion-optimal paywall.

**Second-order (🟢 from scout):** The Grammarly "+10–20% upgrade rate" effect (white-hat §7 A5) requires prompt-level string interpolation ("Plans for 4-day / strength-focused / intermediate lifters") — impossible with RC's template chrome, trivial in our own component. White-hat §8 confirms `getOfferings()` is *not* currently called anywhere, so no coupling to break — we *add* a path, we don't replace one.

**Effort:** medium (one new component; no mutation to existing purchase path).

**Compounds with:** AI aha moment, Nordic-first positioning, intake personalization. This is where personalized copy, local pricing conspicuousness, and Norwegian disclosure text all live.

---

### 6. Norway 6-monthly active-renewal notification (🟢 per black-hat + hjort.no source)

**Risk:** `lib/notifications.ts` + Convex cron don't exist for scheduled subscription notices. RC does not do this.

**Opportunity:** The notification scheduler is infrastructure we need for **five other purposes**: trial-ending reminders (2-day-before nudge), streak-maintenance (brief references `Commitment devices`), rest-timer notifications (already shipped in commit `2629ff8`, so `expo-notifications` is wired), D7 re-engagement (success metric #3), and AI-coach weekly check-ins. Nordic compliance is a **legal forcing function** to build infrastructure that also moves the three primary success metrics.

**Second-order (🟡):** A Convex cron reading `userSubscriptions.lastVerifiedAt` (item 2) and composing localized notifications via `lib/notifications.ts` becomes the spine of the retention loop. The Norwegian notice is item 1 on a list of ~10 scheduled messages the product wants anyway.

**Effort:** medium. Builds on item 2.

**Compounds with:** Nordic-first positioning (compliance becomes trust signal — "we remind you because you should decide on purpose") and AI-coach check-ins.

---

### 7. App Store 3.1.2 "trial conspicuousness" on RC default chrome (🟢 per Apple guidelines)

**Risk:** `RevenueCatUI.presentPaywall()` renders typography we cannot control; "7 days free" vs "$79.99/year after" ratio could trigger rejection.

**Opportunity:** Same resolution as item 5 — the custom `<NativePaywall>`. We need it for null-fallback, for conspicuousness, for personalization, for Norwegian disclosure copy. **Four critiques, one component.** The scout data (Rootd 5x, Grammarly +10–20%, carousel→paywall 15% vs 2%) are all from teams controlling their own paywall rendering. We cannot realize those lifts while RC controls the pixels.

**Second-order (🟡):** Custom paywall is the only place where the brief's "social proof with no real assets" constraint can be handled *tastefully* — founder-note card, intent-based "join X others training toward [goal]" Convex aggregate counts, scientific-claim disclosures. RC templates support none of this.

**Effort:** folded into item 5.

**Compounds with:** Nordic annual-SKU proportionate-benefit disclosure (black-hat A3) — we need custom copy per storefront anyway.

---

### 8. No-StoreKit-no-card-trial constraint (🟢 per white-hat §3)

**Risk:** Auto-trial without a card is not natively possible for an auto-renewable subscription on iOS.

**Opportunity:** Product-design leverage on top of item 3. Owning `grantAppLocalAccess()` lets onboarding do what RC-native apps can't — **grant the aha artifact (personalized plan, first AI chat) for free, at the moment the user has invested enough to care**, then present the paywall with the artifact still visible behind it. The black-hat A1 screenshot-and-run failure mode gets defanged: the plan is only valuable if it *lives inside the app alongside tracking*; the app-local grant gives the user exactly enough rope to realize that, not enough to pirate durably.

**Effort:** folded into item 3.

**Compounds with:** AI aha moment — extreme. Grace-period primitive is how "earn value before paying" becomes safe to ship.

---

## Hidden asset

**The custom `<NativePaywall>` component (items 5 + 7).**

Every other opportunity is infrastructure that pays off *once* — the state machine, the cron, the literal union. The custom paywall pays off *continuously* because it is the surface where copy, pricing, social proof, personalization, localization, and compliance disclosures all converge. Right now RC owns that surface; we own none of it. Moving it under our control is the single monetization change with the largest compounding effect on revenue per the scout data. Black-hat flagged it as three separate problems (C3 fallback, B1 conspicuousness, C1 placement coupling); Yellow Hat sees one asset we're failing to build.

---

## Ranking: unlocked value per unit effort

| Rank | Opportunity | Effort | Why here |
|------|-------------|--------|----------|
| 1 | Magic-string → literal union (item 4) | tiny | Ten-minute PR, kills a silent-failure mode, unblocks tiered offerings. |
| 2 | Onboarding status discriminated-union hook (item 1) | small | Fixes D3, unifies ~6 call sites, infrastructure for intake rotation. |
| 3 | Subscription state machine (item 2) | medium | Prerequisite for items 3, 5, 6, 8. Gate to every trial variant. |
| 4 | Custom `<NativePaywall>` (items 5 + 7) | medium | Hidden asset. Rootd-class lifts + personalization + compliance. |
| 5 | App-local grace-period primitive (items 3 + 8) | medium | Aha-moment safety + grant discretion. |
| 6 | Notification cron (item 6) | medium | Compliance + retention loop spine. |

Do #1 and #2 in the same week as cheap wins; they unblock the rest. #3 is the critical path.

---

## Compounding with the broader onboarding overhaul

- **AI aha moment** — the app-local grace period (item 3/8) is the *only* way to present a personalized AI-coach artifact without paywalling it first or screenshot-leaking it; the custom paywall (item 5/7) is where the artifact continues living behind the purchase button instead of being dismissed by RC chrome. **These are monetization's contribution to the aha-moment rotation.**
- **Intake flow** — the status hook (item 1) is what the intake rotation uses for "resume where you left off," multi-screen flows, and post-intake routing. Without it, every intake redesign fights the D3 bug class. **This is where monetization and intake touch directly.**
- **Nordic-first positioning** — the cron (item 6), the entitlement literal union for per-region offerings (item 4), and custom paywall copy for Markedsføringsloven §22 / 6-monthly disclosures (item 7) are a **single coherent Nordic compliance-and-trust story**. Treat Norwegian compliance as product, not tax: it becomes the most trustworthy paywall experience in the category.

**The highest-compounding single opportunity is the custom paywall (item 5+7).** It touches AI personalization (aha amplifier), intake output (plan-preview placement), and Nordic-first (copy control for statutory disclosures) simultaneously. If there is budget for one medium-effort investment from this review, this is it.
