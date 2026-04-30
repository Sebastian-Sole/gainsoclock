# White Hat — AI "Aha Moment" for Onboarding

**Perspective:** White Hat (facts only, no opinions, no recommendations).
**Topic:** What is technically possible for a personalized-plan / AI-coach message to render during onboarding, before the paywall.
**Scope of evidence:** Fitbull source code at HEAD (`harness/claude-code-setup`), official docs, and secondary sources. Confidence tags: 🟢 primary (code / official docs), 🟡 secondary (vendor blogs / benchmarks), 🔴 couldn't verify.

---

## 1. Model and configuration used today

🟢 `convex/chatActions.ts:586` and `:714` both call OpenAI with `model: "gpt-5.2"`. There are no other OpenAI `model:` strings in `convex/`. The API client is `new OpenAI({ apiKey: process.env.OPENAI_API_KEY })` in the same file at `:582`, instantiated inside a `"use node"` action. No other env-var-driven override exists.

🟢 Token budget per chat turn: `max_completion_tokens: 8000` (`chatActions.ts:590`). The secondary "title-generation" completion uses `max_completion_tokens: 20` (`:723`).

🟢 Streaming is enabled on the main call: `stream: true` (`:589`). Tool surface is the constant `TOOLS` in the same file — four functions (see §4).

🟡 GPT-5.2 benchmark metrics from pricepertoken.com: "64 tok/s" output speed, **0.81 s median time-to-first-token**, 400K context window, input **$1.75 / 1M tok**, output **$14.00 / 1M tok**, cached input **$0.175 / 1M tok**. GPT-5 (high) measured by Artificial Analysis at 81.8 tok/s and **69.85 s TTFT** for reasoning-heavy prompts, suggesting reasoning-mode TTFT can be an order of magnitude higher than non-reasoning. Chatbase article lists variants: `gpt-5.2-chat-latest` (Instant), `gpt-5.2` (Thinking), `gpt-5.2-pro`. The code uses the plain `"gpt-5.2"` id, which per that source is the "Thinking" variant.

🔴 No official OpenAI platform page numbers could be fetched (403 from `platform.openai.com/docs/...` via WebFetch). p50/p95 generation rates specifically for `gpt-5.2` (non-reasoning) are not published by OpenAI in a form we could retrieve.

🟢 Model is hardcoded — not read from env. Changing it requires a code edit + Convex deploy.

---

## 2. Does the current chat action stream?

🟢 The OpenAI call streams (`stream: true`). But **the Convex action itself does not stream to the client**. The code pattern in `chatActions.ts:602-641`:

1. Insert a placeholder assistant message with `status: "streaming"` via `internal.chat.insertMessage` (`:570`).
2. Iterate the OpenAI `AsyncIterable<ChatCompletionChunk>` server-side.
3. Throttle DB writes: every ~200 ms, call `internal.chat.updateMessageContent` with the accumulated `fullContent` (`:614-620`).
4. On stream end, finalize with `updateMessageContent` or `updateMessageWithToolCalls`.

🟢 The client reads via `useQuery(api.chat.listMessages, ...)` in `hooks/use-chat.ts:12` and renders in `app/chat/[id].tsx`. Updates propagate through the **Convex reactive query subscription (WebSocket)** — not SSE, not HTTP chunked, not polling.

🟢 Effective client-visible streaming cadence is bounded by the server throttle (`lastUpdateTime > 200` ms, `:614`), not by the OpenAI token rate. At 64 tok/s that's ~12–13 tokens per DB commit.

🟢 Code comment at `:612` says "~500ms" but the actual guard is 200 ms; the code is the source of truth.

---

## 3. Can a Convex action stream to a React Native client?

🟢 Action timeout: **10 minutes** (Convex docs, `/functions/actions`).

🟢 Documented streaming mechanisms for Convex + AI (`docs.convex.dev/agents/streaming`):

- **HTTP streaming from `httpAction`**: client sends request, server returns a streamed HTTP response (`Response` with a `ReadableStream`). Supported out of the box by the Agent component; CORS must be set manually.
- **Database delta streaming**: the Agent component's `saveStreamDeltas: true` chunks and debounces delta writes; clients subscribe via a regular `useQuery` (`syncStreams()`) and receive live-updating text. `throttleMs` is configurable.

