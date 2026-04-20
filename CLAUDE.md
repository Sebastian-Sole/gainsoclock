# Fitbull

Cross-platform fitness, nutrition, and AI-coaching app for iOS, Android, and web. Users log workouts, track meals/macros, plan weeks, chat with an AI coach, and sync with Apple Health. Subscriptions gated by RevenueCat.

## Stack

| Layer | Choice |
|---|---|
| Package manager | pnpm (workspace) |
| Runtime | Expo SDK 54, React Native 0.81, React 19 (Compiler enabled) |
| Routing | Expo Router 6 (typedRoutes + New Architecture on) |
| Backend | Convex (`convex/`) with `@convex-dev/auth` |
| Styling | NativeWind v4 + Tailwind 3, `tailwind-merge`, `class-variance-authority` |
| UI primitives | `@rn-primitives/*` (shadcn-style wrappers in `components/ui/`) |
| State (client) | Zustand stores in `stores/`, `AsyncStorage` + `expo-secure-store` |
| AI | `openai` SDK, tool calling via Convex actions (`convex/aiTools.ts`, `chatActions.ts`) |
| Payments | `react-native-purchases` (RevenueCat) |
| Health | `@kingstinct/react-native-healthkit` (iOS only) |
| Notifications | `expo-notifications` |
| Lint | `expo lint` (ESLint 9 + `eslint-config-expo`) |
| Types | TypeScript 5.9, `strict: true`, path alias `@/*` |

## Key Commands

- `pnpm start` — Expo dev server
- `pnpm ios` / `pnpm android` / `pnpm web` — platform targets
- `pnpm lint` — `expo lint`
- `npx tsc --noEmit` — typecheck app code (convex/ excluded; use `pnpm convex:dev` to typecheck Convex)
- `pnpm convex:dev` — run Convex in dev, deploys functions on save
- `pnpm clean:build` — `expo prebuild --clean --platform ios` (nuke native ios/ when it drifts)
- `maestro test .maestro/` — end-to-end flows (iOS Simulator). Preflight: Maestro CLI + IDB installed, simulator booted with the dev client. Details in `.claude/skills/maestro-e2e/SKILL.md`.

There is no unit-test script yet. Run `/verify` for the full chain and `/e2e` for Maestro flows.

## Directory Map

- `app/` — Expo Router routes. Groups: `(auth)/`, `(tabs)/`. Feature roots: `calculator/`, `chat/`, `exercise/`, `import/`, `plan/`, `recipe/`, `settings/`, `template/`, `workout/`.
- `components/` — feature folders (`workout/`, `nutrition/`, `onboarding/`, `plan/`, `history/`, `stats/`, `chat/`, `explore/`, `shared/`) plus `components/ui/` (primitive wrappers).
- `convex/` — backend: `schema.ts`, validators, queries/mutations, actions (`chatActions.ts`, `aiTools.ts`). Has its own `tsconfig.json`.
- `stores/` — Zustand stores; one per domain (workout, meal-log, plan, subscription, onboarding, etc.).
- `providers/` — React context providers (`convex-sync-provider`, `network-provider`, `onboarding-provider`).
- `lib/` — utilities (`healthkit`, `notifications`, `haptics`, `format`, `storage`, `secure-storage`, `theme`, `convex-sync`).
- `hooks/` — React hooks (`use-workout-timer`, `use-rest-timer`, `use-healthkit`, `use-purchases`, `use-chat`, etc.).
- `docs/` — ops notes (e.g. `revenuecat-purchases-module-fix.md`).
- `.claude/` — harness (agents, skills, commands, rules, hooks).

## Knowledge

- Coding conventions: `.claude/rules/coding-conventions.md`
- Harness integration notes: `.claude/ONBOARDING.md`
- Artifact quality rules (when editing `.claude/*`): `.claude/rules/artifact-quality.md`
- Expo / Expo Router / Convex / NativeWind docs — consult directly; do not inline stale snippets here.

## Critical Constraints

- **Convex is excluded from the root tsconfig.** Changes in `convex/` are typechecked by the Convex CLI, not `tsc`. Keep imports in app code going through generated `convex/_generated/*`, not raw server modules.
- **iOS-only APIs must be guarded.** HealthKit (`@kingstinct/react-native-healthkit`) and some RevenueCat UI surfaces are iOS-only. Gate with `Platform.OS === "ios"` or use `.ios.tsx` / `.web.tsx` file variants (see `hooks/use-color-scheme.web.ts`, `components/ui/icon-symbol.ios.tsx`).
- **New Architecture + React Compiler are on.** Don't disable them casually. Avoid patterns the compiler chokes on (mutating refs during render, conditional hooks).
- **RevenueCat module has a known native-build workaround** documented in `docs/revenuecat-purchases-module-fix.md`. Read before touching `react-native-purchases` wiring or upgrading Expo.
- **Accessibility target: WCAG 2.1 AA** equivalents on mobile — use `accessibilityLabel`, `accessibilityRole`, dynamic type, sufficient contrast against theme tokens. VoiceOver + TalkBack are in-scope.
- **Locale: comma-decimal support.** Recent commit (`2629ff8`) added comma-decimal parsing for weights/reps input — don't regress it when editing numeric inputs.
- **Offline-first.** Client writes go through Zustand + `convex-sync` queue; assume network may be absent. See `providers/convex-sync-provider.tsx` and `lib/convex-sync.ts`.
- **No secrets in the repo.** Convex env, RevenueCat keys, OpenAI keys live in Convex env and Expo app config — never commit them.

## Personality

You are a careful collaborator on a small fitness-app codebase. Favor narrow, reversible edits over sweeping refactors. When a change crosses the Expo ↔ Convex boundary, stop and confirm the contract before coding. Prefer the existing Zustand store + Convex sync pattern over introducing new state libraries or data-fetching layers.

## Gotchas

- **`pnpm` is required** — `pnpm-workspace.yaml` and the `pnpm.overrides` block pin `react-native-nitro-modules` to `0.32.2`. Using npm/yarn silently drops the override and breaks iOS builds.
- **`@/*` resolves to repo root**, not `src/`. `@/components/ui/button` → `./components/ui/button.tsx`.
- **Expo Router typed routes** regenerate on dev-server start. If route types look stale, restart `pnpm start`.
- **Convex validators** (`convex/validators.ts`) are the source of truth for enum-like fields. Don't duplicate them in app code — import and reuse.
- **`hooks/use-color-scheme.web.ts` and `.ios.tsx` component variants** are resolved by Metro by extension; changing one without the others causes platform drift.
- **Haptics** live in `lib/haptics.ts` — call through the wrapper so web/no-op is handled; don't call `expo-haptics` directly from components.
- **Subscription state** reads from `stores/subscription-store.ts`, which is fed by `hooks/use-purchases.ts`. Don't read `react-native-purchases` directly from components.

## Important

- Run `/verify` before committing.
- Check `.claude/rules/coding-conventions.md` before writing new components or Convex functions.
- Never commit `.env*`, Convex deploy keys, or RevenueCat API keys.
- Never bypass git hooks (`--no-verify`); fix the underlying issue.
