# Backlog

## Convex Resource Optimization

### NOW — Zero-risk refactors

**#1 — Batch-fetch in `listFull()` (`convex/workoutLogs.ts:33-108`)**
Replace N+1 query pattern (1 query per exercise per log) with a single batch-fetch of all `workoutLogExercises` and `workoutSets`, then join in memory. Identical output, fewer queries.

**#3 — Batch-fetch in `listWithExercises()` (`convex/templates.ts:41-47`)**
Same pattern as #1. Fetch all `templateExercises` for the user once, group by template in memory. Already done correctly in `chatInternal.ts:31-46` — mirror that approach.

**#4 — Add `by_user_saved` index for recipes (`convex/recipes.ts:29-47`)**
`listSavedRecipes()` fetches all recipes then filters `saved === true` in JS. Add a compound index and query directly.

**#7 — Month-based calendar fetching (`convex/workoutLogs.ts:17-29`)**
Replace `listMeta` (fixed 200 logs) with a date-range query. Fetch current month + 2 previous months on load, then extend range on calendar swipe. Accumulate fetched months in the store so swiping back is instant. Fixes a correctness bug where users with 200+ logs lose old history from the calendar.

### LATER — Paid feature, defer until needed

**#2 — Optimize AI Coach context fetching (`chatInternal.ts`)**
`getUserContext()` fetches ALL workout logs, exercises, and sets before every chat message, then filters in memory. The `by_user_completedAt` index already exists but isn't used for range queries.

**What to change:**
- Use `by_user_completedAt` range query to fetch only last 14 days of logs instead of all logs (line 71-74)
- Scope `workoutLogExercises` and `workoutSets` fetches to only the logs retrieved above (lines 123-131)

**Trade-offs to handle:**
- `totalWorkouts` (line 91) currently relies on `allLogs.length` — would need a separate count or counter field
- Streak calculation (lines 105-119) walks backwards from today with no bound — would need a capped range (e.g. 60 days) or accept a max streak limit
- These are minor AI prompt context losses, not user-facing data

**Impact:** Likely the single biggest DB I/O driver if chat is used frequently. Every message triggers multiple full-table scans.
