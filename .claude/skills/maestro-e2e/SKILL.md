---
name: maestro-e2e
description: "Fires when writing, running, or debugging Maestro end-to-end flows for Fitbull on iOS. Fires on files under .maestro/**, when asked about E2E testing, UI integration tests, iOS Simulator testing, or Maestro MCP. Also fires when asked to add testID props to components for testability."
---

# Maestro E2E (iOS)

Fitbull uses **Maestro** for agentic end-to-end testing on iOS. YAML flows tap through the app against an iOS Simulator or real device running the Expo dev client. The Maestro MCP server gives Claude direct control of a running simulator — tap, type, assert, inspect the view hierarchy, and author flow YAML from live state.

This skill replaces the removed Playwright-based `e2e-testing` skill. Fitbull is iOS-only; we don't run Android flows.

## Baseline

| Thing | Value |
|---|---|
| Runner | Maestro CLI (`curl -Ls "https://get.maestro.mobile.dev" \| bash`) |
| iOS driver | Facebook IDB (`brew install facebook/fb/idb-companion`) |
| Build | Expo dev client (`pnpm ios` produces one). **Expo Go is not supported** for `launchApp`. |
| Flows dir | `.maestro/` at repo root |
| MCP | `.mcp.json` at repo root registers `maestro mcp` for Claude Code |
| App ID | `com.soleinnovations.fitbull` |

## Running flows

```bash
# Install (once): curl -Ls "https://get.maestro.mobile.dev" | bash

# Single flow
maestro test .maestro/smoke.yaml

# Whole folder
maestro test .maestro/workout/

# All flows
maestro test .maestro/

# Filter by tag
maestro test --include-tags smoke .maestro/

# With test credentials
maestro test -e EMAIL=qa@example.com -e PASSWORD=secret .maestro/onboarding/

# Interactive element inspector (point it at a running simulator)
maestro studio
```

Or from Claude Code via the slash command: `/e2e [flow-path]`.

## Flow anatomy

```yaml
appId: com.soleinnovations.fitbull
tags:
  - workout
  - critical-path
---
- runFlow: ../common/launch-app.yaml
- tapOn:
    id: "tab-workout"
- assertVisible:
    id: "workout-screen"
- inputText: "50"
  into:
    id: "set-0-weight"
- tapOn:
    id: "set-0-complete"
- assertVisible:
    id: "set-0-completed-indicator"
```

Every flow: `appId:` + `---` + step list. Steps run top-to-bottom; a failed step fails the flow.

## Selector priority

Pick the first that applies:

1. **`id:`** — matches React Native's `testID` prop. **Most stable; prefer this for any element a test touches.**
2. **`text:`** — matches visible text. Fragile across copy changes and localisation.
3. **`accessibilityLabel`** — via `label:`. Use when `testID` is missing but a label exists.
4. **`point:`** — coordinate-based. Avoid. Breaks on Dynamic Type, device size, layout shifts.

See `@/Users/sebastiansole/Documents/gainsoclock/.claude/skills/maestro-e2e/references/selectors.md`.

## The testID gap

Fitbull currently has **zero `testID` props** across components. Writing a reliable flow means adding them as you go. Convention:

```
testID="<screen-or-feature>-<element-role>"
```

Examples: `"workout-start-button"`, `"meal-log-input"`, `"tab-workout"`, `"paywall-close"`, `"set-0-weight"` (indexed).

On iOS, Maestro matches `testID` via the native `accessibilityIdentifier`. When `testID` is set and `accessibilityLabel` is not, VoiceOver may announce the testID — so pair them for interactive elements:

```tsx
<Pressable
  testID="workout-start-button"
  accessibilityLabel="Start workout"
  accessibilityRole="button"
  onPress={start}
/>
```

Adding testIDs is a change to app code. When authoring a flow, propose the needed testIDs as a small diff alongside the new YAML.

## Common steps

| Step | Purpose |
|---|---|
| `launchApp` | Start the app fresh; options: `clearState`, `clearKeychain`, `stopApp` |
| `runFlow` | Import another flow (e.g. `common/launch-app.yaml`) |
| `tapOn` | Tap matched element; options: `optional: true`, `retryTapIfNoChange: false` |
| `inputText` | Focus + type; `into:` targets the field |
| `eraseText` | Clear before typing |
| `assertVisible` / `assertNotVisible` | Presence check with implicit wait |
| `scroll` / `scrollUntilVisible` | Scroll until selector is visible (give up after timeout) |
| `swipe` | Gesture swipe (list item dismissal, paging) |
| `waitForAnimationToEnd` | Wait up to `timeout` ms for animations |
| `pressKey` | `Back`, `Home`, `Enter`, `Tab`, volume keys |
| `runScript` | Small JS for conditional flow (use sparingly) |
| `takeScreenshot` | Visual snapshot for debugging / artifact |

