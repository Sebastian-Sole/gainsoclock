# Expo Router 6 — patterns in this repo

## Route groups

```
app/
  _layout.tsx            # root providers; wraps everything
  (auth)/
    _layout.tsx          # redirect if unauthenticated
    sign-in.tsx
  (tabs)/
    _layout.tsx          # Tabs navigator
    index.tsx
    stats.tsx
  workout/
    [id].tsx             # dynamic: /workout/abc123
```

Parenthesized folders don't appear in the URL. Use them to share a layout or to split flows (public vs authenticated).

## Navigation

```tsx
import { Link, router, useSegments } from "expo-router";

// Typed href — autocomplete-assisted when typedRoutes is on
<Link href="/stats">Stats</Link>

// Imperative
router.push("/workout/abc123");

// Replace (no back-stack entry)
router.replace("/(tabs)");

// Current segments, useful for computing relative paths
const segments = useSegments();  // e.g. ["(tabs)", "stats"]
```

Avoid `as any` casts on `href`. If the typed route isn't inferred, restart `expo start` to regenerate `.expo/types/`.

## Dynamic params

```tsx
import { useLocalSearchParams } from "expo-router";

const { id } = useLocalSearchParams<{ id: string }>();
// Always validate -- params are strings, may be arrays for catch-alls
```

For Convex queries that take an `Id<"table">`, narrow first:

```tsx
const docId = id as Id<"workouts">;  // only after validating
```

Better: validate with a Convex validator on the server side regardless, and rely on the auth check to bail on mismatches.

## Protected groups

```tsx
// app/(auth)/_layout.tsx
import { Redirect, Slot } from "expo-router";
import { useAuth } from "@/hooks/use-auth-guard";

export default function AuthLayout() {
  const { user, ready } = useAuth();
  if (!ready) return null;            // or a splash/skeleton
  if (!user) return <Redirect href="/(auth)/sign-in" />;
  return <Slot />;
}
```

Gate the *layout*, not each screen. One check guards every descendant.

## Tabs max 5 on iPhone

iPhone tab bars hold 5 items. iOS 26 will scroll extras but the UX reads as unfinished. Fitbull's `(tabs)/_layout.tsx` currently has 6 entries — consolidate.

## Headers & transitions

```tsx
// app/workout/[id].tsx
export const unstable_settings = {
  headerLargeTitle: false,
  presentation: "card",        // "modal" for sheet-like presentation
  animation: "default",        // "slide_from_bottom" for sheets, etc.
};
```

For modal screens, prefer `presentation: "modal"` over an overlay component — users get the native swipe-to-dismiss for free.

## Deep linking

`app.json` sets `"scheme": "fitbull"`. Deep links route via the same file tree. Validate params on arrival — a malicious deep link could target a screen expecting Convex-scoped data.
