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
