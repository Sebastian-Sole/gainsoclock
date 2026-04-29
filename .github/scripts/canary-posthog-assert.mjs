#!/usr/bin/env node
// Canary Walker: asserts the expected event chain appeared for the canary
// user in the last 24h (Offline-Sync #8 / Theme K). Exits non-zero on divergence.
//
// Env:
//   POSTHOG_API_KEY       — personal or project API key with read scope
//   POSTHOG_PROJECT_ID    — numeric project ID
//   POSTHOG_HOST          — e.g. https://eu.posthog.com
//   CANARY_DISTINCT_ID    — the canary user's PostHog distinct_id

const host = process.env.POSTHOG_HOST || "https://eu.posthog.com";
const key = process.env.POSTHOG_API_KEY;
const projectId = process.env.POSTHOG_PROJECT_ID;
const distinctId = process.env.CANARY_DISTINCT_ID;

if (!key || !projectId || !distinctId) {
  console.error("missing PostHog credentials for canary assertion");
  process.exit(2);
}

const expected = ["intake_started", "consent_granted", "plan_visible", "trial_started"];
const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

async function hql(query) {
  const res = await fetch(`${host}/api/projects/${projectId}/query/`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: { kind: "HogQLQuery", query } }),
  });
  if (!res.ok) throw new Error(`PostHog ${res.status}: ${await res.text()}`);
  return res.json();
}

const query = `
  select event, min(timestamp) as first_seen
  from events
  where distinct_id = '${distinctId}'
    and timestamp >= toDateTime('${since}')
    and event in (${expected.map((e) => `'${e}'`).join(", ")})
  group by event
`;

const result = await hql(query);
const seen = new Set((result.results ?? []).map((row) => row[0]));
const missing = expected.filter((e) => !seen.has(e));

if (missing.length > 0) {
  console.error(`canary: missing events in 24h: ${missing.join(", ")}`);
  process.exit(1);
}

console.log("canary: all expected events observed");