Full reference: `@/Users/sebastiansole/Documents/gainsoclock/.claude/skills/maestro-e2e/references/flow-patterns.md`.

## Maestro MCP

The Maestro MCP server (launched Feb 2026) lets Claude drive the simulator directly via MCP tools. Registered in `.mcp.json`:

```json
{ "mcpServers": { "maestro": { "command": "maestro", "args": ["mcp"] } } }
```

With the MCP server running and a simulator booted, you can ask Claude to:

- "Explore the app and list all tabs with their testIDs."
- "Record a flow that logs a single set — infer the selectors from the live view hierarchy."
- "Run `.maestro/workout/log-workout.yaml`, and if it fails, screenshot the failing screen."

The MCP server needs Maestro CLI on `$PATH`. After installing Maestro, restart Claude Code so it picks up `.mcp.json`.

## CI

See `@/Users/sebastiansole/Documents/gainsoclock/.claude/skills/maestro-e2e/references/ci-setup.md` for EAS Workflows and GitHub Actions templates. Key points:

- Build a simulator-target dev client with EAS (`eas build --profile development-simulator --platform ios --local`) or `pnpm ios` locally.
- Install Maestro in CI via the `mobile-dev-inc/action-maestro-cloud` action or the curl installer.
- Run `maestro test --include-tags smoke,critical-path .maestro/` as a PR gate; full suite on nightly.

## Gotchas

- **Expo Go doesn't work.** `launchApp: { appId: "com.soleinnovations.fitbull" }` expects the dev-client binary to be installed on the simulator. Run `pnpm ios` once to install the dev client, then Maestro can launch it.
- **First `launchApp` after code changes is slow.** Metro has to bundle. Boot the simulator + dev client before starting a test run rather than relying on Maestro to cold-start everything.
- **`clearState: true` wipes `AsyncStorage` and the Convex auth token.** Every flow starts signed-out. Plan auth for each flow or stash a signed-in seed state.
- **`clearKeychain: true` removes iOS keychain entries**, which includes `expo-secure-store` values (auth tokens, refresh tokens). Combine with `clearState` when you want a true fresh-install flow.
- **HealthKit permissions persist across `clearState`.** iOS tracks them at the OS level. Reset via `xcrun simctl privacy booted reset health com.soleinnovations.fitbull` or erase-and-boot the simulator.
- **RevenueCat sandbox.** Paywall flows only work with a sandbox Apple ID signed in on the simulator. Restore-purchases flows need a known sandbox subscription.
- **`inputText` doesn't dismiss the keyboard.** Follow with `pressKey: Enter` or `tapOn:` another element to move focus. Otherwise the next `tapOn:` may hit the keyboard.
- **Selectors are case-sensitive.** `tapOn: { text: "sign in" }` does not match `"Sign In"`. Use regex if needed: `tapOn: { text: "(?i)sign in" }`.
- **`testID` on a wrapper view can swallow the accessibility tree.** If Maestro can't find a child element after you add a parent testID, set `accessible={false}` on the parent or move the testID to the actual interactive child.
- **ProMotion (120 Hz) vs Simulator (60 Hz).** Animation-timing tests that pass in the simulator may still flake on real hardware. Use `waitForAnimationToEnd` rather than hardcoded waits.
- **`runScript` JS runs on the host, not the device.** It's for generating inputs or reading env vars, not for poking app internals.
- **Don't grant real permissions in test flows.** Skip HealthKit / Notifications / Camera with `tapOn: { id: "…-skip", optional: true }`. Permission dialogs are native iOS sheets — Maestro can tap them by text (`"Allow"`, `"Don't Allow"`) if really needed.
- **Flow order in `.maestro/` is alphabetical** by default. Name flows to suggest order (`01-onboarding.yaml`, `02-…`) or specify explicitly via tags + `maestro test --include-tags …`.

## References

- `@/Users/sebastiansole/Documents/gainsoclock/.claude/skills/maestro-e2e/references/selectors.md` — selector semantics and choice
- `@/Users/sebastiansole/Documents/gainsoclock/.claude/skills/maestro-e2e/references/flow-patterns.md` — common flow shapes (auth, forms, scroll, conditional)
- `@/Users/sebastiansole/Documents/gainsoclock/.claude/skills/maestro-e2e/references/ci-setup.md` — EAS Workflows and GitHub Actions

Maestro docs: https://docs.maestro.dev
Maestro MCP: https://docs.maestro.dev/get-started/maestro-mcp
