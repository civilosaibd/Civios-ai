import { useEffect } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { captureReferral, referralForSignup } from "@/lib/referral";

/** Remembers `?ref=CODE` from whichever page the visitor lands on (renders nothing). */
export default function ReferralCapture() {
  const { search } = useLocation();
  useEffect(() => { captureReferral(search); }, [search]);
  return null;
}

/** `/register?ref=CODE` → the existing sign-up form (/auth), keeping the referral code. */
export function RegisterRedirect() {
  const { search } = useLocation();
  const ref = referralForSignup(search);
  const qs = new URLSearchParams({ mode: "signup", ...(ref ? { ref } : {}) });
  return <Navigate to={`/auth?${qs.toString()}`} replace />;
}
