---
name: expo-ios
description: "Fires when writing or reviewing Expo / React Native code targeting iOS -- Expo Router, New Architecture, React Compiler, Reanimated worklets, native modules, config plugins, EAS. Fires on files under app/**, components/**, hooks/**, lib/**, providers/**, stores/** and on edits to app.json, app.config.*, package.json, babel.config.*."
---

# Expo + React Native (iOS-only)

Fitbull is iOS-only, on Expo SDK 54 / RN 0.81 with the New Architecture enabled and React Compiler on (`experiments.reactCompiler: true` in `app.json`). This skill is the code-side counterpart to `mobile-ux-ios` — it encodes the Expo-specific patterns and framework-level gotchas.

## Baseline

| Thing | Value |
|---|---|
| Expo SDK | 54 (last SDK that supports opting *out* of New Arch; SDK 55 will require it) |
| React Native | 0.81 |
| React | 19 + React Compiler (stable 1.0 as of Dec 2025) |
| Router | Expo Router 6 with `typedRoutes: true` |
| Reanimated | v4 (requires New Arch, uses `react-native-worklets`) |
| Native arch | Fabric + TurboModules + Bridgeless, on by default |
| Package manager | pnpm only |
| Lint | `expo lint` (ESLint 9 + eslint-config-expo; includes `react-hooks` and `jsx-a11y`) |
| TS | 5.9, strict, `@/*` → repo root, `convex/` excluded from root config |

## Expo Router

- **File routing.** `app/**` is the route tree. A folder is a segment. Parentheses-wrapped folders (`(tabs)`, `(auth)`) are *groups* — no segment emitted.
- **`_layout.tsx`** per folder defines shared UI and the navigator type (Stack / Tabs). Root `app/_layout.tsx` wraps providers.
- **Typed routes.** With `typedRoutes: true`, `<Link href="…">` and `router.push(…)` are TS-checked. Don't cast paths to `any`; use `Href<T>` if needed.
- **Segment hooks.** `useSegments()` returns the current route segments; `useRouter()` gives `push/replace/back`. Prefer these over raw state.
- **Headless tabs / custom tab bar.** Use `Tabs.Screen` with `tabBarButton` or a custom header when design calls for it. Don't nest tab bars.
- **Types regenerate on `expo start`.** If autocomplete is stale, restart the dev server. The generated file lives in `.expo/types/`.
- **Dynamic routes** use `[id].tsx`; catch-all `[…rest].tsx`. Access via `useLocalSearchParams`. Always validate — `params` are strings.
- **Protected groups.** For auth-gated routes, use a layout `_layout.tsx` that redirects when unauthenticated (see `app/(auth)` pattern). Don't gate per-screen.

## React Compiler

Already on. Consequences:

- **Don't add `useMemo` / `useCallback` / `React.memo` for perf.** The compiler inserts equivalent memoization automatically. Manual memoization adds noise and can defeat the compiler.
- **Do add `useMemo`/`useCallback` when you need identity stability for a side effect or a non-React consumer** (e.g. passing a callback into a non-React library expecting a stable reference). Comment why.
- **Follow the Rules of React.** The compiler assumes purity:
  - No reading/writing refs during render.
  - No mutating props or closed-over state.
  - No conditional hooks.
- **ESLint catches violations.** The Expo config includes `react-hooks/rules-of-hooks` and `react-hooks/exhaustive-deps`. Keep them as errors, not warnings.
- **Pure components help the compiler.** Lift static data out of components; accept `children` when you're wrapping; don't hoist state higher than necessary.
- **The compiler won't fix bad architecture.** A slow list is still slow; a bad algorithm is still bad. Measure with the DevTools profiler.

## New Architecture

On by default. Things to watch:

- **Library compatibility.** Run `npx expo-doctor` after any dep change — it flags libs that aren't New Arch compatible. Block on red flags; untested-grey is acceptable with a spot check.
- **Native modules** must be TurboModules or Expo Modules. Old Bridge-era modules may crash or no-op silently.
- **No more bridge serialisation.** You get synchronous JSI calls, but that also means passing huge objects over is now *possible* — and a footgun. Keep native calls small.
- **Expo's precompiled XCFrameworks** (SDK 54) slash iOS clean-build time. To use them: don't override `use_frameworks!` in an `expo-build-properties` plugin unless required. A dep that forces it reverts to source compilation.

## Reanimated 4

- **New Arch required.** If a teammate disables New Arch, Reanimated 4 breaks. Don't.
- **Worklets** run on the UI thread. Use the `'worklet'` directive or rely on the Babel plugin's inference.
- **Shared values** (`useSharedValue`) — read `.value` only inside worklets or `useAnimatedStyle`. Reading from JS thread is a bug (warns).
- **Animate transforms and opacity**, not layout. See `@/Users/sebastiansole/Documents/gainsoclock/.claude/skills/mobile-ux-ios/references/motion.md`.
- **120 fps.** Ensure `CADisableMinimumFrameDurationOnPhone=true` in Info.plist. Default from RN 0.82 template; for SDK 54 add via `expo-build-properties` or a small config plugin.
- **`runOnJS`** is expensive. Batch calls or debounce via `useDerivedValue` + effect.

## Platform Guards (iOS-only app)

Even though we ship iOS-only, iOS-specific APIs still need structure:

- **File-extension variants.** `foo.ios.tsx` and `foo.web.tsx` resolve by Metro. `foo.ts` is the non-iOS fallback (also picked up by web). Useful for: HealthKit wrappers, IAP UI, simulator-vs-device differences.
- **`Platform.OS === "ios"`** branch inside shared files when only a few lines differ.
- **`Platform.select({ ios: …, default: … })`** for inline values.
- `app.json` still declares Android + Web targets today. If the plan is truly iOS-only forever, strip Android config — but keeping them costs little unless you add iOS-only native deps that don't build for them.

