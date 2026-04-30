# Haptics

Source of truth: `lib/haptics.ts`. Never import `expo-haptics` directly.

## Decision matrix

| User moment | API | Why |
|---|---|---|
| Toggling a switch, changing a picker value, moving a slider detent | `Haptics.selectionAsync()` | Light, selection-change feel; no semantic weight |
| Pressing a confirm/primary button (Log set, Save meal) | `Haptics.impactAsync(Light)` | Direct physical-interaction feel |
| Drag-and-drop landing, reordering, swipe-to-delete committing | `Haptics.impactAsync(Medium)` | Anchors the gesture completion |
| Dramatic moment (starting workout, PR set) | `Haptics.impactAsync(Heavy)` | Save for moments that matter, maybe 1–2 in a session |
| Workout saved, meal logged, sync succeeded | `Haptics.notificationAsync(Success)` | Outcome feedback |
| Form validation failed, network error, declined | `Haptics.notificationAsync(Error)` | Outcome, negative |
| Near a limit (rest timer under 10 s, cooldown) | `Haptics.notificationAsync(Warning)` | Outcome, caution |

## Anti-patterns

- Haptics on every tap → feels like a cheap Android-clone app.
- Haptics on scroll → battery drain and nausea.
- Heavy impact for minor events → dilutes the signal of real moments.
- Haptics during active voice-over reading → interrupts TTS. Gate with `AccessibilityInfo.isScreenReaderEnabled()` and skip or soften.
- Haptics in the background → iOS blocks them, but logging the attempt still wastes CPU.

## Implementation

```ts
// lib/haptics.ts wraps this — call the wrapper.
import { tap, success, warn, error } from "@/lib/haptics";

<Button onPress={() => { tap(); startWorkout(); }} />
```

On web, the wrapper is a no-op. Don't wrap call sites in `Platform.OS` checks.
