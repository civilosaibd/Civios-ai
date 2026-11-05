# CivilOS AI — Phase 1 Production Audit

Audit date: **2026-11-05**. Scope: repository `zobaerio/CivilOS-AI`
(`main`), GitHub PR/issue state, Supabase source (functions,
migrations, tests), and frontend routing. Production behaviour is
reported only where repository evidence exists; everything else is
marked **NEEDS VERIFICATION** with the exact blocker named.

Method note: every PR status below was read from GitHub on the audit
date (342 PRs total). Nothing was assumed merged or deployed because
an earlier document said so.

## 0. Verification limits (blockers)

| Check | Status | Exact blocker |
|---|---|---|
| GitHub Actions / CI results per PR | **Cannot verify** | The connected GitHub App gets `403 Resource not accessible by integration` for check-runs and commit-status endpoints. Remedy: grant the app the **Checks** read permission, or review Actions in the GitHub UI. Until then, **no PR in this report is certified CI-green**, including PRs #351–#353. |
| TypeScript / ESLint / production build on `main` | **Cannot run here** | The audit environment has file-level access only (no clone/credentials to run `npm ci && npm run build`). CI (`.github/workflows/quality-checks.yml`) is the intended runner; see the row above. |
| Production database state | **Cannot verify** | No Supabase production access in this audit. Whether migrations are applied in production is the open question of issue #335. |
| Production deployment version | **Cannot verify** | No Vercel access in this audit. Issue #335 already proved deployed code can differ from `main`. |

## 1. Pull request inventory (verified 2026-11-05)

- **342 PRs total: 300 merged, 29 open, 13 closed unmerged.**

### 1.1 Admin programme (mission Phase 2)

| PR | Title (short) | Verified status |
|---|---|---|
| #313 | Affiliate Admin Control Center, scoped RBAC | **Merged** 2026-11-03 |
| #314 | Admin Project Management, scoped RBAC | **Merged** 2026-11-03 |
| #321 | Super Admin team mgmt + scoped permissions (Users/Projects/Billing/Affiliate/AI Usage) | **OPEN** — 26 files: adds `admin-rbac`, `admin-ai-usage-data`, `admin-billing-data`, `admin-project-data` Edge Functions, 6 migrations, `admin-rbac.test.mjs`, several admin pages |
| #322 | Admin Billing & Subscription workspace | **Merged** 2026-11-03 |
| #323 | Admin AI Usage Monitoring workspace | **Merged** 2026-11-03 |
| #315 | Audited user account suspension controls | OPEN |
| #316 | Admin subscription & payment center, scoped RBAC | OPEN — overlaps #322's area |
| #317 | Admin AI usage analytics, read-only RBAC | OPEN — overlaps #323's area |
| #318 | Centralized admin business reports | OPEN |
| #320 | Unified admin audit log center | OPEN |
| #325 | Complete scoped permissions: Reports/Audit/System Settings | OPEN — **based on #321's branch** (stacked) |
| #330 | Scoped admin workspaces in sidebar | OPEN — **based on #321's branch** (stacked) |
| #331 | Prevent cross-user identity probing in SECURITY DEFINER helpers | OPEN — based on a phase-8 branch, security-relevant, should not wait for the whole stack |

**Root finding for Phase 2:** the "missing permission integration" is
PR #321. It is large, it overlaps already-merged #322/#323 (both built
billing and AI-usage workspaces that #321 also touches — e.g.
`AdminBillingPage`, new `AdminAIUsagePage`), and two further PRs are
stacked on it. Merging it as-is without a conflict/overlap review
risks regressing the merged admin workspaces. Recommended sequence:
(1) land #331's security fix independently if it applies cleanly,
(2) rebase #321 onto current `main` and diff its billing/AI-usage
parts against merged #322/#323, keeping only the genuinely new RBAC
integration, (3) then #325, (4) then #330.

### 1.2 2D CAD programme (mission Phase 5)

PRs **#115–#140: 25 of 26 merged on 2026-10-28.** Individually
verified as requested:

| PR | Content | Status |
|---|---|---|
| #138 | Guard large CAD imports, reset pending drawing state | **Merged** |
| #139 | Reset partial arc on keyboard tool changes | **Merged** |
| #140 | Raise 2D CAD JSON import limit to 200 MB | **Merged** |
| #120 | Validate units and unique IDs in imported CAD drawings | **OPEN** (stacked on another CAD branch) |

Other open CAD work: #156 (undo/redo history hardening, stacked),
#169 (three-point arc, targets `main`), #174 (move/copy first-drag
fix, targets `main`), #277 (project-scoped CAD & survey, stack head
for #278/#279/#281).

### 1.3 3D Studio (mission Phase 6)

| PR | Content | Status |
|---|---|---|
| #24 | Professional 3D material and rendering studio | **Merged** 2026-10-22 |
| #299 | Parametric architectural roof profiles for IndoCAD 3D | OPEN |

### 1.4 Other mission-relevant PRs