🟢 Fitbull's current code is the "database delta" pattern implemented by hand (throttled `updateMessageContent` writes into `chatMessages`, consumed by `useQuery(api.chat.listMessages)`).

🟡 stack.convex.dev: `persistentTextStreaming` component exposes `persistentTextStreaming.stream()` inside an `httpAction` with a `chunkAppender` callback, plus a `useStream(streamId, endpoint)` hook. This is HTTP streaming plus a parallel DB-backed record for persistence.

🔴 Convex does not publish quantitative latency overhead numbers for delta streaming vs direct HTTP streaming. Not addressed in any doc surface we could fetch.

🟡 For RN-direct SSE, `react-native-sse` is the conventional library (not currently a Fitbull dependency — verified by absence from `package.json` search scope).

🟢 Options available without introducing a new dependency: the current DB-delta pattern. Options requiring a new component/library: `@convex-dev/persistent-text-streaming` (new component), `httpAction` with a hand-written streamed `Response` (no new dep, but new auth wiring; `@convex-dev/auth` sets HTTP routes via `auth.addHttpRoutes(http)` in `convex/http.ts:8`).

---

## 4. What tools exist in `aiTools.ts` today?

🟢 **Tool definitions (for the model)** live in `convex/chatActions.ts:43-334`, not `aiTools.ts` (naming quirk). Four tools:

1. `create_workout_template` — name, notes, exercises[] (type enum, set count, rest time, suggested reps/weight/time/distance).
2. `create_workout_plan` — name, description, goal, durationWeeks, startDate, days[] (week + dayOfWeek + templateName), templates[] (full exercises).
3. `update_workout_plan` — planClientId + updates (daysToUpdate[], newTemplates[]).
4. `suggest_recipe` — title, description, ingredients[], instructions[], macros, tags.

🟢 **Tool execution** lives in `convex/aiTools.ts` as the single `executeApproval` mutation (`:371`). It is **not called by the model** — the action accumulates the tool call, writes it as `pendingApproval` on the assistant message, and the client invokes `executeApproval` from `app/chat/[id].tsx:47` after the user presses Approve. The model's "tool call" never hits the DB until a user click.

🟢 Round-trip weight: tool calls return no execution result to the model — the action finishes on the first assistant turn. There is no multi-step tool loop. Approval → DB writes are pure Convex mutations (single-round, indexed inserts; no network egress).

🟢 During onboarding (no plan, no exercises, no history), `internal.chatInternal.getUserContext` would return: empty `exercises` / `templates` / `recentLogs` / `exerciseHistory`, `stats { totalWorkouts: 0, workoutsPerWeek: 0, currentStreak: 0 }`, `activePlan: null`, and whatever `userSettings` the user has (defaults: `kg` / `km` / `90s` rest if no row exists — see `chatInternal.ts:275`). The system prompt builder (`buildSystemPrompt`, `chatActions.ts:390-514`) handles empty strings gracefully ("No exercises yet.", "No templates yet.", etc.).

🟢 `create_workout_plan` produces the most "aha"-shaped artifact (plan card with weeks/days). It requires the model to emit `templates[]`, `days[]`, `name`, `durationWeeks` at minimum. Token cost scales with plan size.

---

## 5. Plan generation path — is there a server-side "generate plan from profile" entry point?

🟢 **No.** Plan creation is exclusively chat-mediated. The only server ingress for `workoutPlans` rows is:

- `api.aiTools.executeApproval` with `type: "create_plan"` (user-approved AI output).
- `internal.plans.createPlan` (internal-only; no public mutation wrapper).
- `internal.plans.createPlanDays` (internal-only).

🟢 The public mutations in `convex/plans.ts` all update, patch, or delete — none create a full plan from a profile. `convex/plans.ts` exports no `action`s.

🟢 To generate a plan during onboarding, the options visible in-code are: (a) call `api.chatActions.sendMessage` with a synthesized user message carrying the intake data (requires active Pro subscription — see §7), or (b) add a new action that does the OpenAI call + `ctx.runMutation(internal.plans.createPlan, ...)` + `internal.plans.createPlanDays`, bypassing the chat table. No such code exists today.

