# Mobile Accessibility Review v2 — Onboarding Flow Master Plan (Revised)

**Reviewer persona:** mobile-a11y
**Plan reviewed:** `docs/prism/onboarding-flow/plan/master-plan.md` (revised 2026-04-21)
**Changelog cross-ref:** `docs/prism/onboarding-flow/plan/changelog.md`
**Verdict:** **APPROVED**

The revision addresses every v1 blocker with concrete plumbing, not just bullet-level gestures. The nine blocking items and eight non-blocking items are all either incorporated into the plan body with review-tag citations or rationalised explicitly in the scope-discipline section. A VoiceOver user on the design-center path (HealthKit denied, Slow 3G, iPhone SE) now has a reviewable, testable path from sign-up through paywall, with a Phase 10 Maestro ship gate that fails the release if the path is broken. Remaining risk is execution-quality (getting the actual Expo/Reanimated wiring right), not plan quality.

---

## Verification of v1 blocking items

### 1. S7 narrated analysis — **resolved**
§S7 line 172 replaces the ambiguous "`accessibilityLiveRegion` / `announceForAccessibility`" dual-cite with a concrete iOS strategy: `AccessibilityInfo.announceForAccessibility` gated on `isScreenReaderEnabled()`, with a VO-active branch that skips the fade animation, renders all lines immediately inside a single `accessibilityLiveRegion="polite"` wrapper, and extends the timeout so SR users finish reading before routing to S8. Screen-container `accessibilityLabel` carries the full concatenated narration for rotor sweep. The VO-extended-timeout is also caught by the three-phase latency budget (§S7 Performance #1) which surfaces retry affordance on p95 — VO users won't be routed to S8 before narration completes.

Minor residual: the plan says "queued" but doesn't cite `announceForAccessibilityWithOptions({ queue: true })` by name. The implementer should know to prefer that API over bare `announceForAccessibility` (which barges). Mentioning it in the Phase 7 exit criteria would be tighter but I'm not blocking on it.

### 2. S8 aha card streaming — **resolved**
§S8 line 190 locks the render strategy to skeleton-during-`streaming`, full-card-on-`complete`. Line 191 explicitly says "no live region during stream" and specifies one announcement on completion with a concrete summary sentence format. Edit chips are a separate button group with value-in-label. This matches v1 concern #2 exactly. The Convex-Realtime C11 theme in the changelog confirms the no-partial-parser path is the chosen option.

### 3. S4 day-of-week 44pt — **resolved**
§S4 line 96 specifies 2-row grid (4+3) on ≤375pt viewports, `hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}` enforcement, and a new `onboarding` Button size variant at `h-12` (48pt — crucially above both the iOS 44pt and Android 48dp minimums). Phase 5 (line 764) makes this an explicit deliverable, and Maestro adds an iPhone SE simulator profile run. `components/ui/button.tsx` variant addition is the right fix location, not an ad-hoc patch to the days screen.

### 4. S5 HealthKit primer VoiceOver grouping — **resolved**
§S5 line 116 specifies three accessible containers with consolidated `accessibilityLabel`s (e.g. "Health data we don't read: sleep, heart rate, cycle, labs, workout history"), children `accessibilityElementsHidden={true}`, group headings `accessibilityRole="header"`, and equal-weight `accessibilityLabel` on both buttons. This addresses the "12+ disorganised list items" failure mode from v1 directly.

### 5. S6 consent edit chips + checkbox state — **resolved**
§S6 line 153 specifies the `accessibilityLabel="Goal: Stronger"` + `accessibilityHint="Double-tap to edit"` pattern — value in label, action in hint. Line 158 specifies `accessibilityState={{ disabled: true }}` on the submit button rather than opacity-only. The full-sentence consent-checkbox label is called out at the checkbox itself.

### 6. Reduce Motion scope — **resolved**
Single `hooks/use-reduce-motion.ts` lands in Phase 3 (line 746 deliverable). §S7 line 173 mandates that "every animated component in onboarding consumes it." Phase 5 (line 768) says "Reduce-Motion / Reduce-Transparency honored." Testing §5 line 851 adds `08-reduce-motion.yaml` Maestro variant. Paywall sheet is covered via §S9 line 227 and the hook-consumption requirement propagates. Chip animations in S2/S3/S4 are covered by the "every animated component" clause.

One tightening I'd prefer but am not blocking on: a one-liner in §S9 confirming the interstitial *presentation transition* also reads the hook (not just sub-animations). The current prose implies it but doesn't name the interstitial sheet explicitly. The `use-reduce-motion` hook is the single touchpoint either way.

### 7. S8 error-state announcement — **resolved**
§S8 line 192 specifies `accessibilityLiveRegion="assertive"` + `announceForAccessibility` + `setAccessibilityFocus` on the retry button, with the retry button's label defined. This is exactly the barge-in-and-focus-move pattern v1 requested.

### 8. SIWA vs. "Sign In" label collision — **resolved**
§S1 line 64 relabels the secondary link to "Already have an account? Sign in" with an explicit UX-A11y #8 cite noting the label must not duplicate SIWA. Clean fix.

### 9. Button variant 44pt audit — **resolved**
§S4 line 96 and Phase 5 line 764 pin intake to the new `onboarding` variant (`h-12`, 48pt). The `sm:h-8` / `size:"sm"` failure path I flagged in v1 is avoided because intake screens no longer use those variants. Pre-existing non-intake usage is out of this plan's scope, correctly.

---

## Verification of v1 non-blocking items

- **#9 Label pairing on S5a/S5b** — §S5a line 127 specifies `<Label>` + `nativeID`/`accessibilityLabelledBy` with an explicit "Placeholder text is not a label" clause.
- **#10 Dynamic Type on Reanimated text** — §S7 line 175 mandates `Animated.createAnimatedComponent(Text)` with `Text` from `components/ui/text.tsx`; Phase 10 line 840 has the Accessibility-XXL scaling exit target.
- **#11 Contrast audit** — Phase 10 line 820: "Contrast audit every new surface in light+dark (Stark / Xcode Accessibility Inspector)."
- **#12 Maestro VoiceOver gate** — Phase 10 line 819 names `07-voiceover-happy.yaml` as a blocking ship gate.
- **#13 Focus restoration after SIWA & paywall** — §S1 line 68 (SIWA redirect focus) and §S9 line 227 (paywall dismissal focus) both call `AccessibilityInfo.setAccessibilityFocus()` on destination first heading.
- **#14 Reduce Transparency / Invert Colors** — §S7 line 174 specifies opaque `bg-background` fallback under `isReduceTransparencyEnabled`.
- **#15 Checklist + re-ask patterns** — §S10 line 239 (`accessibilityRole="button"` + `accessibilityState:{disabled,selected}` + completion-state in label) and §S11 line 248 (CTA role + dismiss label).
- **#16 Strava-dry chip label expansion** — §S2 line 81 ("Stronger — build strength and muscle") and §S3 line 86 ("Returning — some training history…").
- **#17 iPad + external keyboard** — changelog §Scope discipline explicitly defers to V1.1 with a §7 line 906 entry. Clean scope declaration.

---

## Residual observations (non-blocking, no action required pre-merge)

1. **`announceForAccessibilityWithOptions({ queue: true })` naming.** §S7 says "queued" but doesn't name the API. Implementer-level detail; flag for Phase 7 code review.

2. **Paywall interstitial sheet-presentation motion.** §S9 doesn't explicitly name the sheet presentation as a Reduce-Motion surface. The hook-consumption clause covers it, but naming it in §S9 would pre-empt a Phase 8 miss. Optional.

3. **VoiceOver + Reduce Motion Maestro combination.** `07-voiceover-happy.yaml` and `08-reduce-motion.yaml` are independent flows. A real user who enables both (common) is covered by the orthogonality of the underlying hooks, but a combined canary run in `99-canary.yaml` would harden it. Phase 10 nice-to-have.

4. **Consent `announceForAccessibility` on copy-version change.** §S6 doesn't specify what happens to SR users mid-flow when the consent copy version hash rotates (Settings withdraw → re-consent). Edge case; Settings revoke UI can lean on standard role/state semantics.

5. **`accessibilityLanguage` for mixed-language copy.** V1 is English-only UI, so moot. Flag for V1.1 Nordic locale rollout.

---

## Summary

All nine v1 blockers are resolved with plan-body edits cited in the changelog. All eight v1 non-blockers are resolved or explicitly deferred. The `hooks/use-reduce-motion.ts` consolidation, the new `onboarding` Button variant at `h-12`, the Maestro VoiceOver ship gate, and the streaming-JSON render-on-complete strategy are all concrete, testable plumbing — not gestures. The changelog's scope-discipline section cleanly declines V1.1 items (iPad, external keyboard, partial-JSON parser, marketing consent) without hand-waving.

**Verdict: APPROVED.** The five residual observations above are implementer-level tightenings and do not block merge. A VoiceOver user on iPhone SE with HealthKit denied and Slow 3G has a reviewable path from sign-up through paywall that the plan now explicitly verifies in Phase 10. Ship it.
