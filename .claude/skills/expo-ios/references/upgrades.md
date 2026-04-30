# Expo SDK upgrade protocol

## Golden rule

One SDK version at a time. `54 → 55 → 56`, never skip. Each minor has breaking changes, and delta-debugging is far easier than multi-delta debugging.

## Before you upgrade

- Read the changelog at https://expo.dev/changelog
- Check React Native's release notes for the matching RN version.
- Search the changelog for `react-native-purchases`, `@kingstinct/react-native-healthkit`, `nativewind`, `react-native-reanimated`, and any other native dep we use.
- Make sure `main` is green (`/verify`) and committed.

## Upgrade steps

```bash
# Bump SDK
pnpm exec expo upgrade
# -- or, if that tool is gone in this SDK --
pnpm add expo@~<target> && pnpm expo install --fix

# Re-align peer deps
pnpm expo install --fix

# Regenerate native project
pnpm exec expo prebuild --clean --platform ios

# Compat check
npx expo-doctor

# Build
pnpm ios
```

## SDK-specific notes

### 54 → 55 (upcoming)

- SDK 55 requires the New Architecture. Make sure `newArchEnabled: true` in `app.json` (already set here).
- `expo-av` is removed. Migrate to `expo-audio` + `expo-video` *before* bumping SDK:
  - `Audio.Sound` → `useAudioPlayer` (from `expo-audio`)
  - `Video` component → `VideoView` (from `expo-video`)

### Reanimated major bumps

- Reanimated 4.x requires Fabric. We have it.
- Plugin order matters — reanimated's Babel plugin stays *last*.
- Breaking API changes between 3.x → 4.x involve worklet syntax and the `useReducedMotion` hook name — check the migration guide.

### React Compiler

- Stable as of Dec 2025 (v1.0). Already enabled via `experiments.reactCompiler: true`.
- When upgrading React, check the compiler's compatibility matrix — the compiler version tracks React's.

## Post-upgrade smoke test

- App launches.
- Sign in works (`@convex-dev/auth`).
- HealthKit permission sheet appears (iOS only; delete app first to reset permissions).
- RevenueCat paywall renders (test with the sandbox account).
- Notifications arrive (foreground + background).
- Chat screen: AI replies come through (Convex action + OpenAI).
- Offline log: airplane-mode a set and bring the network back; confirm the sync queue reconciles.

## Rollback

- `git revert` the upgrade commit, `pnpm install`, `pnpm exec expo prebuild --clean`.
- If native state is stuck, delete `ios/` and re-run prebuild.

## Common upgrade surprises

- A transitive dep forces `use_frameworks!` → build times balloon. Check `Podfile`.
- A native module's plugin has a new required option → Expo throws a clear error; read it.
- Xcode version mismatch → update Xcode before the SDK if the notes require it.
- Convex CLI pins: `@convex-dev/auth` and `convex` may need their own bump; the Expo changelog won't mention them.
