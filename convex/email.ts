"use node";

import { createHmac } from "node:crypto";
import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import type { ActionCtx } from "./_generated/server";
import { reportServerError } from "./errorBoundary";

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const FROM_ADDRESS = "Fitbull <noreply@fitbull.app>";
const REPLY_TO = "support@fitbull.app";

interface ResendPayload {
  from: string;
  to: string[];
  subject: string;
  html: string;
  text: string;
  reply_to?: string;
  headers?: Record<string, string>;
}

async function sendViaResend(
  ctx: ActionCtx,
  payload: ResendPayload,
): Promise<void> {
  const apiKey = process.env.EMAIL_SERVICE_API_KEY;
  if (!apiKey) {
    console.warn(
      "[Email] EMAIL_SERVICE_API_KEY not set — skipping send",
      payload.subject,
    );
    return;
  }
  let response: Response;
  try {
    response = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    // Network-level failure reaching Resend — scheduled from a cron with no
    // client watching, so report it before it disappears into the logs.
    await reportServerError(ctx, "email.send", e);
    throw e;
  }
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    const err = new Error(
      `[Email] Resend rejected (${response.status}) for "${payload.subject}": ${body.slice(0, 256)}`,
    );
    await reportServerError(ctx, "email.send", err);
    throw err;
  }
}

function unsubscribeUrl(userId: string, token: string): string {
  const base =
    process.env.CONVEX_SITE_URL?.replace(/\/$/, "") ?? "https://fitbull.app";
  const params = new URLSearchParams({ user: userId, token });
  return `${base}/webhooks/email/unsubscribe?${params.toString()}`;
}

/**
 * HMAC-SHA256(userId) keyed on UNSUBSCRIBE_TOKEN_SECRET, hex-encoded.
 * Returns null when the secret is unset — callers must skip the send and
 * log loudly (an unsigned unsubscribe link is worse than a delayed email).
 *
 * V8-runtime twin: `unsubscribeTokenV8` in convex/http.ts. The two
 * implementations MUST produce identical output; change them in lockstep.
 */
function unsubscribeTokenNode(userId: string): string | null {
  const secret = process.env.UNSUBSCRIBE_TOKEN_SECRET;
  if (!secret) return null;
  return createHmac("sha256", secret).update(userId).digest("hex");
}

function trialReminderTemplate(args: {
  trialExpiresAt: string;
  unsubscribe: string;
}): { html: string; text: string } {
  const expires = new Date(args.trialExpiresAt).toUTCString();
  const text = [
    "Heads up — your Fitbull free trial ends in ~48 hours.",
    "",
    `Trial ends: ${expires}`,
    "",
    "If you do nothing your subscription continues at the standard price.",
    "Manage your subscription in Settings → Subscription.",
    "",
    `Unsubscribe from billing reminders: ${args.unsubscribe}`,
  ].join("\n");
  const html = `<!doctype html><html><body style="font-family:sans-serif;line-height:1.5">
<p>Heads up — your <strong>Fitbull</strong> free trial ends in ~48 hours.</p>
<p>Trial ends: <strong>${expires}</strong></p>
<p>If you do nothing your subscription continues at the standard price.
Manage your subscription in Settings → Subscription.</p>
<p style="font-size:12px;color:#666"><a href="${args.unsubscribe}">Unsubscribe from billing reminders</a></p>
</body></html>`;
  return { html, text };
}

function dcsa6MonthTemplate(args: { unsubscribe: string }): {
  html: string;
  text: string;
} {
  const text = [
    "This is your six-monthly Fitbull subscription reminder.",
    "",
    "You are subscribed to Fitbull Pro. Manage or cancel anytime in",
    "Settings → Subscription, or via your App Store account.",
    "",
    "(Sent to comply with Nordic consumer-rights legislation; once every 6 months.)",
    "",
    `Unsubscribe from these reminders: ${args.unsubscribe}`,
  ].join("\n");
  const html = `<!doctype html><html><body style="font-family:sans-serif;line-height:1.5">
<p>This is your six-monthly <strong>Fitbull</strong> subscription reminder.</p>
<p>You are subscribed to Fitbull Pro. Manage or cancel anytime in
Settings → Subscription, or via your App Store account.</p>
<p style="font-size:12px;color:#666">Sent to comply with Nordic consumer-rights legislation; once every 6 months.</p>
<p style="font-size:12px;color:#666"><a href="${args.unsubscribe}">Unsubscribe from these reminders</a></p>
</body></html>`;
  return { html, text };
}

function gracePaymentNudgeTemplate(args: { unsubscribe: string }): {
  html: string;
  text: string;
} {
  const text = [
    "Your last Fitbull Pro payment didn't go through.",
    "",
    "Your access continues briefly while we retry, but you'll want to fix",
    "this soon to avoid losing Pro. Update your payment method in",
    "Settings → Subscription, or via your App Store account.",
    "",
    `Unsubscribe from these reminders: ${args.unsubscribe}`,
  ].join("\n");
  const html = `<!doctype html><html><body style="font-family:sans-serif;line-height:1.5">
<p>Your last <strong>Fitbull Pro</strong> payment didn't go through.</p>
<p>Your access continues briefly while we retry, but you'll want to fix
this soon to avoid losing Pro. Update your payment method in
Settings → Subscription, or via your App Store account.</p>
<p style="font-size:12px;color:#666"><a href="${args.unsubscribe}">Unsubscribe from these reminders</a></p>
</body></html>`;
  return { html, text };
}

