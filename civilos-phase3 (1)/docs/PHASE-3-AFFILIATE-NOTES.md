# Phase 3 — Affiliate commission

**Order: apply the DB migration FIRST, then merge the frontend PR.**
(The frontend calls `my_affiliate_stats` and `review_commission`, which only exist after the migration.)

## What it does
- Every *verified* payment of a referred user pays the referrer `rate` x amount (default 10%),
  computed inside `approve_payment` in the same transaction. The client never sends an amount.
- Ledger table `referral_commissions` (one row per payment, `UNIQUE(payment_id)`): replay-safe.
- Self-referral never earns (function check + `referrals_no_self_referral` CHECK).
- Held as `flagged` until an admin approves/rejects in `/admin/affiliate`:
  referred user's payment uses the referrer's sender number, or a transaction ID reused on another payment.
- Withdrawable balance = approved ledger rows − non-rejected withdrawals (same source for UI and `request_withdrawal`).
- Rate is configuration: `app_settings` key `affiliate.commission_rate` (0.10).
- Client: `?ref=` captured on any page into `localStorage.civilos_referral_code`; `/register?ref=CODE` opens sign-up;
  sent with sign-up and cleared afterwards.

## Verified
PGlite on the real migrations (security 19 + viz 10 + affiliate 11 = 40/40), vitest 61/61, tsc clean, build OK,
mocked-backend browser test 18/18 (`ref` capture, /register redirect, sign-up payload, /affiliate, /admin/affiliate).
NOT verified: real Supabase (PostgREST, auth trigger on a real signup), real payments.

## Known limits
- **Google sign-up does not carry the referral code** (only e-mail sign-up does) — would need a server-side `claim_referral`.
- Same person with a different phone/transaction ID can't be detected; the flags are heuristics.
- Refunds/chargebacks do not claw back commission (no refund flow exists yet).
- `referrals` still has a broad admin ALL policy and `handle_new_user` swallows errors (pre-existing).