🟢 `workoutPlans.sourceConversationClientId` is optional in the schema (`schema.ts:181`), so a plan *not* tied to a chat conversation is already representable.

---

## 6. Cold-start / first-token latency numbers

🟡 GPT-5.2 non-reasoning median TTFT: **0.81 s** (pricepertoken.com).
🟡 GPT-5 (high) reasoning TTFT: **~70 s** (Artificial Analysis). Reasoning-mode TTFT is not the same regime.
🟢 Convex action cold-start: not quantified in docs we could fetch. The 10-minute cap is the only documented timing.
🟢 Additional server-side latency added by the current code path, independent of OpenAI:
  - `getUserContext` query (multiple table scans; see `chatInternal.ts` — `.collect()` on `workoutLogs`, `workoutLogExercises`, `workoutSets`, `exercises`, `templates`, `templateExercises`, `plans`, `planDays`). For an onboarding user with zero data, these are empty-table reads and close to 0 ms.
  - `getHistory` query — also `.collect()` on `chatMessages`; empty at conversation start.
  - Subscription check: `internal.subscriptions.checkSubscription` (`chatActions.ts:529`).
  - Convex WebSocket round-trip for each throttled DB commit (200 ms cadence).

🔴 End-to-end p50/p95 for the existing `sendMessage` action has not been measured in any committed doc, test, or log.

---

## 7. Error surface

🟢 **Subscription gate (hard block).** `chatActions.ts:528-536` runs `internal.subscriptions.checkSubscription`; if not Pro, it throws `"Subscription required: Your current plan doesn't include AI Coach..."`. `hooks/use-chat.ts:33-38` catches this and shows an `Alert.alert("Pro Required", ...)`. For a pre-paywall onboarding "aha" moment, this gate would block the current `sendMessage` action unconditionally for non-subscribers.

🟢 **OpenAI errors caught once.** The `try/catch` in `chatActions.ts:584-744` wraps the entire stream + processing. Any thrown error (rate limit, timeout, moderation, network) sets the placeholder message to `status: "error"` with a generic `"Sorry, I encountered an error processing your request. Please try again."` (`:740-743`). No retry logic, no exponential backoff, no distinction between 429 / 500 / moderation. Title-generation errors (`:732`) are silently swallowed.

🟡 OpenAI guidance on 429s (help.openai.com + cookbook): exponential backoff with jitter. Rate limits apply per org per minute on tokens and requests; moderation endpoint has separate limits. Unsuccessful requests still count toward the per-minute limit.

🟢 No moderation/safety filtering of AI output is applied before it renders in `ChatBubble`. There's no `moderations.create` call anywhere under `convex/`.

🟢 Offline: `OfflineBanner` is shown in `app/chat/[id].tsx:80` and `chat-input.tsx` is disabled via `isOffline` (`:158`). `sendMessage` is a Convex action — it can't run offline.

---

## 8. Cost per onboarding "aha" generation

Token counts (estimated from code; not measured):

🟢 System prompt (`buildSystemPrompt`) for an **onboarding user with zero data** is roughly 1–1.5K tokens: the hardcoded rules (~900 tokens by character count of the string literal) + small user-profile block. With intake data injected as user message (goal, age, sex, weight, height, days/week, equipment, experience): add ~200–400 tokens.

🟢 Assistant output with a full `create_workout_plan` tool call: plan JSON with e.g. 4 weeks × 4 training days × 6 exercises plus templates array is **roughly 2–4K output tokens** (observed from tool schema fields × plausible content).

🟡 Cost at GPT-5.2 rates ($1.75 in, $14 out per 1M):
- Input ≈ 1.5K → ~$0.0026
- Output ≈ 3K → ~$0.042
- **Total per generation: ~$0.045**, i.e. ~$45 per 1000 onboarding generations.

🔴 No gpt-5.2-mini/nano variant is documented in fetched sources; the chatbase article names Instant/Thinking/Pro. If a cheaper variant exists, pricing was not found in the sources fetched.

