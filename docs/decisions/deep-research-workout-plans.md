# Decision: Deep research for evidence-grounded workout plans — spike findings

**Status**: Spike complete — recommendation recorded, no implementation
**Date**: 2026-07-12
**Issue**: #103

## Summary recommendation: go-with-fallback

**Do not integrate a managed deep-research agent (OpenAI `o3-deep-research` /
`o4-mini-deep-research`, Perplexity `sonar-deep-research`) as the plan-generation
path.** The capability is real, GA, and architecturally workable on Convex, but
per-run cost (~$0.40–$2+ per plan, ~20–100× a normal chat turn), multi-minute
latency, and a hard product gap (we have **no push-notification infrastructure**
— `lib/notifications.ts` is local-only, so a run that finishes while the app is
closed cannot tell the user) make it a poor fit for the core flow today.

**Instead, go with the fallback as the primary path**: a curated retrieval
corpus of exercise-science reviews/meta-analyses (PubMed / Semantic Scholar /
OpenAlex — all free), stored in Convex with a vector index and exposed to the
existing chat model as a `search_evidence` tool. Sub-second latency, near-zero
marginal cost, and full editorial control over citation quality. A per-message
"deep research" escalation (o4-mini-deep-research in background mode, Pro-only,
quota-limited) can be layered on later as a differentiator once push
notifications exist; the architecture sketch below covers it so that follow-up
doesn't re-open the investigation.

---

## 1. Feasibility

### OpenAI (verified against platform docs, 2026-07-12)

Deep research is GA on the **Responses API** via two dedicated models:

- **`o3-deep-research`** — higher-quality synthesis. $10 / $40 per M input/output
  tokens (batch: $5 / $20). 200k context.
- **`o4-mini-deep-research`** — faster, cheaper. $2 / $8 per M tokens
  (batch: $1 / $4).

