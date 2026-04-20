# Flow patterns

Building blocks for common Fitbull test needs.

## Fresh launch

```yaml
- launchApp:
    clearState: true
    clearKeychain: true
    stopApp: true
- waitForAnimationToEnd:
    timeout: 5000
```

`stopApp: true` kills any running instance first — avoids "app already running" flakiness.

## Authenticated launch (stash seed state)

Maestro has no built-in login-seed, so either sign in once per flow (slow but real) or stash a known dev token in `AsyncStorage` via a pre-test `runScript`:

```yaml
- launchApp:
    clearState: false              # preserve seeded state
- assertVisible:
    id: "tab-bar"
```

For the "sign in once" approach, factor it into `common/sign-in.yaml` and `runFlow:` it.

## Filling a form

```yaml
- tapOn:
    id: "email-input"
- inputText: "qa@example.com"
- pressKey: Enter                  # dismiss keyboard OR advance field

- tapOn:
    id: "password-input"
- inputText: ${PASSWORD}           # from `-e PASSWORD=…` CLI env

- tapOn:
    id: "submit"
```

Numeric input with comma-decimal (our app supports both):

```yaml
- tapOn:
    id: "set-0-weight"
- inputText: "72,5"
- assertVisible:
    text: "72,5"
```

## Scrolling

```yaml
# Scroll until an element is visible (fails after timeout)
- scrollUntilVisible:
    element:
      id: "history-row-old"
    direction: DOWN
    speed: 40
    timeout: 10000

# Scroll within a specific container
- scroll:
    direction: DOWN
    childOf:
      id: "history-list"
```

## Conditional steps

```yaml
# Optional step: don't fail if the element isn't there
- tapOn:
    id: "permission-sheet-skip"
    optional: true

# Assert in an if/else style via runFlow: (Maestro doesn't have native if)
- runFlow:
    when:
      visible:
        id: "upgrade-banner"
    file: "upgrade-banner-dismiss.yaml"
```

## Swipe to dismiss

```yaml
- swipe:
    start: "90%,50%"
    end: "10%,50%"
    duration: 400
    childOf:
      id: "workout-log-row-0"
```

Prefer a tap-delete flow where available — swipe gestures can fight Reduce Motion and Accessibility settings.

## Screen verification

```yaml
# Multiple assertions = the screen must have all of them
- assertVisible:
    id: "workout-screen"
- assertVisible:
    text: "Today"
- assertNotVisible:
    id: "loading-spinner"          # verify we've hydrated
```

## Screenshots

```yaml
- takeScreenshot: launch-home
- tapOn:
    id: "tab-stats"
- takeScreenshot: stats-tab
```

Artifacts land under `~/.maestro/tests/<run-id>/`. Attach to CI for failure diagnosis.

## Dealing with permission dialogs

System permission dialogs (HealthKit, Notifications, Camera) are *native iOS sheets*, not part of the RN tree. Maestro taps them by text:

```yaml
- tapOn:
    text: "Don't Allow"            # the polite "no for tests" path
    optional: true

- tapOn:
    text: "Allow"                  # only if the flow actually needs the permission
    optional: true
```

Always `optional: true` because permission sheets only appear on first-run. Rerunning a flow after a previous grant means no sheet shows up.

## Rest timer / async outcomes

```yaml
- tapOn:
    id: "set-0-complete"
- waitForAnimationToEnd:
    timeout: 3000
- assertVisible:
    id: "rest-timer"
- assertVisible:
    id: "set-0-completed-indicator"
```

Don't use hardcoded `sleep: 5000` — Maestro has it, but it's flaky.

## Flow composition

Split long flows into logical steps:

```yaml
# .maestro/workout/log-workout.yaml
- runFlow: ../common/launch-app.yaml
- runFlow: ../auth/sign-in.yaml
- runFlow: ./log-workout-body.yaml
- runFlow: ./verify-in-history.yaml
```

Rule of thumb: if a sequence of 10+ steps is reused by 3+ flows, extract it.

## Debugging

- `maestro studio` opens an inspector against a running simulator — click-to-add steps, see the live hierarchy.
- `maestro test --debug-output <dir> <flow>` writes detailed logs + screenshots per step.
- When the MCP server is connected to Claude, asking "inspect the current screen and list all interactable elements" is often faster than reading XML.

## Performance expectations

- Smoke flow (launch + one assert): ~8–15 s on a warm simulator.
- Full onboarding flow: ~25–40 s.
- Full PR suite (smoke + critical-path tags): target under 3 minutes.

If a flow crosses 60 s, split it — Maestro is not designed for soup-to-nuts scripted journeys.
