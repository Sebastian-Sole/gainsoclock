---
name: mobile-ux-ios
description: "Fires when designing or reviewing iOS screens, navigation, gestures, haptics, motion, forms, empty/loading/error states, Dynamic Type, safe areas, sheets, or theming. Fires on files under app/**, components/** in this project."
---

# iOS Mobile UX / UI

Fitbull is iOS-only. This skill encodes Apple HIG patterns (including the iOS 26 Liquid Glass design direction) as they apply to a React Native + NativeWind app. The goal is that a feature built from this guidance feels native, not "an Expo app in a trenchcoat."

## Core Principles

1. **Content first, chrome second.** Let users' data (their logs, plan, meals) own the screen. Navigation and controls sit above content and can minimise on scroll.
2. **Hierarchy through material, not borders.** Prefer elevation, blur, and subtle translucency over hairline dividers and boxes. The `components/ui/card.tsx` and sheet surfaces are your hierarchy tools.
3. **Direct manipulation.** Every tap, drag, and swipe should move something visible. Don't show a modal to confirm something a gesture could undo.
4. **Latency is a design problem.** Anything over ~100 ms without feedback reads as broken. Use optimistic UI + sync queue (see `lib/convex-sync.ts`); never a raw spinner on user-initiated actions.
5. **Accessible by default.** If a screen only works for sighted, dextrous, non-dynamic-type users, it's unfinished. See `references/accessibility.md`.

## Navigation

- **Tabs:** iPhone tab bars hold **5 items max**, labelled. Current project has 6 tabs (`(tabs)/_layout.tsx`) — that's over the limit and will get flagged in HIG reviews. Consolidate or move one behind a "More" surface.
- **Stack push** for drill-down (workout list → workout detail). Preserve the back-swipe gesture; never disable it without a very specific reason.
- **Modals** for focused tasks that interrupt the current context (paywall, onboarding step, destructive confirm). Offer an obvious close affordance.
- **Sheets** for contextual actions that don't leave the screen (edit set, add exercise). Use detents (`medium`, `large`) from `@rn-primitives/dialog` or a sheet lib so users can partially inspect content behind.
- **Avoid** nested tab bars, more than 2 levels of modal, and custom back buttons that don't map to the system back gesture.

## Gestures & Touch

- **Touch targets: 44×44 pt minimum** (iOS HIG). Icon-only buttons use `size="icon"` on `components/ui/button.tsx`, which is 40 pt default — bump to 44 when the target is isolated.
- **Don't hijack system gestures.** Edge swipes (back-swipe left edge, Control Center bottom-right, Notification Center top) belong to iOS.
- **Debounce rapid taps** on destructive actions (delete workout, cancel subscription). 300 ms is a common threshold.
- **Long-press** for secondary/contextual actions, not as a replacement for a visible button. Always pair with a visible alternative.
- **Haptics carry meaning.** See `references/haptics.md` for which API to use when. Short version:
  - `Haptics.selectionAsync()` — picker/toggle changes
  - `Haptics.impactAsync(Light|Medium|Heavy)` — direct interaction (drag-drop, button press on weighty action)
  - `Haptics.notificationAsync(Success|Warning|Error)` — outcome feedback (workout saved, error)
  - Use sparingly. Haptics should mark meaningful moments, not every tap.

All haptics go through `lib/haptics.ts` — never import `expo-haptics` directly.

## Motion

- **Default to springs, not eases.** Reanimated's `withSpring()` feels natively correct; `withTiming()` can feel artificial for UI transitions.
- **Animate transforms and opacity**, not layout (top/left/width/height/margin/padding). Layout animations block the UI thread. See `references/motion.md`.
- **Respect Reduce Motion.** Check `AccessibilityInfo.isReduceMotionEnabled()` and swap elaborate transitions for a fade/crossfade.
- **120 fps is the ceiling on iPhone Pro.** Don't assume 60 — but also don't animate 50 things at once just because you can. Keep scenes simple.

## Typography & Dynamic Type

- Use theme tokens (`text-foreground`, `text-muted-foreground`) not hardcoded sizes.
- Test at iOS **Accessibility XXL**. Most screens break there. If a row clips, it's a bug, not an edge case.
- Avoid fixed `height` on rows with text; use padding + `minHeight` so content can grow.
- Numbers (weights, reps, macros) should be tabular — align the numeric input and display with `font-variant-numeric` or a dedicated mono font where visible.

## Dark Mode & Theming