| PR | Relevance | Status |
|---|---|---|
| #259 | Floating AI assistant: compact, draggable, **reliable** | **Closed UNMERGED** — see §3.1 |
| #283 | 3-day Professional trial + one-Free-project enforcement | **Closed UNMERGED** — trial rules in the mission (Phase 11) are therefore **not proven present in `main`**; verify before relying on them |
| #286 | ZIP/folder admin Excel library | OPEN (Phase 9) |
| #309 | Excel Template Library into admin + user workspace | OPEN (Phase 9) |
| #277–#281 | Project-scoped CAD/survey → diary/photos/QA-QC → revision control → finance | OPEN stack (Phases 8/10) |
| #230 | Prevent double counting in material BOQ | OPEN (Phase 4 correctness) |
| #241/#242 | Drawing upload intelligence → AI engineering analysis engine | OPEN stack |
| #251 | Floor-plan embedded studio step 1 | OPEN |
| #349 | Repair building-placement test syntax "blocking CI" | Closed UNMERGED — superseded or abandoned; supports the §0 CI concern |
| #351/#352/#353 | This week's #338 / #335 / #49-stage-A PRs | OPEN, draft |

## 2. Feature classification

Legend: **COMPLETED** = implemented in `main` with tests or merged
feature PRs as evidence · **PARTIAL** = present but gated, stacked in
open PRs, or missing a named piece · **BROKEN** = known production
failure · **NOT IMPLEMENTED** = no implementation evidence in `main` ·
**NEEDS TESTING** = implemented, verification evidence unavailable.

