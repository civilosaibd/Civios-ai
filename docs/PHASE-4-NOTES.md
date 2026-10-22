# Phase 4 — deadline alerts, Google referral claim, privilege hardening

Apply the 3 migrations FIRST (in order), then upload the frontend files.

| Migration | What it does |
|---|---|
| `20261021120000_deadline_alerts.sql` | Alerts 7/3/1 days before `projects.end_date` (not completed). Owner + accepted members, honours `notification_settings`. Bengali text. De-duplicated with `notifications.dedupe_key`. Daily pg_cron (08:30 Dhaka) if the extension exists. |
| `20261021130000_claim_referral.sql` | `claim_referral(code)` for Google sign-ups: only new accounts (<24h, no verified payment), no self-referral, cannot switch referrer. |
| `20261021140000_harden_legacy_table_privileges.sql` | Revokes anon access and TRUNCATE/REFERENCES/TRIGGER on payments, withdrawals, subscriptions, referrals, usage tables. |

Client: `NotificationBell` calls `generate_my_deadline_notifications` once a day per browser; `ReferralCapture` calls `claim_referral` after sign-in when a stored code exists.

Tests: PGlite `supabase/tests/phase4.test.mjs` (11), vitest (66 total). pg_cron path and real Supabase are NOT verified.
Known limits: a user who never opens the app gets no alert unless pg_cron is enabled; no refund clawback.
