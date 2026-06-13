# Maestro E2E Flows

Agentic end-to-end tests for Fitbull on iOS. Each `.yaml` file is a flow Maestro can run against an iOS Simulator or real device running the Expo dev client.

Flows are written against the **shipped** screens: a fresh, wiped install lands signed-out on the sign-up screen, and the real onboarding is `sign-up → welcome → 3 demos → founder-note → healthkit → paywall → /(tabs)`.

## Prerequisites

- **Maestro CLI:** `curl -Ls "https://get.maestro.mobile.dev" | bash`
- **IDB** (iOS Simulator driver): `brew tap facebook/fb && brew install facebook/fb/idb-companion`
- **A running Expo dev client build.** Expo Go is not supported for the `launchApp` command — you need a dev build via `pnpm ios`. (This is required, not optional: the flows install/relaunch `com.soleinnovations.fitbull`.)

## Running

```bash
# Single flow
maestro test .maestro/smoke.yaml

# Whole suite
maestro test .maestro/

# Onboarding/workout/nutrition flows need test credentials for the sign-up step
maestro test -e EMAIL=qa+run@example.com -e PASSWORD=hunter2hunter2 .maestro/onboarding/01-happy-path.yaml

# Interactive element inspector
maestro studio
```

## Structure

```
.maestro/
├── README.md                       # this file
├── config.yaml                     # workspace-level config (tags, exclusions)
├── smoke.yaml                      # launch + assert signup-siwa-button (signed-out anchor)
├── 99-canary.yaml                  # weekly canary: onboarding + workout + nutrition
├── common/
│   ├── launch-app.yaml             # reusable launch step (clearState/clearKeychain)
│   └── sign-up-email.yaml          # reusable email sign-up (uses ${EMAIL}/${PASSWORD})
├── onboarding/
│   └── 01-happy-path.yaml          # sign-up → demos → founder-note → healthkit → paywall → tabs
├── workout/
│   └── log-workout.yaml            # start empty → add exercise → log a set → finish
├── nutrition/
│   └── log-meal.yaml               # quick-add a meal
└── settings/
    └── restore-purchases.yaml      # restore flow (Apple-required)
```

## Conventions

- **Selector priority:** `id` (testID) → `text` → `accessibilityLabel`. Avoid coordinate-based taps — they break on layout changes and Dynamic Type.
- **Every flow starts with** `appId: com.soleinnovations.fitbull`.
- **Reuse** `common/launch-app.yaml` and `common/sign-up-email.yaml` via `runFlow:`.
- **Tag flows** (`tags: [smoke, paywall]`) so CI can filter.
- **No hardcoded delays** — use `waitForAnimationToEnd` or `assertVisible` with a timeout. Wrap conditional native-sheet taps in `runFlow: { when: { visible: ... } }`.
- **Native sheets** (RevenueCat paywall, HealthKit permission, restore alert) are optional-tap zones — never assert inside them. The soft paywall always lands on `/(tabs)`.

## testIDs

The app already ships `testID` props on the critical paths these flows target. The current selector inventory is documented in `.claude/skills/maestro-e2e/SKILL.md` and verified by the drift tripwire:

```bash
node scripts/check-maestro-ids.mjs   # exits non-zero if a flow references an id no component renders
```

When a flow needs a new handle, add a `testID` (plus `accessibilityLabel` + `accessibilityRole` on any interactive element) and re-run the tripwire. Convention: `testID="<screen>-<element>"` — e.g. `tab-workouts`, `set-0-weight`, `settings-restore-purchases`. Dynamic families (`set-${index}-weight|reps|complete`) are allowlisted in the tripwire.

## Maestro MCP

The project registers the Maestro MCP server in `.mcp.json` at the repo root. When Claude Code has access to the MCP server, it can drive the simulator directly — tap, type, assert, and author flow YAML from the live view hierarchy. See `.claude/skills/maestro-e2e/SKILL.md`.
