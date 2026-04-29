"use node";

import { v } from "convex/values";
import { internalAction } from "./_generated/server";

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

async function sendViaResend(payload: ResendPayload): Promise<void> {
  const apiKey = process.env.EMAIL_SERVICE_API_KEY;
  if (!apiKey) {
    console.warn(
      "[Email] EMAIL_SERVICE_API_KEY not set — skipping send",
      payload.subject,
    );
    return;
  }
  const response = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `[Email] Resend rejected (${response.status}): ${body.slice(0, 256)}`,
    );
  }
}

function unsubscribeUrl(userId: string, token: string): string {
  const base =
    process.env.CONVEX_SITE_URL?.replace(/\/$/, "") ?? "https://fitbull.app";
  const params = new URLSearchParams({ user: userId, token });
  return `${base}/webhooks/email/unsubscribe?${params.toString()}`;
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

export const sendTrialReminder48h = internalAction({
  args: {
    userId: v.id("users"),
    email: v.string(),
    trialExpiresAt: v.string(),
    unsubscribeToken: v.string(),
    storefrontCountry: v.optional(v.string()),
  },
  handler: async (_ctx, args) => {
    const { html, text } = trialReminderTemplate({
      trialExpiresAt: args.trialExpiresAt,
      unsubscribe: unsubscribeUrl(args.userId, args.unsubscribeToken),
    });
    // storefrontCountry is the V1.1 localisation hook — English V1.
    void args.storefrontCountry;
    await sendViaResend({
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
    unsubscribeToken: v.string(),
  },
  handler: async (_ctx, args) => {
    const { html, text } = dcsa6MonthTemplate({
      unsubscribe: unsubscribeUrl(args.userId, args.unsubscribeToken),
    });
    await sendViaResend({
      from: FROM_ADDRESS,
      to: [args.email],
      reply_to: REPLY_TO,
      subject: "Your Fitbull subscription — 6-month reminder",
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
  handler: async (_ctx, args) => {
    void args.userId;
    await sendViaResend({
      from: FROM_ADDRESS,
      to: [args.email],
      reply_to: REPLY_TO,
      subject: "You've unsubscribed from Fitbull billing reminders",
      html: "<p>You have been unsubscribed from Fitbull billing reminders.</p>",
      text: "You have been unsubscribed from Fitbull billing reminders.",
    });
  },
});
