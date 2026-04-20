# Motion & Animation

Reanimated 4 + the UI thread. Keep animations readable and cheap.

## Property choice

| Prefer | Avoid | Why |
|---|---|---|
| `transform: translateX/Y, scale, rotate` | `top/left/width/height`, `margin`, `padding` | Non-layout → no reflow per frame |
| `opacity` | `backgroundColor` fade via hex | Opacity is GPU-cheap; colour interpolation is CPU work |
| `borderRadius` (small ranges) | Fully animating `borderRadius` 0→100 | Recomposites the view each frame |

## Timing feel

| Use | When |
|---|---|
| `withSpring(value, { stiffness, damping })` | UI element arrival/departure, press feedback, sheet presentation |
| `withTiming(value, { duration, easing })` | Progress bars, linear-pace indicators |
| `withDecay` | Gesture fling continuation (swipe-to-dismiss, horizontal paging) |
| `withSequence` / `withDelay` | Choreography (staggered list reveal) |

Default spring feels: `stiffness: 200, damping: 22, mass: 1`. Tune damping up for snappier settles.

## Respect Reduce Motion

```ts
import { AccessibilityInfo } from "react-native";
import { useEffect, useState } from "react";

function useReduceMotion() {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduce);
    const sub = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setReduce
    );
    return () => sub.remove();
  }, []);
  return reduce;
}
```

When `reduce` is true, swap elaborate transitions for `withTiming(…, { duration: 0 })` or simple opacity crossfades.

## Worklet rules (Reanimated 4)

- Worklets run on the UI thread. Use the `'worklet'` directive or let the Babel plugin infer.
- Access shared values via `.value` only inside worklets or `useAnimatedStyle`. Reading `.value` on the JS thread is a bug and warns.
- Closures capture only referenced variables. Don't rely on enclosing mutable state — pass it in.
- `useFrameCallback` must wrap its worklet in `useCallback` to avoid re-registration per render.
- Heavy math stays inside the worklet; avoid spawning JS-thread calls mid-animation (`runOnJS` is expensive — batch it).

## 120 fps

- iPhone 13 Pro+ supports ProMotion (up to 120 Hz). Fitbull's `app.json` uses `newArchEnabled: true` which is a prerequisite.
- Ensure `CADisableMinimumFrameDurationOnPhone=true` in Info.plist for true 120 fps. This is default in the RN 0.82 template; check `expo prebuild` output if on an earlier RN.
- Don't assume 120 — some devices and Low Power Mode cap at 60. Use relative timing (spring physics), not frame counts.

## Common bugs

- Animating `backgroundColor` between two hex strings on the JS thread → drop to 40 fps. Use `useAnimatedStyle` and interpolate.
- `Layout` animations (`entering`, `exiting`, `layout`) on a long list → stalls. Use shared element transitions or page-level fades instead.
- `runOnJS` in a per-frame callback → bridge saturation. Debounce with `useDerivedValue` + effect pattern.
- Changing `useSharedValue` default inline on each render → value resets on re-render. Declare at hook top level.
