import { useEffect } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { captureReferral, claimStoredReferral, referralForSignup } from "@/lib/referral";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";

/** Remembers `?ref=CODE` from whichever page the visitor lands on (renders nothing). */
export default function ReferralCapture() {
  const { search } = useLocation();
  const { user } = useAuth();
  useEffect(() => {
    const code = captureReferral(search);
    if (!code) return;
    // Count a referral-link landing once per browser tab and referral code.
    // This is a recorded landing event, not proof of a unique human or external share.
    try {
      const key = `civilos_referral_click:${code}`;
      let eventId = sessionStorage.getItem(key);
      if (!eventId) {
        eventId = crypto.randomUUID();
        sessionStorage.setItem(key, eventId);
      }
      void supabase.functions.invoke("track-referral-event", {
        body: { referralCode: code, eventType: "link_click", eventId },
      });
    } catch {
      // Referral attribution still works when browser storage is unavailable.
    }
  }, [search]);
  // Signed in with a code still stored (e.g. Google sign-up): let the database decide whether it counts.
  useEffect(() => {
    if (!user) return;
    void claimStoredReferral((code) => supabase.rpc("claim_referral", { _code: code }));
  }, [user]);
  return null;
}

/** `/register?ref=CODE` → the existing sign-up form (/auth), keeping the referral code. */
export function RegisterRedirect() {
  const { search } = useLocation();
  const ref = referralForSignup(search);
  const qs = new URLSearchParams({ mode: "signup", ...(ref ? { ref } : {}) });
  return <Navigate to={`/auth?${qs.toString()}`} replace />;
}