🟢 Second call (title generation) uses the same model at 20 output tokens — negligible (<$0.001).

---

## 9. Can OpenAI be called from the RN client directly?

🟢 **Project rule (hard):** `.claude/skills/prism-methodology/references/personas/ai-coach-safety.md` explicitly states "OpenAI calls live in `convex/chatActions.ts` and `convex/aiTools.ts` — server-side Convex actions, never from the app directly. The OpenAI API key is never shipped in the bundle." The persona flags `EXPO_PUBLIC_OPENAI_*` as a finding.

🟢 **Code reality:** `openai` is imported only in `convex/chatActions.ts:5`. Grep across the repo finds no other occurrences. `process.env.OPENAI_API_KEY` is referenced only in that file.

🟡 Industry guidance (OpenAI help center, multiple community threads): direct client calls expose the key; Expo `EXPO_PUBLIC_*` vars are bundled into the JS bundle and decompilable. Recommended pattern is a backend proxy.

🟢 Scoped/short-lived keys (e.g., ephemeral tokens) are supported by OpenAI Realtime API; general Chat Completions / Responses API does not have an official ephemeral-key mechanism in the sources we fetched. 🔴 Could not verify authoritatively.

---

## 10. Rendering streaming text smoothly in RN

🟢 **Current Fitbull pattern:** `components/chat/chat-bubble.tsx` renders plain `<Text>` (via `components/ui/text`) inside a `View`. Markdown is line-split and mapped each render (`:42-114`, wrapped in `useMemo`). The parent `FlatList` in `app/chat/[id].tsx:93` re-renders when `messages` changes, which happens on each throttled DB commit (~every 200 ms server-side). `StreamingDots` uses Reanimated `useSharedValue` + `withRepeat` for the three-dot pulser (`chat-bubble.tsx:116-152`).

🟢 React Compiler is enabled (per `CLAUDE.md`). Reanimated is listed in the stack; Skia is not a dependency.

🟡 Known RN patterns for smoothing streaming text:
- Throttle source writes (already done at 200 ms on the server).
- Avoid re-creating parsed structures per chunk — `useMemo` on the parse is already done at `chat-bubble.tsx:157`.
- Keep streaming values on Reanimated shared values rather than React state (docs.swmansion.com/react-native-reanimated/docs/guides/performance). Not used for text content today.
- `@llm-ui/react` with `throttleBasic({ targetBufferChars: 60 })` buffers tokens for a "typing effect" (sitepoint.com / logrocket.com). Not a Fitbull dependency.
- React Native docs: FlatList optimizations (keyExtractor, getItemLayout, windowSize). `keyExtractor` is used (`[id].tsx:97`); `getItemLayout` is not.

🟢 Auto-scroll is implemented with `flatListRef.current?.scrollToEnd({ animated: true })` inside a 100 ms `setTimeout`, retriggered on each content-change (`[id].tsx:70-76`).

---

## 11. Existing documentation on AI wiring

🟢 **Primary:**
- `.claude/skills/prism-methodology/references/personas/ai-coach-safety.md` — spells out the OpenAI-via-Convex boundary rule, prompt-injection posture, cost concerns, tool-call integrity via `pendingApprovalValidator`.
- `.claude/skills/prism-methodology/references/personas/convex-realtime.md` — mutation vs action boundary; OpenAI SDK inside a mutation is "a finding"; `.collect()` on full history is flagged.
- `CLAUDE.md` — AI stack row ("`openai` SDK, tool calling via Convex actions (`convex/aiTools.ts`, `chatActions.ts`)").
- `convex/README.md` — exists (one-line reference only, not inspected here).

🟢 **No dedicated AI architecture doc in `docs/`.** `docs/` contains `revenuecat-purchases-module-fix.md` and the prism session folder. No `docs/ai-*.md`, no `docs/chat-architecture.md`.

🟢 `.claude/agents/review-security.md` and `review-code.md` reference `chatActions` / `aiTools`, but only in general-review context — no design decisions documented.

---

## 12. Additional facts bearing on the topic

