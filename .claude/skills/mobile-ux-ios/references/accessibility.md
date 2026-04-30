# Mobile Accessibility (iOS)

Beyond web WCAG — the iOS-specific layer.

## VoiceOver traits

Every interactive element gets a `accessibilityLabel` *and* an `accessibilityRole`:

| Element | Role | Label shape |
|---|---|---|
| Primary button | `"button"` | Action verb + object: "Log set", "Save meal" |
| Toggle / switch | `"switch"` | State-independent: "Notifications" (VoiceOver reads state separately) |
| Tab | `"tab"` | Tab name: "Stats" |
| Image (decorative) | `accessibilityElementsHidden={true}` | (skip) |
| Image (informative) | `"image"` | Describe what it conveys |
| Link | `"link"` | Destination: "Open plan details" |
| Adjustable (stepper, slider) | `"adjustable"` | Name only; pair with `accessibilityValue` |

Use `accessibilityHint` for non-obvious consequences ("Starts your workout"). Don't duplicate the label.

## Dynamic announcements

- `AccessibilityInfo.announceForAccessibility("Workout saved")` after an async outcome the user can't see.
- `accessibilityLiveRegion="polite"` on React Native views that update (timer countdowns). Don't spam — rest timers should announce at milestones (30 s, 10 s, done), not every second.

## Focus management

- After a modal/sheet opens, focus the heading (`accessibilityElementsHidden={false}` + `ref.current?.focus()` on native, or use the dialog lib's autofocus).
- On close, return focus to the trigger. `@rn-primitives/dialog` handles this if you give it a `Trigger`.
- Don't set `accessibilityElementsHidden={true}` on a container expecting it to hide all descendants — in some RN versions you need `importantForAccessibility="no-hide-descendants"`.

## Dynamic Type

Supported sizes on iOS:
`xSmall, Small, Medium, Large (default), xLarge, xxLarge, xxxLarge, Accessibility Medium, Accessibility Large, Accessibility XL, Accessibility XXL, Accessibility XXXL`.

- Test at `Accessibility XXL`. It's the realistic worst case.
- NativeWind's text classes are fixed-size by default. For scaling, use `allowFontScaling={true}` (default) on `<Text>`.
- Containers that need to fit text must use `minHeight`, not `height`.

## Reduce Motion, Reduce Transparency, Increase Contrast

- `AccessibilityInfo.isReduceMotionEnabled()` — fall back to simple transitions.
- `AccessibilityInfo.isReduceTransparencyEnabled()` — replace blur/translucency with solid surfaces.
- `AccessibilityInfo.isBoldTextEnabled()` — some users turn this on; text weights should still render legibly.

Listen to change events on all three.

## Contrast

- Semantic tokens in `tailwind.config.js` + `global.css` should pass WCAG AA at minimum in both light and dark. Verify when adding a token.
- Large text (18 pt+ or 14 pt+ bold) can pass at 3:1. Body copy needs 4.5:1.
- Destructive-red-on-background pairs often fail dark mode — check.

## Switch Control

- Mostly automatic if roles and labels are correct.
- Avoid nesting interactive elements (a `Pressable` with a `Pressable` child). Switch Control can't disambiguate.
- Custom gestures (long-press, drag) should have a button alternative.

## Audit cadence

- Before merging any new screen, scroll through with VoiceOver on.
- After any Dynamic Type-sensitive change (fonts, row heights), test at XXL.
- The hook `.claude/hooks/a11y-check.sh` runs ESLint jsx-a11y rules on edit. Treat its output as a starting point, not a full audit — runtime traits only show up on a real device.
