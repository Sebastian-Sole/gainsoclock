# Native modules & config plugins

## Rule 0: `ios/` is generated

Anything in `ios/` should be reproducible from `app.json`, `app.config.ts`, and the plugin list. If you need to edit `ios/` by hand, you need a config plugin.

```bash
pnpm exec expo prebuild --clean --platform ios
```

This regenerates the native project. Run after any change to `app.json`/plugins, and as a sanity check if builds act odd.

## Installing native deps

```bash
pnpm expo install <pkg>     # picks the version Expo SDK 54 expects
# not `pnpm add <pkg>` -- that skips the matrix
```

After install:
1. `pnpm exec expo prebuild --clean --platform ios` if the package has a native component.
2. `npx expo-doctor` to verify New Arch compatibility.
3. Build in Xcode or via `pnpm ios`.

## Config plugins in this repo

`app.json` currently declares:

```
plugins: [
  "expo-router",
  ["expo-splash-screen", { ... }],
  "@react-native-community/datetimepicker",
  ["@kingstinct/react-native-healthkit", {
    "NSHealthShareUsageDescription": "...",
    "NSHealthUpdateUsageDescription": "...",
    "background": false
  }],
  "expo-web-browser",
  "expo-notifications"
]
```

- HealthKit plugin sets the two `NS*UsageDescription` strings. These appear in the iOS consent sheet — keep them accurate, specific, and in the user's language. Apple rejects vague strings.
- `"background": false` means we don't request background HealthKit delivery. Flipping that to `true` requires justification to App Review and different UX.

## Adding a new native dep — checklist

- [ ] `pnpm expo install <pkg>`
- [ ] If it needs permissions, config, or Info.plist keys: check for a config plugin; add to `app.json`.
- [ ] `pnpm exec expo prebuild --clean --platform ios`
- [ ] Clean build in Xcode (Product → Clean Build Folder) the first time.
- [ ] `npx expo-doctor` — confirm New Arch compat, peer-dep alignment.
- [ ] Wrap in an app-level module (`lib/<topic>.ts` or `hooks/use-<topic>.ts`) — never import the lib from components directly.
- [ ] Gate with `Platform.OS === "ios"` only if the lib truly has no iOS implementation (rare; we're iOS-only, but future Android/web work shouldn't crash).

## `use_frameworks!` & precompiled XCFrameworks

Expo SDK 54 ships precompiled XCFrameworks of React Native for iOS, cutting clean-build time dramatically. If one native dep forces `use_frameworks! :linkage => :static`, you fall back to source compilation.

Check `ios/Podfile` after each upgrade or new dep:

```ruby
# Bad (for our perf goal) unless truly required:
use_frameworks! :linkage => :static
```

If a dep requires it, weigh whether the feature is worth the build-time hit. Some deps (e.g. certain Firebase, some Swift-only modules) need it.

## RevenueCat

There's a known native build issue tracked in `docs/revenuecat-purchases-module-fix.md`. Read before upgrading Expo, RN, or `react-native-purchases`. The fix is a small patch in the pod spec; keep it reproducible via a `patch-package` entry or a post-install script.

## Debugging native builds

- `pnpm ios --device` to deploy to a real device.
- `pnpm exec expo run:ios --no-build-cache` to force a clean Metro + native build.
- `xcrun simctl list` to see simulators.
- `xcrun xctrace record` to profile performance on a real device.

Don't try to debug a native issue in Metro. Open `ios/Fitbull.xcworkspace` in Xcode and read the actual build log.