## Native modules & config plugins

- Treat `ios/` as generated output. Any change must be reproducible via `expo prebuild --clean`. Run that command if native state looks off.
- Config plugins live in `app.json` (`plugins: […]`) or `app.config.ts` for dynamic plugins. Reach for a plugin before hand-editing Xcode project files.
- The known RevenueCat native-build workaround is documented in `docs/revenuecat-purchases-module-fix.md` — consult before upgrading RN/Expo or touching purchases wiring.
- When adding a new native dep: `pnpm expo install <pkg>` (not `pnpm add`) — Expo picks the version compatible with the current SDK.

## Performance

- **Lists >20 items:** `FlatList` with `keyExtractor`, stable `getItemLayout` when item size is known, `maxToRenderPerBatch` and `windowSize` tuned for the screen density. Avoid `ScrollView` of `.map()` for dynamic data.
- **Images:** use `expo-image` (`Image` from `expo-image`) over RN's built-in for caching and placeholder handling.
- **Bundle size.** `npx expo-atlas` (SDK 54+) visualises what's in the bundle. Watch out for accidental full-library imports (e.g. `import * as …`).
- **Startup.** Move heavy initialisation (OpenAI client, HealthKit handshake) off the launch path; use `expo-splash-screen.hideAsync()` only when the first interactive frame is ready.

## Env & secrets

- **Client-safe env** via `expo-constants` or `EXPO_PUBLIC_*` vars — these ship in the bundle. Never put real secrets here.
- **Server secrets** (OpenAI key, RevenueCat admin key) live in Convex env (`pnpm exec convex env set …`), accessed only from Convex functions.
- **`expo-secure-store`** for per-user secret material (auth tokens) via `lib/secure-storage.ts`. Never use `AsyncStorage` for secrets.

## Upgrades

- **One SDK at a time.** `SDK 54 → 55 → 56`, never skip. Each minor has breaking changes and the delta is searchable.
- **Use `npx expo install --fix`** after upgrading to realign peer deps.
- **Check the changelog.** `expo.dev/changelog` and React Native's releases page.
- **`expo-av` is removed in SDK 55.** Migrate any `Audio`/`Video` usage to `expo-audio` / `expo-video` before that upgrade.

## Things to avoid

- **Manual `useMemo`/`useCallback` for perf** (React Compiler handles it).
- **Biome** — project uses ESLint via `expo lint`. Don't dual-install formatters.
- **`console.log`** in production code. Use `__DEV__` guards or remove. The `.claude/hooks/console-log-*.sh` hooks warn on edits.
- **Editing `ios/` by hand** unless you're writing a config plugin.
- **Mixing `npm`/`yarn`/`pnpm`.** pnpm only — `pnpm.overrides` in `package.json` pins `react-native-nitro-modules` and silent override loss breaks iOS builds.
- **`expo-av`** (deprecated). New code: `expo-audio`, `expo-video`.
- **Direct `react-native-purchases`, `@kingstinct/react-native-healthkit`, `expo-haptics` imports from components.** Go through `hooks/use-purchases.ts`, `lib/healthkit.ts` / `hooks/use-healthkit.ts`, `lib/haptics.ts`.
- **`useEffect` for derived state.** Compute during render; only use effects for subscriptions/side effects.

## Gotchas

- **`experiments.reactCompiler: true` in `app.json`** — the compiler runs via Babel. If a PR adds a Babel config that excludes `react-compiler/babel-plugin`, it silently disables the compiler. Audit `babel.config.js` on any change.
- **Typed routes generate on dev-server start.** CI runs that shortcut `expo start` (e.g. `expo export`) can ship with stale types. `expo customize` regenerates.
- **Convex is excluded from root tsconfig.** `tsc` won't typecheck `convex/**`. Use `pnpm convex:dev` or CI `convex codegen` to catch Convex-side errors.
- **`pnpm expo install` vs `pnpm add`.** `pnpm add` ignores Expo's version matrix and installs latest — a common source of New-Arch incompat. Always `expo install` for RN-adjacent deps.
- **`use_frameworks!` escalation.** One native dep forcing `use_frameworks! :linkage => :static` cancels precompiled XCFramework benefits. Check `ios/Podfile` after each upgrade.
- **`react-native-purchases` + Expo** has a known build workaround; see `docs/revenuecat-purchases-module-fix.md`. Upgrades routinely re-break it.
- **`FlashList` vs `FlatList` on New Arch.** Some older `FlashList` releases have bugs on Fabric — if a list acts weirdly, check the version.
- **Reanimated's Babel plugin must be *last*** in the plugins array. A new plugin inserted after it will break worklets silently.
- **React Compiler does not help outside React.** Heavy work in `lib/`, `stores/`, or Convex handlers still needs hand-tuning. Don't assume the compiler is magic.

## References

- `@/Users/sebastiansole/Documents/gainsoclock/.claude/skills/expo-ios/references/expo-router.md` — file-routing patterns and protected groups
- `@/Users/sebastiansole/Documents/gainsoclock/.claude/skills/expo-ios/references/reanimated.md` — worklet patterns and perf
- `@/Users/sebastiansole/Documents/gainsoclock/.claude/skills/expo-ios/references/native-modules.md` — config plugins and native dep hygiene
- `@/Users/sebastiansole/Documents/gainsoclock/.claude/skills/expo-ios/references/upgrades.md` — SDK upgrade protocol

Expo docs: https://docs.expo.dev/
React Native docs: https://reactnative.dev/
Reanimated docs: https://docs.swmansion.com/react-native-reanimated/
