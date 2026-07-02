import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
// Reminder window: send when trial ends in 46-50h. Catches single-day cron
// jitter on either side of the 48h target.
const REMINDER_WINDOW_LOWER_MS = 46 * HOUR_MS;
const REMINDER_WINDOW_UPPER_MS = 50 * HOUR_MS;
const DCSA_INTERVAL_MS = 183 * DAY_MS;

function isoNow(): string {
  return new Date().toISOString();
}

/**
 * Daily cron handler — scan trials ending in the next ~48h and dispatch
 * a reminder email. Idempotent via `reminder48hSentAt`.
 */
export const sendTrialReminders = internalMutation({
  args: {},
  handler: async (ctx) => {
    const nowMs = Date.now();
    const lowerMs = nowMs + REMINDER_WINDOW_LOWER_MS;
    const upperMs = nowMs + REMINDER_WINDOW_UPPER_MS;
    const lowerIso = new Date(lowerMs).toISOString();
    const upperIso = new Date(upperMs).toISOString();

    const trials = await ctx.db
      .query("userSubscriptions")
      .withIndex("by_status_trialExpiresAt", (q) =>
        q
          .eq("status", "trial")
          .gte("trialExpiresAt", lowerIso)
          .lte("trialExpiresAt", upperIso)
      )
      .collect();

    let sent = 0;
    for (const row of trials) {
      if (row.reminder48hSentAt) continue;
      if (!row.trialExpiresAt) continue;
      const trialEndsMs = Date.parse(row.trialExpiresAt);
      if (!Number.isFinite(trialEndsMs)) continue;
      if (trialEndsMs < lowerMs || trialEndsMs > upperMs) continue;

      const user = await ctx.db.get(row.userId);
      const email = (user as { email?: string } | null)?.email;
      if (!email) {
        // No email on the user record (pre-V1 anonymous account). Fall back
        // to a local notification scheduled by the client — the client
        // schedules its own reminders via `expo-notifications`. Just mark
        // the reminder as "sent" so we don't keep enqueueing.
        await ctx.db.patch(row._id, { reminder48hSentAt: isoNow() });
        continue;
      }
      if (row.emailOptOut) {
        await ctx.db.patch(row._id, { reminder48hSentAt: isoNow() });
        continue;
      }

      await ctx.scheduler.runAfter(
        0,
        internal.email.sendTrialReminder48h,
        {
          userId: row.userId,
          email,
          trialExpiresAt: row.trialExpiresAt,
          storefrontCountry: row.storefrontCountry,
        },
      );
      await ctx.db.patch(row._id, { reminder48hSentAt: isoNow() });
      sent++;
    }

    if (sent > 0) {
      console.log(`[Cron] trial-reminder-48h enqueued ${sent} emails`);
    }
  },
});

/**
 * Daily cron handler — DCSA Nordic 6-monthly subscription reminder.
 * Idempotent via `dcsaNotifiedAt` ≥ `notificationAnchorAt + 183d`.
 */
export const sendDcsa6Month = internalMutation({
  args: {},
  handler: async (ctx) => {
    const nowMs = Date.now();
    const cutoffIso = new Date(nowMs - DCSA_INTERVAL_MS).toISOString();
    const proRows = await ctx.db
      .query("userSubscriptions")
      .withIndex("by_status_notificationAnchorAt", (q) =>
        q
          .eq("status", "pro")
          .gt("notificationAnchorAt", "")
          .lte("notificationAnchorAt", cutoffIso)
      )
      .collect();

    let sent = 0;
    for (const row of proRows) {
      if (!row.notificationAnchorAt) continue;
      const anchorMs = Date.parse(row.notificationAnchorAt);
      if (!Number.isFinite(anchorMs)) continue;
      const dueAt = anchorMs + DCSA_INTERVAL_MS;
      if (dueAt > nowMs) continue;

      const lastSentMs = row.dcsaNotifiedAt
        ? Date.parse(row.dcsaNotifiedAt)
        : 0;
      if (lastSentMs >= dueAt) continue;

      const user = await ctx.db.get(row.userId);
      const email = (user as { email?: string } | null)?.email;
      if (!email) {
        await ctx.db.patch(row._id, { dcsaNotifiedAt: isoNow() });
        continue;
      }
      if (row.emailOptOut) {
        await ctx.db.patch(row._id, { dcsaNotifiedAt: isoNow() });
        continue;
      }

      await ctx.scheduler.runAfter(0, internal.email.sendDcsa6Month, {
        userId: row.userId,
        email,
      });
      await ctx.db.patch(row._id, { dcsaNotifiedAt: isoNow() });
      sent++;
    }

    if (sent > 0) {
      console.log(`[Cron] dcsa-6-monthly enqueued ${sent} emails`);
    }
  },
});

/**
 * Hourly cron handler — demote rows still on rc_temp grants whose 24h
 * window has elapsed. Defensive: webhook handler also pre-demotes inline
 * when a new event arrives on a stale rc_temp row.
 */
export const demoteExpiredTempGrants = internalMutation({
  args: {},
  handler: async (ctx) => {
    const nowMs = Date.now();
    const nowIso = isoNow();
    const proRows = await ctx.db
      .query("userSubscriptions")
      .withIndex("by_status_source", (q) =>
        q.eq("status", "pro").eq("source", "rc_temp")
      )
      .collect();

    let demoted = 0;
    for (const row of proRows) {
      if (!row.expiresAt) continue;
      const expMs = Date.parse(row.expiresAt);
      if (!Number.isFinite(expMs) || expMs > nowMs) continue;

      const history = row.sourceHistory ? [...row.sourceHistory] : [];
      history.push({
        source: "temp_grant_expired",
        reason: "temp_grant_expired",
        grantedAt: nowIso,
      });
      await ctx.db.patch(row._id, {
        status: "free",
        source: undefined,
        trialExpiresAt: undefined,
        willAutoRenew: false,
        expiresAt: undefined,
        sourceHistory: history,
        isActive: false,
        updatedAt: nowIso,
      });
      demoted++;
    }

    if (demoted > 0) {
      console.log(`[Cron] rc-temp-demote demoted ${demoted} rows`);
    }
  },
});

/**
 * Internal mutation backing the email unsubscribe link in convex/http.ts.
 * Token verification happens in convex/http.ts (HMAC, constant-time) before
 * this mutation is invoked. Flips `emailOptOut`. Idempotent.
 */
export const markEmailOptOut = internalMutation({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    const normalized = ctx.db.normalizeId("users", args.userId);
    if (!normalized) return;
    const rows = await ctx.db
      .query("userSubscriptions")
      .withIndex("by_user", (q) => q.eq("userId", normalized))
      .collect();
    const nowIso = isoNow();
    for (const row of rows) {
      if (row.emailOptOut) continue;
      await ctx.db.patch(row._id, { emailOptOut: true, updatedAt: nowIso });
    }
  },
});
