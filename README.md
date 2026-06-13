# Fitbull

Cross-platform fitness, nutrition, and AI-coaching app for iOS, Android, and web. Users log workouts, track meals/macros, plan weeks, chat with an AI coach, and sync with Apple Health. Subscriptions are gated by RevenueCat.

## Requirements

- **Node 20+**
- **pnpm 9+** — the only supported package manager. `package.json` contains a `pnpm.overrides` block that pins `react-native-nitro-modules@0.32.2`. Using `npm` or `yarn` silently drops that pin and breaks iOS builds.
- **Xcode** (for iOS builds and the iOS Simulator)
- **A Convex account** — the backend runs on [Convex](https://convex.dev). First-time `pnpm convex:dev` will provision a free dev deployment.

> **Warning**: Do not use `npm` or `yarn` in this repo. The nitro-modules pin in `pnpm.overrides` is a hard requirement for iOS builds. Using any other package manager silently drops it.

## Setup

1. **Install dependencies**

   ```bash
   pnpm install
   ```

2. **Create your local env file and fill in values**

   ```bash
   cp .env.example .env.local
   ```

   Open `.env.local` and fill in your dev-project values. See `docs/env.md` for the full reference. Server-side variables (OpenAI, RevenueCat webhook, etc.) are set in the Convex dashboard, not in `.env.local`.

3. **Start the Convex backend**

   ```bash
   pnpm convex:dev
   ```

   First run provisions a dev deployment and walks you through authentication. Leave this running in a terminal — it watches `convex/` and deploys on save.

4. **Run the app**

   ```bash
   pnpm ios
   ```

   This opens a custom Expo dev client build on the iOS Simulator. **Expo Go is not supported** — the app uses native modules (HealthKit, RevenueCat, Sentry) that require a dev client.

## Scripts

| Script | What it does |
|---|---|
| `pnpm start` | Expo dev server (pick platform interactively) |
| `pnpm ios` | Build and launch on iOS Simulator / device |
| `pnpm android` | Build and launch on Android Emulator / device |
| `pnpm web` | Start Expo web target |
| `pnpm lint` | ESLint via `expo lint` |
| `pnpm convex:dev` | Start Convex dev server (typechecks `convex/` on save) |
| `pnpm clean:build` | `expo prebuild --clean --platform ios` — nukes `ios/` and regenerates it |

## Verification

```bash
# Typecheck app code (convex/ is excluded; the Convex CLI handles that)
npx tsc --noEmit

# Lint
pnpm lint
```

For end-to-end tests with Maestro, see `.maestro/README.md`. Requires Maestro CLI, IDB, and a booted iOS Simulator with the dev client installed.

## Further docs

- `CLAUDE.md` — agent and contributor conventions (coding rules, stack overview, gotchas)
- `docs/env.md` — full env-variable reference (client and server)
- `docs/revenuecat-purchases-module-fix.md` — native-build workaround for `react-native-purchases`
- `docs/revenuecat-webhook-rotation.md` — RevenueCat webhook token rotation procedure
- `plans/README.md` — improvement plan index and status
