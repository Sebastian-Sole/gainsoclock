# Environment Variable Reference

This document lists every environment variable the project reads. It is the
single source of truth — add a variable here in the same PR that introduces it.

---

## Client variables (`EXPO_PUBLIC_*`)

These land in the compiled app bundle. Use dev-project values locally; never
commit production secrets. Copy `.env.example` to `.env.local` (gitignored)
and fill in your values.

| Variable | Purpose | Where read |
|---|---|---|
| `EXPO_PUBLIC_CONVEX_URL` | URL of the Convex deployment the app connects to | `app/_layout.tsx` |
| `EXPO_PUBLIC_SENTRY_DSN` | Sentry DSN for crash reporting | `app/_layout.tsx` |
| `EXPO_PUBLIC_POSTHOG_API_KEY` | PostHog project API key (client-side analytics) | `providers/posthog-provider.tsx` |
| `EXPO_PUBLIC_REVENUECAT_API_KEY_IOS` | RevenueCat iOS SDK key | `hooks/use-purchases.ts` |
| `EXPO_PUBLIC_REVENUECAT_API_KEY_ANDROID` | RevenueCat Android SDK key | `hooks/use-purchases.ts` |

CI additionally injects `EXPO_PUBLIC_CONVEX_SITE_URL` at build time
(`ios/ci_scripts/ci_post_clone.sh`) and requires `SENTRY_AUTH_TOKEN`,
`SENTRY_ORG`, and `SENTRY_PROJECT` as workflow-level secrets.

---

## Server variables (Convex dashboard)

Set these in the Convex dashboard under **Settings → Environment variables**
for each deployment. They are never stored in the repo.

| Variable | Purpose | Where read | Notes |
|---|---|---|---|
| `OPENAI_API_KEY` | OpenAI API key for AI coach actions | `convex/chatActions.ts`, `convex/aiTools.ts` | — |
| `OPENAI_AHA_MODEL` | Primary OpenAI model name for the AI coach | `convex/openaiConfig.ts` | Falls back to `OPENAI_AHA_FALLBACK_MODEL` |
| `OPENAI_AHA_FALLBACK_MODEL` | Fallback OpenAI model name | `convex/openaiConfig.ts` | — |
| `OPENAI_VISION_MODEL` | OpenAI model used for food-image recognition | `convex/openaiConfig.ts` | — |
| `REVENUECAT_API_KEY` | RevenueCat server-side API key (webhook verification and REST API) | `convex/subscriptions.ts` | — |
| `REVENUECAT_WEBHOOK_AUTH_TOKEN` | Current RevenueCat webhook auth token | `convex/http.ts` | See `docs/revenuecat-webhook-rotation.md` for rotation procedure |
| `REVENUECAT_WEBHOOK_AUTH_TOKEN_PREVIOUS` | Previous token kept alive during rotation | `convex/http.ts` | See `docs/revenuecat-webhook-rotation.md`; clear after rotation completes |
| `EMAIL_SERVICE_API_KEY` | API key for the transactional email service | `convex/email.ts` | — |
| `UNSUBSCRIBE_TOKEN_SECRET` | Secret used to sign one-click unsubscribe tokens | `convex/subscriptionCrons.ts` | Required; see plan 015 for semantics |
| `POSTHOG_API_KEY` | PostHog project API key (server-side analytics) | `convex/analytics.ts` | — |
| `POSTHOG_HOST` | PostHog ingest host | `convex/analytics.ts` | Defaults to `https://app.posthog.com` if unset |
| `POSTHOG_PERSONAL_API_KEY` | PostHog personal API key (server management calls) | `convex/posthogServer.ts` | — |
| `POSTHOG_PROJECT_ID` | PostHog project ID | `convex/posthogServer.ts` | — |
| `DEV_BYPASS_SUBSCRIPTION` | Dev-only flag to bypass subscription checks | `convex/subscriptions.ts` | Dev deployments only; semantics change once plan 016 lands — check that plan before enabling |
| `CONVEX_SITE_URL` | Built-in Convex variable for the deployment's HTTP endpoint | `convex/auth.config.ts`, `convex/email.ts` | Set automatically by Convex; do not override in production |
