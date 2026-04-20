---
description: Enforceable coding conventions for the Fitbull Expo/RN/Convex stack
---

# Coding Conventions

These rules are enforceable. If a rule can be enforced by ESLint/TypeScript, prefer the tool; this file documents what the tools *don't* catch.

## Tooling

- **Package manager: pnpm only.** `pnpm-workspace.yaml` and `pnpm.overrides` in `package.json` pin `react-native-nitro-modules@0.32.2`. Using npm/yarn drops the override and breaks iOS builds.
- **Lint: `pnpm lint` (`expo lint` → ESLint 9 + `eslint-config-expo`).** Do not introduce a second formatter. Prettier is available transitively via `prettier-plugin-tailwindcss` for class sorting only — don't add a Prettier config.
- **Typecheck app code:** `npx tsc --noEmit`. The root `tsconfig.json` excludes `convex/`.
- **Typecheck Convex:** `pnpm convex:dev` (the Convex CLI). `convex/` has its own `tsconfig.json`.
- **Never install:** Biome, Husky (Expo manages its own build hooks), a second state library (Redux/Jotai/Recoil), a second styling layer (styled-components, Emotion).

## TypeScript

- `strict: true` is on. Do not add `// @ts-ignore`, `// @ts-expect-error`, or cast with `as` to silence errors. If narrowing is awkward, refactor the type.
- No `any`. Use `unknown` + narrowing or a real type.
- No `enum`. Use string-literal unions or `v.union(v.literal(...))` validators in Convex.
- Path alias `@/*` resolves to repo root. Prefer `@/components/ui/button` over long relative paths. Convex code imports from `@/convex/_generated/*` in app code; inside `convex/` use relative imports.
- Convex arg/return types come from the validator (`v.object(...)`). Do not hand-write TS types that shadow a validator — import from `_generated/api`.

## Expo / React Native

- Router is Expo Router 6 with `typedRoutes`. Use the `Href<T>` type from `expo-router` for typed links; don't cast paths to `any`.
- iOS-only modules must be guarded: `Platform.OS === "ios"` branch, or split into `.ios.tsx` / `.web.tsx` / `.android.tsx` siblings (see `hooks/use-color-scheme.web.ts`, `components/ui/icon-symbol.ios.tsx`).
- Never import `react-native-purchases` directly from components. Go through `hooks/use-purchases.ts` and `stores/subscription-store.ts`.
- Never import `@kingstinct/react-native-healthkit` outside `lib/healthkit.ts` and `hooks/use-healthkit.ts`.
- Never call `expo-haptics` directly. Use `lib/haptics.ts` (handles web no-op).
- **New Architecture + React Compiler are on.** Do not mutate refs during render, write conditional hooks, or use patterns the compiler rejects. If the compiler bails on a component, fix the code — don't disable the compiler per-file unless you first justify it in the PR description.
- Respect `accessibilityLabel`, `accessibilityRole`, `accessibilityState` on every interactive element. Any `Pressable` without a label fails review.
- Support Dynamic Type: do not hardcode font sizes that break at large accessibility text sizes. Use theme tokens.

## State

- **Client state lives in Zustand** (`stores/*.ts`), one store per domain. Do not introduce Redux, Jotai, or Context-based global state for new domains.
- **Server state lives in Convex.** Read via `useQuery` from `convex/react`, write via `useMutation`. Do not cache Convex results in Zustand — Convex already subscribes.
- **Sync boundary:** offline-first writes go through `lib/convex-sync.ts` + `providers/convex-sync-provider.tsx`. New mutations that should survive offline must plug into that queue, not call Convex mutations directly from components.
- Persisted stores use `AsyncStorage`; secret-bearing stores (auth tokens) use `expo-secure-store` via `lib/secure-storage.ts`.

## Convex

- Validators in `convex/validators.ts` are the source of truth for enum-ish fields (`exerciseTypeValidator`, `planStatusValidator`, etc.). Import and reuse — don't duplicate.
- Every query/mutation must call `getAuthUserId(ctx)` and bail when null. Never trust a client-supplied `userId`.
- Indexes are declared in `schema.ts`. If you query by a field that isn't indexed, add the index before merging.
- Keep query payloads small. The `listMeta` pattern in `convex/workoutLogs.ts` (metadata-only, full data hydrated from client store) is the preferred shape for list views.
- Long-running or third-party work (OpenAI, HTTP, scheduling) goes in an action, not a mutation. See `convex/chatActions.ts` and `convex/aiTools.ts`.

## Styling

- **NativeWind v4 + Tailwind 3** — class names only. No inline `StyleSheet.create` for anything themeable.
- Always merge classes through `cn()` in `lib/utils.ts` (`clsx` + `tailwind-merge`). Never concatenate with `+` or template literals alone.
- Use theme tokens (`bg-background`, `text-foreground`, `border-border`, etc.) from `tailwind.config.js`. Do not hardcode hex/rgb in components; add a token to the theme instead.
- Dark mode is driven by the `class` strategy — set via the root provider. Don't write `dark:` overrides based on `Platform`.
- New UI primitives go in `components/ui/` and wrap `@rn-primitives/*`. Follow the `cva`-based variant pattern in `components/ui/button.tsx`.

## Accessibility (WCAG 2.1 AA equivalents on mobile)

- Every interactive element has `accessibilityLabel` **and** `accessibilityRole`.
- Text contrast uses theme tokens (which are calibrated) — do not introduce ad-hoc colors without checking contrast in both light and dark.
- Minimum touch target: 44×44 pt (iOS HIG). Icon-only buttons use `size="icon"` on the `Button`.
- Form inputs: associate a visible label (`Label` from `components/ui/label.tsx`) with the input. Placeholder text is not a label.
- Screen-reader-only helper text uses `accessibilityHint`, not hidden `<Text>`.
- Locale: numeric input must accept both `.` and `,` as decimal separator (see commit `2629ff8`). Route through the shared parser in `lib/format.ts`.

## File Organization

- Routes → `app/**`. One screen per file. Grouped routes use `(group)` folders (`(auth)`, `(tabs)`).
- Feature components → `components/<feature>/*`. Shared primitives → `components/ui/*`.
- Hooks → `hooks/use-*.ts(x)`. Kebab-case filenames.
- Zustand stores → `stores/<domain>-store.ts`. One default export, no cross-store imports (stores compose via selectors in hooks).
- Utilities → `lib/<topic>.ts`. One topic per file.
- Convex modules → `convex/<domain>.ts` (queries/mutations) or `convex/<domain>Actions.ts` (actions).
- Types shared across features → `lib/types.ts`. Feature-local types live next to the feature.

## Commits

- Run `/verify` before committing.
- Commit messages: imperative, ≤72-char subject, body only if the why isn't obvious.
- Never use `--no-verify`. Fix the hook failure at its root.

## Things NOT to do

- Do not add a backend route outside Convex (no Express sidecar, no Vercel functions).
- Do not add `console.log` to committed code — use `__DEV__` guards or the logger in `lib/` if one exists.
- Do not regenerate `convex/_generated/*` by hand; it's produced by the Convex CLI.
- Do not edit `ios/` or `android/` by hand unless you're fixing a config plugin. Prefer Expo config plugins; `expo prebuild --clean` should always reproduce the native projects.
- Do not introduce a test runner without discussion. The project has no test script today; adding one is a stack decision, not a per-PR choice.
