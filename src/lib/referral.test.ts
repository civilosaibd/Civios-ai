import { describe, expect, it } from "vitest";
import {
  REFERRAL_STORAGE_KEY, captureReferral, clearStoredReferral, getStoredReferral,
  normalizeReferralCode, referralForSignup, referralLink,
} from "./referral";

const mem = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), m };
};

describe("referral capture", () => {
  it("accepts CIVIL-style codes and upper-cases them", () => {
    expect(normalizeReferralCode(" civil-zb112 ")).toBe("CIVIL-ZB112");
    expect(normalizeReferralCode("CIVIL-A1B2C3")).toBe("CIVIL-A1B2C3");
  });
  it("rejects junk, markup and oversize values", () => {
    for (const bad of ["", null, undefined, "ab", "<script>", "a b c d e", "x".repeat(33), "CIVIL-ZB112; DROP"])
      expect(normalizeReferralCode(bad as string)).toBeNull();
  });
  it("stores a valid ?ref= under civilos_referral_code", () => {
    const s = mem();
    expect(captureReferral("?foo=1&ref=civil-zb112", s)).toBe("CIVIL-ZB112");
    expect(s.m.get("civilos_referral_code")).toBe("CIVIL-ZB112");
    expect(REFERRAL_STORAGE_KEY).toBe("civilos_referral_code");
  });
  it("does not store or overwrite anything for an invalid code", () => {
    const s = mem(); captureReferral("?ref=CIVIL-OK123", s);
    expect(captureReferral("?ref=<x>", s)).toBeNull();
    expect(getStoredReferral(s)).toBe("CIVIL-OK123");
    expect(captureReferral("", s)).toBeNull();
  });
  it("signup uses the URL code first, then the stored one, then nothing", () => {
    const s = mem();
    expect(referralForSignup("", s)).toBeUndefined();
    captureReferral("?ref=CIVIL-STORED", s);
    expect(referralForSignup("", s)).toBe("CIVIL-STORED");
    expect(referralForSignup("?ref=CIVIL-FRESH", s)).toBe("CIVIL-FRESH");
  });
  it("clears after use and survives a blocked/missing storage", () => {
    const s = mem(); captureReferral("?ref=CIVIL-OK123", s); clearStoredReferral(s);
    expect(getStoredReferral(s)).toBeNull();
    expect(captureReferral("?ref=CIVIL-OK123", null)).toBe("CIVIL-OK123");
    expect(getStoredReferral(null)).toBeNull();
    const boom = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); }, removeItem: () => { throw new Error("blocked"); } };
    expect(() => captureReferral("?ref=CIVIL-OK123", boom)).not.toThrow();
    expect(getStoredReferral(boom)).toBeNull();
  });
  it("builds the /register?ref= link", () => {
    expect(referralLink("https://civilosai.vercel.app", "CIVIL-ZB112")).toBe("https://civilosai.vercel.app/register?ref=CIVIL-ZB112");
  });
});

import { claimStoredReferral, shouldRunDaily } from "./referral";

const objStore = (init: Record<string, string> = {}) => {
  const m = { ...init };
  return { m, getItem: (k: string) => m[k] ?? null, setItem: (k: string, v: string) => { m[k] = v; }, removeItem: (k: string) => { delete m[k]; } };
};

describe("claimStoredReferral", () => {
  it("does nothing without a stored code", async () => {
    let called = false;
    const r = await claimStoredReferral(async () => { called = true; return { data: "claimed", error: null }; }, objStore());
    expect(r).toBeNull(); expect(called).toBe(false);
  });
  it("sends the code and clears it on any final answer", async () => {
    for (const answer of ["claimed", "too_late", "self", "invalid_code", "already_referred"]) {
      const s = objStore({ civilos_referral_code: "civil-abc123" });
      let sent = "";
      const r = await claimStoredReferral(async (c) => { sent = c; return { data: answer, error: null }; }, s);
      expect(sent).toBe("CIVIL-ABC123"); expect(r).toBe(answer); expect(s.m.civilos_referral_code).toBeUndefined();
    }
  });
  it("keeps the code when the call fails", async () => {
    const s = objStore({ civilos_referral_code: "CIVIL-ABC123" });
    expect(await claimStoredReferral(async () => ({ data: null, error: { message: "x" } }), s)).toBeNull();
    expect(await claimStoredReferral(async () => { throw new Error("net"); }, s)).toBeNull();
    expect(s.m.civilos_referral_code).toBe("CIVIL-ABC123");
  });
});

describe("shouldRunDaily", () => {
  it("runs once per day per key", () => {
    const s = objStore();
    const d1 = new Date("2026-10-21T01:00:00Z"), d2 = new Date("2026-10-21T23:00:00Z"), d3 = new Date("2026-10-22T00:10:00Z");
    expect(shouldRunDaily("k", s, d1)).toBe(true);
    expect(shouldRunDaily("k", s, d2)).toBe(false);
    expect(shouldRunDaily("other", s, d2)).toBe(true);
    expect(shouldRunDaily("k", s, d3)).toBe(true);
  });
  it("does not run without storage", () => { expect(shouldRunDaily("k", null)).toBe(false); });
});
