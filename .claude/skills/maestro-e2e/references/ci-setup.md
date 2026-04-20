# CI setup

Running Maestro in CI against the Fitbull iOS app.

## Option A: EAS Workflows (Expo-native)

Simplest path. Expo provides a first-class E2E workflow that builds a simulator-target dev client and runs Maestro.

`.eas/workflows/e2e.yml`:

```yaml
name: E2E
on:
  pull_request:
    branches: [main]

jobs:
  build-simulator:
    type: build
    params:
      platform: ios
      profile: development-simulator

  run-maestro:
    needs: [build-simulator]
    type: maestro
    params:
      flow_path: .maestro/
      tags: smoke,critical-path
```

Add a `development-simulator` profile to `eas.json`:

```json
{
  "build": {
    "development-simulator": {
      "developmentClient": true,
      "distribution": "internal",
      "ios": { "simulator": true }
    }
  }
}
```

Pros: no self-hosted runner, no macOS CI setup, EAS handles caching.
Cons: requires an EAS plan with workflow minutes.

## Option B: GitHub Actions (self-hosted-mac or macos-latest)

`.github/workflows/e2e.yml`:

```yaml
name: E2E (Maestro)
on:
  pull_request:
    branches: [main]

jobs:
  e2e:
    runs-on: macos-14
    timeout-minutes: 30
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with: { version: 9 }

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm

      - run: pnpm install --frozen-lockfile

      - name: Install Maestro
        run: |
          curl -Ls "https://get.maestro.mobile.dev" | bash
          echo "$HOME/.maestro/bin" >> $GITHUB_PATH

      - name: Install IDB
        run: |
          brew tap facebook/fb
          brew install facebook/fb/idb-companion

      - name: Boot simulator
        run: |
          xcrun simctl boot "iPhone 16 Pro" || true
          xcrun simctl bootstatus "iPhone 16 Pro" -b

      - name: Build dev client for simulator
        run: pnpm ios --no-dev --non-interactive
        env:
          RCT_NO_LAUNCH_PACKAGER: 1

      - name: Run Maestro flows
        run: maestro test --include-tags smoke,critical-path .maestro/

      - name: Upload artifacts on failure
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: maestro-artifacts
          path: ~/.maestro/tests/
```

Pros: no extra service, runs in your org's GH Actions.
Cons: macOS minutes are expensive; first run downloads Xcode tooling + pods.

## Option C: Maestro Cloud

Run on Maestro's hosted simulator farm:

```yaml
- uses: mobile-dev-inc/action-maestro-cloud@v1
  with:
    api-key: ${{ secrets.MAESTRO_CLOUD_API_KEY }}
    app-file: build.app.tar.gz
    flows: .maestro/
```

Pros: no CI macOS hosting, parallel shards.
Cons: subscription cost; app artifact has to be uploaded per run.

## Tag strategy

Run PR-blocking subset on every PR; full suite nightly.

```yaml
tags:
  - smoke             # launch + verify app didn't break
  - critical-path     # auth, onboarding, log-workout, log-meal, paywall-restore
  - flaky             # known-flaky — nightly only, don't block PRs
  - app-review        # requirements from Apple review (restore-purchases, dismissable paywalls)
```

Block PRs on: `smoke,critical-path,app-review`.
Run nightly: all tags including `flaky`.

## Simulator determinism

- Pin a simulator device + iOS version in CI. Different devices render different DP/pt, which can shift layout.
- Reset between runs: `xcrun simctl erase all`.
- Seed time/locale explicitly when flows are time-sensitive (streaks, date math): `xcrun simctl spawn booted notifyutil -s …`.

## Secrets

- Test account credentials via `-e EMAIL=… -e PASSWORD=…` from CI secrets, never in `.maestro/**`.
- RevenueCat sandbox credentials same pattern.
- Convex prod deploy key — **never** in CI. Tests run against a dedicated dev deploy.

## What not to test in CI

- Real HealthKit data (simulator has no sensor data, and real data is sensitive).
- Real OpenAI round-trips (cost + flakiness). Mock via a Convex test action or a flagged dev mode.
- Push notifications delivery (APNs sandbox is unreliable). Test the *display* path with a local stub.
