// Referral attribution on the client: remember `?ref=CODE` from ANY landing page until the user signs up.
// The code is only a hint — the database validates it and decides who the referrer is. Nothing here
// carries an amount or a status.
export const REFERRAL_STORAGE_KEY = "civilos_referral_code";

// CIVIL-XXXXXX style codes (letters, digits, dash). Anything else is ignored.
const CODE_RE = /^[A-Za-z0-9-]{4,32}$/;

export function normalizeReferralCode(raw: string | null | undefined): string | null {
  const v = (raw ?? "").trim();
  return CODE_RE.test(v) ? v.toUpperCase() : null;
}

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;
const safeStore = (): Store | null => {
  try { return typeof localStorage === "undefined" ? null : localStorage; } catch { return null; }
};

/** Save a valid `?ref=` from the URL (the first one wins until it is used or cleared). */
export function captureReferral(search: string, store: Store | null = safeStore()): string | null {
  const code = normalizeReferralCode(new URLSearchParams(search).get("ref"));
  if (!code || !store) return code;
  try { store.setItem(REFERRAL_STORAGE_KEY, code); } catch { /* storage blocked — URL param still works */ }
  return code;
}

export function getStoredReferral(store: Store | null = safeStore()): string | null {
  if (!store) return null;
  try { return normalizeReferralCode(store.getItem(REFERRAL_STORAGE_KEY)); } catch { return null; }
}

export function clearStoredReferral(store: Store | null = safeStore()): void {
  try { store?.removeItem(REFERRAL_STORAGE_KEY); } catch { /* ignore */ }
}

/** Code to send with sign-up: an explicit URL param wins over what was stored earlier. */
export function referralForSignup(search: string, store: Store | null = safeStore()): string | undefined {
  return normalizeReferralCode(new URLSearchParams(search).get("ref")) ?? getStoredReferral(store) ?? undefined;
}

export const referralLink = (origin: string, code: string) => `${origin}/register?ref=${encodeURIComponent(code)}`;

export type ClaimResult = "claimed" | "already_referred" | "too_late" | "invalid_code" | "self";
type Rpc = (code: string) => PromiseLike<{ data: unknown; error: { message: string } | null }>;

/**
 * After sign-in (covers Google sign-up, which carries no metadata): hand the stored code to the database.
 * The database decides (new account only, no self-referral, cannot switch referrer). Every answer is final,
 * so the stored code is cleared; only a failed call (network/server error) keeps it for the next visit.
 */
export async function claimStoredReferral(rpc: Rpc, store: Store | null = safeStore()): Promise<ClaimResult | null> {
  const code = getStoredReferral(store);
  if (!code) return null;
  try {
    const { data, error } = await rpc(code);
    if (error || typeof data !== "string") return null;
    clearStoredReferral(store);
    return data as ClaimResult;
  } catch {
    return null;
  }
}

/** True at most once per calendar day (UTC) per key; records the day when it returns true. */
export function shouldRunDaily(key: string, store: Store | null = safeStore(), now: Date = new Date()): boolean {
  if (!store) return false;
  const day = now.toISOString().slice(0, 10);
  try {
    if (store.getItem(key) === day) return false;
    store.setItem(key, day);
    return true;
  } catch { return false; }
}

