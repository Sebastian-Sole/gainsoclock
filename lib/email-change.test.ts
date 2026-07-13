import { describe, expect, it } from "vitest";
import {
  EMAIL_CHANGE_TTL_MS,
  generateEmailChangeToken,
  hashEmailChangeToken,
  validateNewEmail,
} from "./email-change";

describe("validateNewEmail", () => {
  it("accepts a well-formed new address and returns it trimmed", () => {
    const result = validateNewEmail("  New@Example.com  ", "old@example.com");
    expect(result).toEqual({ ok: true, email: "New@Example.com" });
  });

  it("rejects malformed addresses", () => {
    for (const bad of ["", "no-at", "no@domain", "spaces in@x.com", "a@b."]) {
      expect(validateNewEmail(bad, "old@example.com")).toEqual({
        ok: false,
        reason: "invalid_email",
      });
    }
  });

  it("rejects Apple Hide-My-Email relay addresses", () => {
    expect(
      validateNewEmail("abc123@privaterelay.appleid.com", "old@example.com"),
    ).toEqual({ ok: false, reason: "invalid_email" });
  });

  it("rejects an unchanged address (exact match)", () => {
    expect(validateNewEmail("old@example.com", "old@example.com")).toEqual({
      ok: false,
      reason: "same_email",
    });
    // Surrounding whitespace still counts as the same address.
    expect(validateNewEmail("  old@example.com ", "old@example.com")).toEqual({
      ok: false,
      reason: "same_email",
    });
  });

  it("treats a case-only difference as a real change (account id is case-sensitive)", () => {
    expect(validateNewEmail("OLD@example.com", "old@example.com")).toEqual({
      ok: true,
      email: "OLD@example.com",
    });
  });
});

describe("email-change tokens", () => {
  it("generates a 64-char hex token", () => {
    const token = generateEmailChangeToken();
    expect(token).toMatch(/^[0-9a-f]{64}$/);
  });

  it("generates distinct tokens", () => {
    expect(generateEmailChangeToken()).not.toBe(generateEmailChangeToken());
  });

  it("hashes deterministically to 64-char hex, and differently per token", async () => {
    const token = generateEmailChangeToken();
    const hash = await hashEmailChangeToken(token);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(await hashEmailChangeToken(token)).toBe(hash);
    expect(await hashEmailChangeToken(generateEmailChangeToken())).not.toBe(
      hash,
    );
  });
});

describe("EMAIL_CHANGE_TTL_MS", () => {
  it("is one hour", () => {
    expect(EMAIL_CHANGE_TTL_MS).toBe(3_600_000);
  });
});
