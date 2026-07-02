import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.daily(
  "trial-reminder-48h",
  { hourUTC: 8, minuteUTC: 0 },
  internal.subscriptionCrons.sendTrialReminders,
);

crons.daily(
  "dcsa-6-monthly",
  { hourUTC: 9, minuteUTC: 0 },
  internal.subscriptionCrons.sendDcsa6Month,
);

crons.daily(
  "grace-payment-nudge",
  { hourUTC: 10, minuteUTC: 0 },
  internal.subscriptionCrons.sendGraceNudges,
);

crons.daily(
  "winback-lapsed",
  { hourUTC: 10, minuteUTC: 0 },
  internal.subscriptionCrons.sendWinbacks,
);

crons.interval(
  "rc-temp-demote",
  { hours: 1 },
  internal.subscriptionCrons.demoteExpiredTempGrants,
);

crons.daily(
  "sweep-orphan-meal-photos",
  { hourUTC: 4, minuteUTC: 0 },
  internal.nutritionVision.sweepOrphanPhotos,
);

export default crons;