function winbackTemplate(args: { unsubscribe: string }): {
  html: string;
  text: string;
} {
  const text = [
    "Your training history is still here.",
    "",
    "Your Fitbull Pro subscription ended, but your workouts, meals, and",
    "progress are all intact. Resubscribe anytime with one tap in the app",
    "to pick up right where you left off.",
    "",
    `Unsubscribe from these reminders: ${args.unsubscribe}`,
  ].join("\n");
  const html = `<!doctype html><html><body style="font-family:sans-serif;line-height:1.5">
<p>Your training history is still here.</p>
<p>Your <strong>Fitbull Pro</strong> subscription ended, but your workouts, meals, and
progress are all intact. Resubscribe anytime with one tap in the app
to pick up right where you left off.</p>
<p style="font-size:12px;color:#666"><a href="${args.unsubscribe}">Unsubscribe from these reminders</a></p>
</body></html>`;
  return { html, text };
}

export const sendTrialReminder48h = internalAction({
  args: {
    userId: v.id("users"),
    email: v.string(),
    trialExpiresAt: v.string(),
    storefrontCountry: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const token = unsubscribeTokenNode(args.userId);
    if (!token) {
      console.error(
        "[Email] UNSUBSCRIBE_TOKEN_SECRET not set — skipping send",
      );
      return;
    }
    const { html, text } = trialReminderTemplate({
      trialExpiresAt: args.trialExpiresAt,
      unsubscribe: unsubscribeUrl(args.userId, token),
    });
    // storefrontCountry is the V1.1 localisation hook — English V1.
    void args.storefrontCountry;
    await sendViaResend(ctx, {
      from: FROM_ADDRESS,
      to: [args.email],
      reply_to: REPLY_TO,
      subject: "Your Fitbull trial ends in 48 hours",
      html,
      text,
    });
  },
});

export const sendDcsa6Month = internalAction({
  args: {
    userId: v.id("users"),
    email: v.string(),
  },
  handler: async (ctx, args) => {
    const token = unsubscribeTokenNode(args.userId);
    if (!token) {
      console.error(
        "[Email] UNSUBSCRIBE_TOKEN_SECRET not set — skipping send",
      );
      return;
    }
    const { html, text } = dcsa6MonthTemplate({
      unsubscribe: unsubscribeUrl(args.userId, token),
    });
    await sendViaResend(ctx, {
      from: FROM_ADDRESS,
      to: [args.email],
      reply_to: REPLY_TO,
      subject: "Your Fitbull subscription — 6-month reminder",
      html,
      text,
    });
  },
});

export const sendGracePaymentNudge = internalAction({
  args: {
    userId: v.id("users"),
    email: v.string(),
  },
  handler: async (ctx, args) => {
    const token = unsubscribeTokenNode(args.userId);
    if (!token) {
      console.error(
        "[Email] UNSUBSCRIBE_TOKEN_SECRET not set — skipping send",
      );
      return;
    }
    const { html, text } = gracePaymentNudgeTemplate({
      unsubscribe: unsubscribeUrl(args.userId, token),
    });
    await sendViaResend(ctx, {
      from: FROM_ADDRESS,
      to: [args.email],
      reply_to: REPLY_TO,
      subject: "Action needed: your Fitbull Pro payment didn't go through",
      html,
      text,
    });
  },
});

export const sendWinback = internalAction({
  args: {
    userId: v.id("users"),
    email: v.string(),
  },
  handler: async (ctx, args) => {
    const token = unsubscribeTokenNode(args.userId);
    if (!token) {
      console.error(
        "[Email] UNSUBSCRIBE_TOKEN_SECRET not set — skipping send",
      );
      return;
    }
    const { html, text } = winbackTemplate({
      unsubscribe: unsubscribeUrl(args.userId, token),
    });
    await sendViaResend(ctx, {
      from: FROM_ADDRESS,
      to: [args.email],
      reply_to: REPLY_TO,
      subject: "Your training history is still here",
      html,
      text,
    });
  },
});

function emailChangeVerificationTemplate(args: { code: string }): {
  html: string;
  text: string;
} {
  const text = [
    "Use this code to confirm your new Fitbull email address:",
    "",
    args.code,
    "",
    "The code expires in 15 minutes. If you didn't request this change,",
    "you can ignore this email — your account is unchanged.",
  ].join("\n");
  const html = `<!doctype html><html><body style="font-family:sans-serif;line-height:1.5">
<p>Use this code to confirm your new <strong>Fitbull</strong> email address:</p>
<p style="font-size:28px;font-weight:bold;letter-spacing:6px">${args.code}</p>
<p>The code expires in 15 minutes. If you didn't request this change,
you can ignore this email — your account is unchanged.</p>
</body></html>`;
  return { html, text };
}

/**
 * Verification code for an account email change (convex/user.ts, issue
 * #123), sent to the NEW address. Transactional security email — no
 * unsubscribe link, unlike the billing reminders above. The code must never
 * be logged: keep it out of the subject (the no-API-key dev path logs the
 * subject) and out of any error text.
 */
export const sendEmailChangeVerification = internalAction({
  args: {
    email: v.string(),
    code: v.string(),
  },
  handler: async (ctx, args) => {
    const { html, text } = emailChangeVerificationTemplate({
      code: args.code,
    });
    await sendViaResend(ctx, {
      from: FROM_ADDRESS,
      to: [args.email],
      reply_to: REPLY_TO,
      subject: "Confirm your new Fitbull email address",
      html,
      text,
    });
  },
});

export const sendUnsubscribe = internalAction({
  args: {
    userId: v.id("users"),
    email: v.string(),
  },
  handler: async (ctx, args) => {
    void args.userId;
    await sendViaResend(ctx, {
      from: FROM_ADDRESS,
      to: [args.email],
      reply_to: REPLY_TO,
      subject: "You've unsubscribed from Fitbull billing reminders",
      html: "<p>You have been unsubscribed from Fitbull billing reminders.</p>",
      text: "You have been unsubscribed from Fitbull billing reminders.",
    });
  },
});
