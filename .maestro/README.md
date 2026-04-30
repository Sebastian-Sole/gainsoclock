# Maestro E2E Flows

Agentic end-to-end tests for Fitbull on iOS. Each `.yaml` file is a flow Maestro can run against an iOS Simulator or real device running the Expo dev client.

## Prerequisites

- **Maestro CLI:** `curl -Ls "https://get.maestro.mobile.dev" | bash`
- **IDB** (iOS Simulator driver): `brew tap facebook/fb && brew install facebook/fb/idb-companion`
- **A running Expo dev client build.** Expo Go is not supported for the `launchApp` command — you need a dev build via `pnpm ios`.

## Running

```bash
# Single flow
maestro test .maestro/smoke.yaml

# Whole folder
maestro test .maestro/workout/

# All flows
maestro test .maestro/

# With Maestro Studio (interactive element inspector)
maestro studio

# With environment variables (for test credentials, etc.)
maestro test -e EMAIL=qa@example.com -e PASSWORD=secret .maestro/onboarding/
```

## Structure

```
.maestro/
├── README.md                       # this file
├── config.yaml                     # workspace-level config (tags, exclusions)
├── common/
│   └── launch-app.yaml             # reusable launch step (imported by other flows)
├── smoke.yaml                      # top-level smoke: launch + verify tabs exist
├── onboarding/
│   └── complete-onboarding.yaml    # fresh-install onboarding flow
├── workout/
│   └── log-workout.yaml            # log a set end-to-end
└── paywall/
    └── restore-purchases.yaml      # restore flow (Apple-required)
```

## Conventions

- **Selector priority:** `id` (testID) → `text` → `accessibilityLabel`. Avoid coordinate-based taps — they break on layout changes and Dynamic Type.
- **Every flow starts with** `appId: com.soleinnovations.fitbull`.
- **Reuse** `common/launch-app.yaml` via `runFlow:` at the top of feature flows.
- **Tag flows** (`tags: [smoke, paywall]`) so CI can filter.
- **No hardcoded delays** — use `waitForAnimationToEnd` or `assertVisible` with a timeout. `runScript` for anything conditional.

## Adding testIDs

Fitbull currently has zero `testID` props in components. To make flows reliable, add them to:

- Every `Pressable` / `Button` that a flow needs to tap
- Every `TextInput` that a flow fills
- Every screen-level container (for assertVisible anchoring)

Convention: `testID="<screen>-<element>"` — e.g. `testID="workout-start-button"`, `testID="meal-log-input"`.

## Maestro MCP

The project registers the Maestro MCP server in `.mcp.json` at the repo root. When Claude Code has access to the MCP server, it can drive the simulator directly — tap, type, assert, and author flow YAML from the live view hierarchy. See `.claude/skills/maestro-e2e/SKILL.md`.