| Area | Classification | Evidence |
|---|---|---|
| Auth (email/Google), session | NEEDS TESTING | Auth pages/routes present; the reported Google OAuth redirect loop has **no fix evidence** in `main` found by this audit — Phase 12 must reproduce it on staging |
| Cloud workspace sync / Backup / Reports | **BROKEN in production** (per #335), code fixed | Migration + PR #334 in `main`; production apply outstanding (#335 rollout doc, PR #352) |
| AI chat endpoint security/cost controls (#338) | COMPLETED (code) / NEEDS TESTING (staging) | Invariants verified line-by-line 2026-11-05; guards in PR #351 |
| Floating AI assistant | **BROKEN / MISSING** | §3.1 |
| AI multi-provider architecture (OpenAI, OpenRouter, Gemini, Claude, DeepSeek) with fallback + admin config | PARTIAL | `ai-chat` selects OpenAI **or** OpenRouter via env; other functions use the Lovable gateway. No Gemini/Claude/DeepSeek provider, no automatic fallback chain, no admin provider UI found in `main` |
| AI usage quotas/credits | COMPLETED (code) | Server-side quota RPC, rate limiter, security tests; provider-failure refund policy undocumented (PR #351 note) |
| Admin: affiliate, projects, billing, AI usage workspaces | PARTIAL | #313/#314/#322/#323 merged; permission integration (#321) + suspension (#315), payments center (#316), reports (#318), audit center (#320) still open; overlap risk §1.1 |
| Admin server-side authorization | NEEDS TESTING | Admin Edge Functions check JWT + `has_role` in-handler (verified for `admin-user-data`); full matrix awaits #321 + staging tests |
| Engineering calculations / BOQ / BBS / estimation suite | NEEDS TESTING | Large routed module set (calculation center, BOQ hub, BBS, rate analysis, takeoff features incl. merged #348/#350); correctness is test-dependent — repo has formula/unit tests, but CI results are unverifiable (§0). Open correctness PR #230 (BOQ double counting) should be prioritised in Phase 4 |
| 2D CAD editor | PARTIAL→near-complete for its scope | #115–#140 merged except #120; `src/lib/cad2d` has geometry/snap/walls/openings/analysis/export + tests; undo/redo hardening open (#156); unified workspace still staged via #49 plan |
| Floor plan generation (prompt → plan) | COMPLETED (code) / NEEDS TESTING | `ai-floorplan` validation incl. connectivity/reachability verified in #338 audit |
| 3D Studio / visualizations | PARTIAL | PR #24 merged; viz routes live; "professional architecture studio" scope (walkthrough, PBR, 2D/3D sync) only partially evidenced — full Phase 6 gap analysis still required |
| BIM / structural / MEP / IFC / clash detection | NOT IMPLEMENTED (no evidence) | No IFC import/export, clash-detection or structural-analysis modules found in `main` routing; treat as new programme, not a fix |
| Site management (diary, photos, geo, inspection) | PARTIAL | Pages routed and live; project-scoped upgrades stacked in open #277/#278 |
| Excel template system | PARTIAL | Implemented in open PRs #286/#309, **not in `main`** |
| Project workspace isolation | PARTIAL | Projects + workspace sync exist; per-project isolation of every module is the open #277–#281 stack |
| Subscription & entitlements | NEEDS TESTING | Plan gates (`PlanFeatureGate`) used across routes; server-side entitlement enforcement is covered for AI credits; trial/downgrade rules **unproven** (#283 unmerged) — Phase 11 must verify Free users cannot reach paid features via direct API calls |
| Affiliate system | COMPLETED (code) / NEEDS TESTING | Referral tracking, atomic payout migration, affiliate tests in `main`; admin center merged (#313) |
| Excel/BOQ exports, reports | NEEDS TESTING | Export components present; correctness under Phase 4 tests |
| PWA / offline / push | PARTIAL | Install prompt component (`InstallCivilOS.tsx`) and update banner present; offline data safety improved by #334's local-first sync; push notifications: no implementation evidence found |
| Contact/support email unification (#49 §6) | COMPLETED in PR #353 (pending merge) | Footer already correct; Privacy/Terms fixed in PR #353 |

## 3. Notable defects and risks found by this audit

### 3.1 Floating AI assistant — the component is not in `main`
`src/components/FloatingAssistant.tsx` existed only in PR #259
("compact, draggable, and reliable"), which was **closed without
merging**. Code search finds **no floating-assistant component
anywhere in current `main`**. Two possibilities, both P0-relevant:
(a) the production site runs a build that still contains an older
floating assistant (deployment drift, same class as #335) — its
"no response" failures would come from that stale build and its
calls into the drifted `ai-chat` deployment; or (b) the feature was
removed from `main` and the production expectation is stale. Either
way: decide the canonical assistant surface (the routed
`/ai-engineer` page), then either restore a fixed floating widget
that calls the current `ai-chat` contract with visible error states
and timeouts, or formally retire it. "Sometimes no response" is
consistent with the #335 evidence: the deployed `ai-chat` was
returning 500 (`LOVABLE_API_KEY not configured`) while the source
was already fixed.

### 3.2 Duplicate migration version
Three migrations share version `20261103120000`
(`affiliate_payout_atomic_audit`, `create_user_workspace`,
`homepage_hero_model_management`). Supabase keys migration history by
that version; duplicates make apply/order ambiguous on a fresh
environment. Fix only with production `migration list` in hand:
rename the not-yet-applied ones to unique timestamps; never rename
one already applied in production.

### 3.3 Repository hygiene
Root contains many `*.txt` audit dumps and a full duplicate tree
(`civilos-phase3 (1)/`), plus `CivilOS-AI-Security-Patch-1/`. Dead
trees confuse code search, audits and reviewers (several findings in
this audit had to be disambiguated against them). Also orphaned in
`src`: `AIAssistantPage.tsx` (unrouted; #49 PR B) and
`ComingSoonPage.tsx` (unrouted).

### 3.4 Scans (current `main`, code search)
- `FIXME`: **0**. `TODO`: only in `roadmap.md` and
  `src/lib/cad2d/export.ts` (+ its test) — small, trackable.
- `verify_jwt = false`: only the two intentional, handler-guarded
  cases in `supabase/config.toml` (`agent` cron path,
  `track-referral-event` anonymous clicks).
- CORS: every Edge Function sets CORS headers; admin functions use an
  origin allowlist (verified for `admin-user-data`); AI functions
  verified during the #338 audit.
- Open issues: exactly 3 — #335 (P0), #338 (P1), #49 (roadmap).

## 4. Priority action list (mission order)

**P0 — security / auth / data integrity / broken production**
1. Execute the #335 production rollout (PR #352 checklist): apply
   migrations staging-first (resolves §3.2 knowingly), redeploy
   `ai-chat`/`ai-floorplan` from source, two-user RLS check.
2. Resolve §3.1: confirm what production actually serves for the
   floating assistant; restore-fixed or retire, in writing.
3. Land #331 (SECURITY DEFINER identity probing) independently if it
   applies cleanly to `main`.
4. Reproduce the Google OAuth redirect loop on staging (Phase 12);
   no fix is evidenced in `main` yet.
5. Grant the GitHub App **Checks** read permission so CI results —
   the gate for every merge below — become verifiable (§0).

**P1 — admin / subscription / AI infrastructure**
6. #321 rebase-and-trim (§1.1), then #325, then #330; review
   #315–#318/#320 against the result.
7. Verify subscription entitlements server-side (Phase 11),
   including the unproven trial rules (#283).
8. AI provider architecture (Phase 3): add provider abstraction +
   fallback in `ai-chat` first (OpenAI↔OpenRouter), admin-visible
   config later; do not scatter per-provider code per function.

**P2 — estimation / BOQ / BBS / CAD**
9. Merge-review #230 (BOQ double counting), #120, #156, #169, #174.
10. #49 stages B–G (PR #353 plan): legacy history import, assistant
    modes, unified CAD workspace, editor essentials, PDF/DXF.

**P3 — 3D / BIM / structural**
11. Phase 6 gap analysis against PR #24's merged scope before any
    new 3D work; BIM/IFC is a new programme (§2), schedule it as one.

**P4 — site / Excel / PWA**
12. Decide #286 vs #309 (two Excel-library PRs — pick one mainline),
    then the #277–#281 project-scope stack in order.
13. Push notifications and offline/PWA hardening after P0–P2 settle.

## 5. What this audit did not do

No code was changed by the audit itself. No PR was merged. No
production system was touched. Classifications marked NEEDS TESTING
must be converted by Phase 14's test runs once CI visibility (§0) and
a staging environment are available.
