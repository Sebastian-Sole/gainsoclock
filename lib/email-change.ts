// Pure helpers for the verify-before-activate email-change flow.
//
// Kept runtime-agnostic (global `crypto` only, no Node builtins) so both the
// Convex V8 action that starts a change (`convex/emailChange.ts`) and the V8
// HTTP action that confirms it (`convex/http.ts`) can import the exact same
// token/hash logic — the same lockstep-twin concern that bit the unsubscribe
// HMAC. The validation half is pure and unit-tested (`email-change.test.ts`).

// Matches the sign-up / sign-in screens' client-side rule
// (app/(auth)/sign-up.tsx). Deliberately loose — the real proof the address
// works is the verification link the user has to click.
export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Hide-My-Email relay addresses are Apple-internal identities — never a valid
// change target. Duplicated from convex/auth.ts's APPLE_RELAY_DOMAIN so this
// stays a dependency-free lib module (auth.ts pulls in `jose`).
export const APPLE_RELAY_DOMAIN = "@privaterelay.appleid.com";

// How long a pending change stays confirmable. Email links are often opened
// minutes-to-hours later, so this is friendlier than an OTP window; still
// short enough that a leaked link stops working the same day.
export const EMAIL_CHANGE_TTL_MS = 60 * 60 * 1000; // 1 hour

export type ValidateEmailResult =
  | { ok: true; email: string }
  | { ok: false; reason: "invalid_email" | "same_email" };

/**
 * Validate a requested new email against the caller's current password-account
 * id. Trims (matching the Password provider, which stores the address verbatim
 * and does NOT lowercase). Returns the cleaned address on success so callers
 * persist exactly what was validated.
 */
export function validateNewEmail(
  rawNewEmail: string,
  currentAccountId: string,
): ValidateEmailResult {
  const email = rawNewEmail.trim();
  if (!EMAIL_REGEX.test(email) || email.toLowerCase().endsWith(APPLE_RELAY_DOMAIN)) {
    return { ok: false, reason: "invalid_email" };
  }
  // Exact match is a no-op change. A case-only difference is a real re-key
  // (the account id is case-sensitive), so we allow it.
  if (email === currentAccountId.trim()) {
    return { ok: false, reason: "same_email" };
  }
  return { ok: true, email };
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** 32 bytes of CSPRNG output, hex-encoded (64 chars). The plaintext token —
 *  emailed to the new address, never stored. */
export function generateEmailChangeToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return toHex(bytes);
}

/** SHA-256(token) hex. Only the hash is persisted, so a leaked DB row can't be
 *  replayed as a confirmation link. */
export async function hashEmailChangeToken(token: string): Promise<string> {
  const data = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return toHex(new Uint8Array(digest));
}