🟢 **Chat UI primitives reusable in onboarding** (`components/chat/`): `chat-bubble.tsx` (markdown + streaming dots), `chat-input.tsx`, `approval-card.tsx`, `plan-preview.tsx`, `plan-calendar.tsx`, `plan-day-cell.tsx`, `plan-day-detail.tsx`, `recipe-preview.tsx`, `template-preview.tsx`, `update-plan-preview.tsx`.

🟢 **Placeholder assistant message is written before the OpenAI call returns** (`chatActions.ts:570-579`). The client sees an empty bubble with `status: "streaming"` within one Convex WebSocket RTT of calling `sendMessage`, independent of TTFT.

🟢 **Convex `getAuthUserId(ctx)` is called at the top of every query/mutation/action touching user data** — `chatActions.ts:524`, `chat.ts:15/40/67/98/217/246`, `plans.ts:10/33/63/183/225/250/281/324/428/463/518`, `aiTools.ts:378`. Onboarding must have an authenticated userId before any of these can be invoked.

🟢 **Sign-up is required** (per `brief.md` constraints). `@convex-dev/auth` is installed. Whether it supports anonymous sessions is explicitly listed as an open question (`orient.md` row #1) and was not verified by this investigation.

🟢 **Typing** in `chatActions.ts` flags the tool-call args as `JSON.parse(firstToolCall.arguments)` (`:664`) without a runtime validator at the action boundary — validation happens later inside `aiTools.executeApproval` when the user approves. A plan rendered during onboarding would therefore be in-memory JSON until user approval writes it to `workoutPlans` + `planDays`.

🟢 **Model string is duplicated** in `chatActions.ts:586` and `:714`. Any A/B of model choice for onboarding would need to touch both sites or be refactored behind a constant.

🟢 **`subscriptions.checkSubscription`** gates `sendMessage` before any OpenAI call. Any onboarding usage of `sendMessage` would be blocked for non-subscribers; a parallel action without the gate would be needed for pre-paywall use.

---

## Sources

- Code (🟢): `convex/chatActions.ts`, `convex/aiTools.ts`, `convex/chat.ts`, `convex/chatInternal.ts`, `convex/plans.ts`, `convex/schema.ts`, `convex/http.ts`, `hooks/use-chat.ts`, `app/chat/[id].tsx`, `components/chat/chat-bubble.tsx`, `.claude/skills/prism-methodology/references/personas/ai-coach-safety.md`, `.claude/skills/prism-methodology/references/personas/convex-realtime.md`, `CLAUDE.md`.
- Convex docs (🟢/🟡): `https://docs.convex.dev/functions/actions`, `https://docs.convex.dev/agents/streaming`, `https://stack.convex.dev/build-streaming-chat-app-with-persistent-text-streaming-component`, `https://docs.convex.dev/client/react-native`.
- OpenAI model data (🟡): `https://pricepertoken.com/pricing-page/model/openai-gpt-5.2`, `https://artificialanalysis.ai/models/gpt-5`, `https://www.chatbase.co/blog/gpt-5-2`, `https://platform.openai.com/docs/models/gpt-5.2` (not fetchable; referenced indirectly via search summaries).
- OpenAI error / security guidance (🟡): `https://help.openai.com/en/articles/5955604-how-can-i-solve-429-too-many-requests-errors`, `https://cookbook.openai.com/examples/how_to_handle_rate_limits`, `https://help.openai.com/en/articles/5112595-best-practices-for-api-key-safety`, `https://community.openai.com/t/is-it-possible-to-secure-openai-api-key-in-reactjs-without-backend/1353010`.
- RN streaming patterns (🟡): `https://docs.swmansion.com/react-native-reanimated/docs/guides/performance/`, `https://blog.logrocket.com/react-llm-ui/`, `https://www.sitepoint.com/streaming-backends-react-controlling-re-render-chaos/`, `https://reactnative.dev/docs/optimizing-flatlist-configuration`.
- Not retrievable (🔴): `https://platform.openai.com/docs/guides/streaming` (403), authoritative OpenAI p50/p95 tokens-per-second for gpt-5.2 non-reasoning, Convex quantitative latency overhead for delta streaming, whether `@convex-dev/auth` supports anonymous sessions.
