# Reanimated 4 — worklets & perf

Requires the New Architecture (we have it).

## Shared values

```tsx
import { useSharedValue, useAnimatedStyle, withSpring } from "react-native-reanimated";

const progress = useSharedValue(0);

const style = useAnimatedStyle(() => ({
  transform: [{ scale: 0.9 + progress.value * 0.1 }],
  opacity: progress.value,
}));

<Animated.View style={style}>…</Animated.View>

// Kick it off
progress.value = withSpring(1, { stiffness: 200, damping: 22 });
```

Rules:
- Read/write `.value` only inside worklets or `useAnimatedStyle`.
- Don't re-declare shared values during render with changing defaults.
- Don't read shared values in effects — use `useDerivedValue` + `useAnimatedReaction` instead.

## Worklet directive

```tsx
function pulse(value: number) {
  "worklet";
  return withSpring(value, { stiffness: 180 });
}
```

The Babel plugin also infers worklets from context (e.g. callbacks passed to animated hooks). The explicit directive documents intent.

## Gesture-driven animation

```tsx
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { useSharedValue, useAnimatedStyle } from "react-native-reanimated";

const tx = useSharedValue(0);
const pan = Gesture.Pan().onUpdate(e => { tx.value = e.translationX; });

const style = useAnimatedStyle(() => ({ transform: [{ translateX: tx.value }] }));

<GestureDetector gesture={pan}>
  <Animated.View style={style}>…</Animated.View>
</GestureDetector>
```

Always `worklet`-safe inside `.onUpdate` (default). Any JS-side side effect needs `runOnJS(fn)(…)` — use sparingly.

## Crossing threads

```tsx
import { runOnJS } from "react-native-reanimated";

pan.onEnd(() => {
  runOnJS(setState)(true);
});
```

`runOnJS` has overhead. Don't call it per frame; call it on gesture end or on debounced thresholds.

## Animated layout

`Layout.springify()` / `FadeIn` / `FadeOut` are nice for small lists. For long lists (history, meal log), layout animations cause judder — fade pages in, don't animate each row.

## Reduce Motion

```tsx
import { useReducedMotion } from "react-native-reanimated";

const reduce = useReducedMotion();
progress.value = reduce ? 1 : withSpring(1);
```

Reanimated 3.6+ provides this hook. Always respect it for non-essential motion.

## 120 fps

- Requires `CADisableMinimumFrameDurationOnPhone=true` in Info.plist.
- Default from RN 0.82 template. For SDK 54 (RN 0.81), add via `expo-build-properties`:

```json
"plugins": [
  ["expo-build-properties", { "ios": { "extraInfoPlist": { "CADisableMinimumFrameDurationOnPhone": true } } }]
]
```

- Confirm with an iPhone Pro — Simulator caps at 60.

## Common bugs

- **Plugin order.** Reanimated's Babel plugin *must be last* in `babel.config.js`. New plugins inserted after it silently break worklets.
- **Stale closures.** A worklet captures variables by reference — if a value is stored in a regular JS variable that changes, the worklet sees the original. Use shared values for anything mutable.
- **Animating `height`** during keyboard open/close stutters. Use `KeyboardAvoidingView` with `behavior="padding"` and leave heights alone.
- **`withTiming` ignores Reduce Motion** by default; `withSpring` respects it. Gate manually when using timing.