Mechanics and constraints (from the [deep research guide](https://developers.openai.com/api/docs/guides/deep-research)):

- Requests take **tens of minutes**; OpenAI recommends `background: true`
  (async — poll the response ID, or receive a **webhook** on completion).
  Background mode retains response data ~10 minutes for polling and is
  incompatible with Zero Data Retention.
- At least one data source tool is **required**: `web_search_preview`, file
  search (max two vector stores), or a remote MCP server with a search/fetch
  interface. Code interpreter is optional. **Function calling is NOT supported**
  — a deep-research call cannot emit our `create_workout_plan` tool call; its
  output is a cited report that must feed a second, normal model call.
- No automatic clarification/rewrite step like ChatGPT's product surface — the
  docs recommend a cheap pre-processing pass with a fast model first.

### Non-OpenAI options

- **Anthropic web search + tool use** — a building block, not a managed agent:
  $10 / 1k searches plus tokens ([pricing](https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool)).
  We would orchestrate the multi-step research loop ourselves. More control,
  more code, same latency class if we want depth. Also a second AI vendor for
  one feature — real operational cost for a solo-maintained app.
- **Perplexity `sonar-deep-research`** — managed research runs, priced $2 / $8
  per M tokens **plus** $3/M reasoning tokens, $2/M citation tokens, and
  $5 / 1k searches ([pricing](https://docs.perplexity.ai/docs/getting-started/pricing)).
  Third-party analyses put a typical full run at **~$0.41+**. Cheapest managed
  option, but general web search — no control over whether it cites a
  meta-analysis or a supplement-company blog.
- **Direct academic APIs** — all free:
  - **PubMed E-utilities**: 3 req/s without a key, 10 req/s with a free key.
  - **Semantic Scholar**: ~100 req / 5 min unauthenticated; higher with a free
    key (request form). Has TL;DRs, citation counts, open-access PDF links.
  - **OpenAlex**: no key, ~100k calls/day guideline, "polite pool" via an
    email param. 250M+ works.

### Is real academic corpus access needed?

For exercise science specifically: **no — but curation is.** The load-bearing
literature for our use case is a small, stable set of reviews and
meta-analyses (periodization models, hypertrophy volume dose-response,
concurrent-training interference, protein intake, RPE/RIR autoregulation).
This corpus changes on the order of months, not minutes — which is exactly the
case where a **hand-rolled retrieval pipeline beats a live research agent**:
we fetch abstracts/metadata from PubMed/Semantic Scholar once, curate what's
allowed to be cited, embed it, and retrieve at chat time. A general web-search
agent re-derives (and re-bills) that corpus on every run and can surface
low-quality sources we then get judged on. Live deep research only earns its
cost for genuinely novel questions ("periodize for a half marathon while
keeping my squat") — the escalation tier, not the default.

## 2. Cost & latency

| Option | Documented price | Modeled cost / plan run | Latency |
|---|---|---|---|
| `o3-deep-research` | $10 / $40 per MTok + $10/1k searches | ~$2–$10 | tens of minutes |
| `o4-mini-deep-research` | $2 / $8 per MTok + $10/1k searches | **~$1.10 measured** (real run: 60.5k in / 22.9k out = $0.30, 77 searches = $0.77) | minutes to tens of minutes |
| Perplexity `sonar-deep-research` | $2/$8 MTok + $3/M reasoning + $2/M citations + $5/1k searches | ~$0.41+ | minutes |
| Anthropic web search loop | $10/1k searches + tokens | ~$0.30–$1 for ~10–20 searches + synthesis | depends on our loop depth |
| Curated retrieval (fallback) | Academic APIs free; embeddings pennies; retrieval adds ~1–3k tokens to the existing chat call | **~$0.01–0.05 incremental** | sub-second |

The measured `o4-mini-deep-research` data point (Simon Willison's logged run) is
instructive: **search-call fees dominated token cost** ($0.77 of $1.10). Costs
scale with how curious the agent gets, so per-run cost is high-variance.

**RevenueCat interaction.** AI chat is already Pro-gated server-side —
`convex/chatActions.ts` checks `internal.subscriptions.checkSubscription`
(`convex/subscriptions.ts:460`) and throws for non-Pro. At ~$1/run, a Pro user
who iterates on plans could burn $10–20/month of COGS against a single
subscription — live deep research **must** be Pro-only **and** quota-limited
(e.g. N runs/month tracked in a Convex table, decremented server-side; never
client-enforced via `stores/subscription-store.ts`, which is display state).
The retrieval fallback needs no new gating — it rides inside the existing
Pro-gated chat call at negligible marginal cost.

## 3. Architecture

Convex actions have a **10-minute execution ceiling**, and our chat is a single
streaming call inside one action invocation (`convex/chatActions.ts:782`,
`sendMessage`). A run that takes "tens of minutes" cannot live there. Two shapes:

### Live deep research (the escalation tier, if/when built)

OpenAI's background mode does the long-running part on their side, so Convex
never holds a connection open:

1. **Kick-off** — user triggers research from chat. A Convex action creates the
   Responses API call with `background: true` (returns immediately with a
   response ID), inserts a `researchRuns` row
   (`userId`, `conversationClientId`, `responseId`, `query`, `status:
   "running"`, `startedAt`, quota bookkeeping), and inserts a placeholder
   assistant message (`status: "streaming"` already exists on `chatMessages`;
   add a `"researching"` status or reuse it) so the chat UI shows an in-progress
   card via the existing Convex subscription — no polling in the client.
2. **Progress** — a scheduled internal action (`ctx.scheduler.runAfter`, ~every
   60s) polls the response ID and patches the row; or a Convex `httpAction`
   receives OpenAI's completion webhook and skips polling entirely. Either
   fits comfortably in per-invocation limits.
3. **Completion** — the poller writes the cited report onto the `researchRuns`
   row, updates the assistant message with a summary + citations, and hands off
   to plan generation (below).
4. **Notification gap** — `lib/notifications.ts` schedules **local**
   notifications only; there is no push-token registration or server-side push
   anywhere in the repo. A run finishing while the app is closed cannot notify
   the user. Options: (a) schedule a local "your research should be ready —
   check back" notification at kick-off with an estimated delay (works today,
   imprecise), or (b) add Expo push infrastructure (token registration +
   server-side send from a Convex action) — a prerequisite work item for any
   real launch of this tier, and useful beyond it.
5. **Flow into `create_workout_plan`** — since deep-research models can't call
   functions, plan generation is a **second, normal chat call**: inject the
   research report as an additional system-prompt section (same pattern as
   `buildHealthSection` in `convex/chatActions.ts`) and let the existing tool
   loop propose the plan. Citations travel as structured data on the
   `researchRuns` row, referenced from the plan's `pendingApproval` payload so
   `components/chat/plan-preview.tsx` / `components/chat/approval-card.tsx` can
   render a "Sources" section. Persisting evidence on the saved plan itself
   (executed in `convex/aiTools.ts` `executeApproval`) is a schema addition to
   `workoutPlans` — keep it a follow-up.

### Curated retrieval (the recommended primary path)

1. **Corpus** — `evidenceDocs` table in `convex/schema.ts`: title, authors,
   year, journal, PubMed/DOI URL, abstract or curated summary, topic tags, and
   an embedding via a Convex **vector index** (native; vector search runs in
   actions, which is where chat already lives). Seed with ~50–200 curated
   reviews/meta-analyses fetched via PubMed E-utilities / Semantic Scholar.
2. **Refresh** — a monthly Convex cron action re-queries the academic APIs for
   new reviews in the tagged topics and stages candidates for manual approval.
   Rate limits (10 req/s PubMed with key, etc.) are a non-issue at this volume.
3. **Chat integration** — add a `search_evidence` tool to `TOOLS` in
   `convex/chatActions.ts`. Note the current action is **single-turn**: tool
   calls become approval cards; results are never fed back to the model. A
   retrieval tool needs a small agentic loop (execute `search_evidence`
   server-side, append the tool result, continue the stream) — a modest,
   contained change to `sendMessage`, and the one real piece of engineering in
   the fallback.
4. **Citations** — retrieved docs carry stable, curated URLs; render them as a
   sources list on the plan preview and as markdown links in chat.

## 4. Product

- **Per-message toggle, not automatic.** Automatic research on every
  `create_workout_plan` would turn a seconds-long interaction into minutes and
  multiply COGS by ~50×. The retrieval tool can be automatic (it's cheap and
  fast); live deep research should be an explicit user action ("Research this
  plan") with expectation-setting UI. Precedent: every consumer product with
  deep research (ChatGPT, Perplexity) makes it an explicit mode.
- **Citation rendering.** Chat bubbles render markdown already; plan previews
  need a compact sources row (title + year + journal, linking out). Once we
  show citations we are judged on them — another argument for the curated
  corpus over open web search.
- **Medical/health-claim exposure.** Citing peer-reviewed literature is a
  stronger implicit claim than "here's a plan". Guardrails: keep framing as
  general fitness education, not diagnosis/treatment/rehab; keep (or add) a
  "consult a professional" disclaimer near evidence-backed plans; never let the
  coach cite literature to advise on injuries or medical conditions (the
  `aiSafetyIncidents` table in `convex/schema.ts` suggests safety filtering
  already exists — extend it). App Store: health/fitness apps get elevated
  scrutiny, and guideline 5.1.3 governs health-data use; unsubstantiated or
  therapeutic-sounding claims are the rejection risk, accurate citations are
  not. Keep marketing copy at "grounded in published research", not "clinically
  proven". Compliance notes live in `docs/compliance/` and
  `docs/apple-review-notes.md` — update both if this ships.

## Cheaper fallback (recommended)

Covered above as the primary path; stated compactly:

> A curated, periodically refreshed corpus of exercise-science reviews
> (PubMed/Semantic Scholar/OpenAlex, all free) embedded in a Convex vector
> index, exposed as a `search_evidence` tool inside the existing Pro-gated chat
> action. ~$0.01–0.05 incremental per plan, sub-second, fully controlled
> citation quality, no new vendors, no push-notification prerequisite.

Follow-up issues if this lands: (1) tool-result loop in `sendMessage`,
(2) `evidenceDocs` schema + seed script + cron refresh, (3) citation UI in
`components/chat/plan-preview.tsx`, (4) — later, separately — push
notifications + `researchRuns` background tier.

## Sources (accessed 2026-07-12)

- OpenAI deep research guide — models, background mode, webhooks, tool
  constraints: <https://developers.openai.com/api/docs/guides/deep-research>
- OpenAI pricing (deep-research and web-search rates):
  <https://developers.openai.com/api/docs/pricing> and
  <https://developers.openai.com/api/docs/models/o3-deep-research>
- Measured `o4-mini-deep-research` run ($1.10, token/search breakdown):
  <https://til.simonwillison.net/llms/o4-mini-deep-research>
- Perplexity API pricing (`sonar-deep-research` fee structure):
  <https://docs.perplexity.ai/docs/getting-started/pricing>
- Anthropic web search tool pricing ($10 / 1k searches):
  <https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool>
- PubMed E-utilities rate limits (3 → 10 req/s with key):
  <https://www.ncbi.nlm.nih.gov/books/NBK25497/>
- OpenAlex API rate limits / polite pool:
  <https://docs.openalex.org/how-to-use-the-api/rate-limits-and-authentication>
- Convex scheduled functions (action limits, scheduling):
  <https://docs.convex.dev/scheduling/scheduled-functions>
- Apple App Store Review Guidelines (health & fitness, 5.1.3):
  <https://developer.apple.com/app-store/review/guidelines/>
