# Chat generation vs. app lifecycle (issue #129)

Conclusion of the investigation into what happens to an in-flight AI chat
generation when the app is backgrounded, the phone is locked, or the app is
fully terminated — and what the code guarantees in each case.

## How generation actually runs

`api.chatActions.sendMessage` (and `retryGeneration`) are **Convex actions**
running in Convex's server-side Node runtime. The client's only role is to
deliver the action call over the WebSocket. From that point on:

1. The user message and a placeholder assistant message (`status:
   "streaming"`) are inserted into the `chatMessages` table **by the server**.
2. The OpenAI stream is consumed **by the server**. Streamed text is persisted
   incrementally (a mutation every ~200 ms), progress labels and a liveness
   heartbeat every few seconds (`progress` / `progressUpdatedAt`, issue #127).
3. The terminal state (`complete` with tool calls / approval card,
   `incomplete`, or `error`) is written by the server when the stream ends.

Nothing in the generation loop reads from or waits on the client. A Convex
action, once started, runs to completion on the server regardless of whether
the calling client is still connected. All partial and final results live in
the database, not in client memory.

## Case by case

### Backgrounded / phone locked

**Supported.** The generation continues server-side. The OS may freeze the
app's JS and drop the WebSocket; on re-foreground the Convex client
reconnects automatically and `useQuery(api.chat.listMessages)` re-syncs, so
the completed message (and any approval card) simply appears. No app code is
required for the reconnect — `convex/react` handles it.

### App reopened later (process still alive or restarted)

**Supported.** Same mechanism: `listMessages` is a reactive query over
persisted rows, so whatever finished while the user was away hydrates on the
next subscription. No messages are lost because none of them ever existed
only client-side.

### Full app termination

**Supported, with one boundary.** The generation itself is unaffected by the
client process dying — it was never client-driven. On next launch the
conversation shows the finished result. The boundary is *when* termination
happens:

- **After the action call reached Convex** (the normal case — the call is
  awaited as soon as the user hits send): generation completes server-side.
- **Before the call reached the server** (app killed in the same instant the
  send was dispatched, or while offline): nothing was started, so nothing can
  complete. The user message won't appear in the conversation on relaunch,
  which is the honest signal that the send never happened. Chat sends are
  deliberately not queued through the offline `convex-sync` queue — replaying
  an AI request minutes or hours later would answer into a stale context.

### The failure mode that *does* exist: the server action dying

If the **action** (not the app) dies mid-generation — a hard crash, a deploy,
or the Node action runtime limit (~10 minutes, far above a normal plan
generation) — its message would stay `status: "streaming"` forever, showing
eternal dots and keeping the input disabled. This is handled:

- The server bumps `progressUpdatedAt` at least every 5 s while alive
  (heartbeat in `convex/chatActions.ts`).
- The client (`hooks/use-chat.ts`) re-checks liveness every 10 s and
  immediately on `AppState` re-foreground. A streaming message with no
  heartbeat for 60 s is treated as stale: it stops counting as "streaming"
  (input unlocks) and renders the retry notice.
- `retryGeneration` accepts such messages (server-side window: 45 s in
  `convex/chat.ts`) and re-runs the turn into the same bubble.

## Summary

| Scenario | Generation completes? | Result visible on return? |
| --- | --- | --- |
| Backgrounded / locked mid-generation | Yes (server-side) | Yes, via automatic re-sync |
| App reopened much later | Yes | Yes, persisted in `chatMessages` |
| App terminated after send reached server | Yes | Yes, on next launch |
| App terminated before send reached server | Never started | User message absent — resend |
| Convex action itself dies | No | Stale detection → retry affordance |