- Dark mode is a **user setting**, not a design choice. Both modes must work, not just your preferred one.
- Use semantic tokens from `tailwind.config.js` only (`bg-background`, `text-primary`, `border-border`). No `#hex` in components.
- Verify contrast in **both** modes. `muted-foreground` on `background` needs to pass WCAG AA in light and dark.
- Don't use `Platform.OS` to flip dark mode; use the `class` strategy already wired up.

## Safe Areas & Layout

- Every root screen uses `useSafeAreaInsets()` or `SafeAreaView`. `app.json` has `edgeToEdgeEnabled: true` (Android) — iOS has always required explicit safe-area handling.
- Tab bar area, notch, Dynamic Island, and home indicator are not yours. Content must clear them.
- Avoid sticky elements that overlap the home indicator. The 34 pt bottom inset on iPhones with home bar is real.
- Keyboard: wrap scrollable forms in `KeyboardAvoidingView` with `behavior="padding"` on iOS. Dismiss on scroll (`keyboardDismissMode="on-drag"`) for long forms.

## Forms & Input

- Set `keyboardType` per field: `decimal-pad` for weight/reps, `numeric` for integer counts, `email-address` for email, `default` for text. Default = bad UX.
- Use `textContentType` for autofill: `username`, `password`, `emailAddress`, `oneTimeCode` (SMS OTP — huge iOS win).
- Comma-decimal support: route all numeric input through `lib/format.ts` parser. Commit `2629ff8` introduced this; don't regress.
- `returnKeyType` and `onSubmitEditing` move focus through multi-field forms (use `ref.current?.focus()`).
- Don't rely on placeholder as a label. Pair with `components/ui/label.tsx` and `accessibilityLabel`.

## Loading, Empty, Error States

These states get skipped more often than the happy path. Cover them deliberately.

- **Loading:** Prefer skeletons (grey boxes matching real layout) over spinners. Spinners are acceptable for <1 s actions inside an already-visible screen.
- **Optimistic UI:** User-initiated writes (logging a set, adding a meal) show the new state instantly; the sync queue reconciles in the background. If the write fails, show an undo/retry, not a modal.
- **Empty states:** Always include a primary CTA ("Log your first workout") and a one-line explanation. "No data" alone is failure.
- **Error states:** Actionable ("Retry", "Open settings") and specific. Avoid "Something went wrong" — say what and what to do.
- **Pull-to-refresh** on list screens (workout history, meal log). Use `RefreshControl`.

## Paywalls & Purchase Flows

- Follow Apple's subscription UX rules: price, period, and auto-renewal language visible before the user commits.
- A visible "Restore Purchases" button is required by App Review on the paywall and in Settings.
- Dismissal must be possible. Don't trap users behind a paywall unless they genuinely can't use the free tier.
- `components/paywall.tsx` is the canonical surface; avoid bespoke paywall screens.

## Gotchas

- **Expo Router's `(tabs)/_layout.tsx` max tabs.** iPhone HIG says 5. Exceeding it makes the bar scroll on iOS 26 — not a crash, but reads as unprofessional. Audit periodically.
- **`components/ui/button.tsx` defaults to `h-10` (40 pt).** That's under the 44 pt HIG minimum for touch targets. Use `size="lg"` (44 pt via `h-11`) for anything critical.
- **Sheet detents require a sheet lib.** `@rn-primitives/dialog` is a dialog, not a sheet. For detented sheets use `@gorhom/bottom-sheet` if added, else a full-screen modal.
- **`KeyboardAvoidingView` behavior differs by platform.** Since this is iOS-only, always use `behavior="padding"`. The `"height"` variant is for Android.
- **Reduce Motion ignored by Reanimated by default.** `withSpring` respects it; `withTiming` does not. Gate custom animations yourself.
- **Dark mode + `hsl(var(--…))` tokens:** if a token isn't defined for dark, the light value leaks through. `global.css` is the source; audit it when adding tokens.
- **Tab bar on iOS 26 minimises on scroll by default.** Design layouts assuming this, especially for long-scroll screens like history.
- **`StatusBar` style needs explicit setting.** `expo-status-bar` defaults to `auto`; verify light vs dark against your background at the screen level.

## References

- `@/Users/sebastiansole/Documents/gainsoclock/.claude/skills/mobile-ux-ios/references/haptics.md` — haptics decision matrix
- `@/Users/sebastiansole/Documents/gainsoclock/.claude/skills/mobile-ux-ios/references/motion.md` — animation patterns that perform
- `@/Users/sebastiansole/Documents/gainsoclock/.claude/skills/mobile-ux-ios/references/accessibility.md` — mobile a11y specifics beyond web WCAG

Apple HIG: https://developer.apple.com/design/human-interface-guidelines
