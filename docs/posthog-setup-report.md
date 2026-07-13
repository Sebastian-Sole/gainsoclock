# PostHog post-wizard report

The wizard completed a deep integration of Fitbull with PostHog. The project already had a mature analytics foundation (`lib/analytics.ts`, `providers/posthog-provider.tsx`, consent gate, session replay, HealthKit firewall) — this run activated the API key via `.env.local`, threaded the host env var through the provider, and added three missing capture calls for the AI coach, barcode scanner, and recipe builder.

## Events added

| Event | Description | File |
|---|---|---|
| `ai_coach_message_sent` | User sends a message to the AI fitness coach (both first message in a new conversation and subsequent messages) | `app/(tabs)/chat.tsx` |
| `barcode_scanned` | Barcode lookup returned a result; `found: true` when a product was identified, `found: false` when not in the database | `app/scan/index.tsx` |
| `recipe_created` | User saves a brand-new recipe (not an edit) with `ingredientCount` and `hasMacros` properties | `app/recipe/create.tsx` |

### Pre-existing events (already instrumented before this run)

`intake_started`, `auth_method_selected`, `auth_succeeded`, `goal_set`, `experience_set`, `days_set`, `healthkit_granted`, `healthkit_denied`, `paywall_presented`, `paywall_dismissed`, `trial_started`, `paid_converted`, `workout_logged`, `meal_logged`, `achievement_unlocked`, `notification_opened`, `review_opened`, and many onboarding/consent events.

## Next steps

The wizard built a dashboard and five insights to keep an eye on key user behaviour:

- [Analytics basics (wizard) dashboard](https://eu.posthog.com/project/222187/dashboard/812838)
- [Onboarding funnel](https://eu.posthog.com/project/222187/insights/T8FL5FNI) — `intake_started → auth_succeeded → paywall_presented → trial_started`
- [Workout & meal logs over time](https://eu.posthog.com/project/222187/insights/5bhlGf8I) — daily `workout_logged` and `meal_logged` counts
- [AI coach messages sent](https://eu.posthog.com/project/222187/insights/TdMTLMe7) — daily `ai_coach_message_sent` trend
- [Subscription conversion](https://eu.posthog.com/project/222187/insights/HLikhFC1) — `trial_started` vs `paid_converted` by day
- [Auth successes by method](https://eu.posthog.com/project/222187/insights/uoYniKeM) — `auth_succeeded` broken down by `method` (apple / email)

## Verify before merging

- [ ] Run a full production build and fix any lint or type errors introduced by the generated code.
- [ ] Run the test suite — call sites that were instrumented may need updated mocks or fixtures.
- [ ] Add `EXPO_PUBLIC_POSTHOG_HOST=https://eu.i.posthog.com` to `.env.example` and any CI/EAS build variable sheets so collaborators know what to set (it is already in `.env.example` as of this run — verify your EAS build secrets panel matches).
- [ ] Confirm the returning-visitor path also calls `identify` — the existing `identifyAnalytics` call in `app/_layout.tsx` covers authenticated sessions, but verify it fires on cold-start for already-signed-in users.

### Agent skill

The skill folder `.claude/skills/integration-expo/` is left in place. Use it as context for further PostHog agent development with Claude Code — it ensures the model follows the most up-to-date Expo/PostHog integration patterns.
