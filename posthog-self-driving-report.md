# PostHog Self-driving setup report — Fitbull

> Generated 2026-07-12. Findings will start appearing in your [Self-driving inbox](https://eu.posthog.com/project/222187/inbox) within ~30 minutes of the first coordinator tick.

## Summary

PostHog Self-driving has been fully configured for Fitbull. Session Replay, Error Tracking, and Support signal sources are armed; the GitHub App is connected and the GitHub Issues warehouse source is syncing. A lean scout troop of 5 scouts (3 canonical + 2 custom) is active and will begin filing findings to the inbox within ~30 minutes.

---

## AI data processing

**Approved.** Organization-level AI data processing consent was granted before this run — required for the session replay analysis source.

---

## GitHub

**Connected during this run.**

- Integration id: `70483`
- Account: `Sebastian-Sole`
- No errors on the integration.

---

## Products enabled

| Product | Status | Notes |
|---|---|---|
| Session Replay | **Enabled (inert — mobile)** | Server flip applied. Fitbull is a pure mobile app (Expo/React Native) — the server flag is on, but mobile SDK must be configured in code to capture sessions. See follow-ups. |
| Error Tracking | **Enabled (inert — mobile)** | Same as above — `products-enable` API was unavailable on this deploy; the signal sources are wired and will pick up data once exception capture is configured in the mobile SDK. |
| Support (Conversations) | **Enabled (inert — no channel)** | `products-enable` API was unavailable; signal source is wired. Tickets only arrive once an inbound channel (email / inbox / Slack) is connected in PostHog. See follow-ups. |

> **Note:** For a web app, the `posthog.init(...)` call would be checked for `disable_session_recording` or `capture_exceptions` overrides. This project is mobile-only — that check is not applicable; SDK configuration controls capture instead.

---

## Signal sources

| source\_product | source\_type | Action | Config ID |
|---|---|---|---|
| `signals_scout` | `cross_source_issue` | **ON by default** — no row needed; scout findings reach the inbox automatically | — |
| `error_tracking` | `issue_created` | **Enabled** (created) | `019f5782-6eae-7745-af2e-fd411cee774c` |
| `error_tracking` | `issue_reopened` | **Enabled** (created) | `019f5782-73da-7e9c-bc42-199865ccb2e6` |
| `error_tracking` | `issue_spiking` | **Enabled** (created) | `019f5782-7743-7852-bac5-c72b65bd15e5` |
| `session_replay` | `session_analysis_cluster` | **Enabled** (created, sample\_rate: 0.1) | `019f5782-78fa-7fd7-b73e-efbf342d71ac` |
| `conversations` | `ticket` | **Enabled** (created) | `019f5782-7ba8-7016-85d9-f6a0c847b6d4` |
| `llm_analytics` | — | **Skipped** — internal-only, not a user-facing responder |  |
| `logs` | — | **Skipped** — not a v1 responder |  |

---

## Connected tools

| Tool | Status | Notes |
|---|---|---|
| GitHub Issues | **Connected by this setup** | Warehouse source id `019f5790-24a6-0000-59d0-b4c7876074f1`; responder id `019f5790-3fb0-706f-801d-628cedcae3f2`. Only the `issues` table is syncing — enable more tables (PRs, comments) in the [data warehouse UI](https://eu.posthog.com/project/222187/pipeline/new/source). First sync started automatically. |
| Linear | **Not used** (not picked) |  |
| Zendesk | **Not used** (not picked) |  |
| pganalyze | **Not used** (not picked) |  |

---

## Scout troop

**5 active** out of 28 total.

### Enabled

| Scout | Reason |
|---|---|
| `signals-scout-general` | Always on — cross-product correlations and surfaces no specialist covers |
| `signals-scout-product-analytics` | Heavy funnel volume: auth, onboarding, workout\_logged, meal\_logged daily; multiple saved insights |
| `signals-scout-revenue-analytics` | RevenueCat subscription funnel (paywall\_presented → trial\_started → paid\_converted) is core to the business model |
| `signals-scout-activation-cliff` *(custom)* | Post-signup activation gap — see Custom scouts section |
| `signals-scout-barcode-scan-health` *(custom)* | Barcode food lookup health — see Custom scouts section |

### Disabled

| Scout | Reason |
|---|---|
| `signals-scout-error-tracking` | **Covered by native source** — error tracking runs as a signal source (issue\_created / issue\_reopened / issue\_spiking); a scout on the same surface would duplicate it |
| `signals-scout-session-replay` | **Covered by native source** — session\_analysis\_cluster source is wired; same reasoning |
| `signals-scout-ai-observability` | AI coach uses OpenAI via Convex actions — no `$ai_*` LLM trace events captured; enable if you add LLM observability instrumentation |
| `signals-scout-anomaly-detection` | Cross-product — `general` scout covers anomalies; keeping troop small |
| `signals-scout-apm` | No APM / OpenTelemetry spans in this project |
| `signals-scout-csp-violations` | Mobile app — no Content Security Policy reporting |
| `signals-scout-customer-analytics` | B2C mobile app — no group/accounts analytics |
| `signals-scout-data-pipelines` | No CDP destinations or hog flows |
| `signals-scout-data-warehouse` | Only the GitHub Issues source is connected; no large warehouse imports to monitor |
| `signals-scout-experiments` | No active A/B experiments detected |
| `signals-scout-feature-flags` | No feature flags detected as active |
| `signals-scout-health-checks` | Cross-product; keeping troop small |
| `signals-scout-inbox-validation` | Fresh setup — no resolved reports to validate yet; enable after a few weeks of active use |
| `signals-scout-ingestion-warnings` | Not a top surface for this project right now |
| `signals-scout-insight-alerts` | No configured alerts to watch yet |
| `signals-scout-logs` | PostHog logs product not in use |
| `signals-scout-mcp-tool-calls` | No MCP tool call telemetry in this project |
| `signals-scout-observability-gaps` | `general` scout covers this surface |
| `signals-scout-replay-vision` | No Replay Vision scanners configured |
| `signals-scout-skills-store` | Internal PostHog skill hygiene — not applicable |
| `signals-scout-surveys` | No surveys in use (0 surveys found) |
| `signals-scout-web-analytics` | Mobile app — no web traffic / pageview surface |
| `signals-scout-web-vitals` | Mobile app — no Core Web Vitals |

---

## Custom scouts

### `signals-scout-activation-cliff`

**What it watches:** Whether newly signed-up users actually log a workout or meal within their first 7 days of joining.

**Why no built-in scout covers it:** The saved onboarding funnel ends at `trial_started`, not `workout_logged`/`meal_logged`. The `product-analytics` scout watches saved flows for regression — it can catch funnel drop-off within the defined funnel, but post-signup product activation (the step from "signed up" to "used the core product") is outside any saved flow.

**Discriminator:** 7-day activation rate this week falls >10 percentage points below the 4-week rolling average.

**Explore patterns:** activation funnel (auth\_succeeded → workout\_logged / meal\_logged), signup volume sanity check, workout vs. meal split, cohort retention day 0–7.

**Disqualifiers:** sample < 10 new users; intake volume drop (rate vs. count); known seasonal period; already reported.

---

### `signals-scout-barcode-scan-health`

**What it watches:** The food database hit rate behind `barcode_scanned` events — whether the third-party food API is silently returning "not found" more than normal, which quietly breaks the meal logging flow.

**Why no built-in scout covers it:** This is a Fitbull-specific product surface (the `barcode_scanned` event with a `found` property). No canonical scout watches custom event property ratios for a specific in-app flow.

**Discriminator:** `found: false` share rises above 35% OR increases more than 10 percentage points vs. the prior 3-week average.

**Explore patterns:** 28-day hit/miss trend broken down by `found`, distinct user reach for failed scans, correlation with `meal_logged` drop, hourly recency check.

**Disqualifiers:** < 5 scans in 7 days; single-user/single-device pattern (bad barcode, not API); stable baseline ≤ 35% with no upward trend; already in inbox.

---

**Surfaces considered and ruled out:**

| Surface | Filter that killed it |
|---|---|
| AI coach engagement vs. retention | `general` scout covers cross-product correlations; not a dedicated uncovered surface |
| Subscription conversion (paywall → trial → paid) | Covered by `signals-scout-revenue-analytics` (goal-miss escalations) and the saved "Subscription conversion" insight watched by `product-analytics` |
| Error bursts | Covered by the native `error_tracking` signal source |

**Noise escape hatch:** If a custom scout turns out noisy, set `emit: false` on its config in PostHog to switch it to dry-run (it still runs and logs, but writes nothing to the inbox).

---

## Follow-ups

- [ ] **Configure mobile session replay in the SDK** — the server flag is on, but Expo/React Native requires explicit SDK configuration to capture sessions. Check the PostHog React Native SDK docs for `enableSessionReplay`.
- [ ] **Configure exception capture in the mobile SDK** — add `captureExceptions: true` (or equivalent) to the PostHog SDK init in `providers/posthog-provider.tsx` so crash/exception data reaches the Error Tracking product.
- [ ] **Enable products from project settings** — the `products-enable` API was unavailable on this deploy. Navigate to [project settings](https://eu.posthog.com/project/222187/settings) to manually turn on Session Replay, Error Tracking, and Conversations if they appear toggled off.
- [ ] **Connect a Support inbound channel** — Conversations is wired as a signal source but stays idle until an email, inbox, or Slack channel is connected in PostHog. Go to [integrations settings](https://eu.posthog.com/project/222187/settings/environment-integrations) to add one.
- [ ] **Enable more GitHub warehouse tables** — only the `issues` table is syncing. To also sync pull requests, comments, or other tables, go to the [data warehouse source](https://eu.posthog.com/project/222187/pipeline/new/source) and add them.
- [ ] **Enable `signals-scout-ai-observability`** — if you instrument OpenAI calls with PostHog's LLM analytics SDK (emitting `$ai_*` events), enable this scout in PostHog to start watching AI cost, latency, and error regressions.
- [ ] **Enable `signals-scout-inbox-validation`** — after a few weeks of active use and resolved reports, switch this on so the scout can verify that fixes actually held.
- [ ] **Enable `signals-scout-feature-flags`** — if you start using PostHog feature flags for rollouts or experiments, enable this scout.

---

## What happens next

The scout coordinator picks up the new configs within ~30 minutes and runs each enabled scout on its first tick. From there, scouts run daily (every 1440 minutes). Findings that cross the report bar appear as items in your [Self-driving inbox](https://eu.posthog.com/project/222187/inbox) — immediately-actionable ones can be turned into coding tasks from there.
