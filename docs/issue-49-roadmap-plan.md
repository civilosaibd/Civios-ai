# Issue #49 — audit and staged implementation plan

Audit date: 2026-11-05, against `main`. This document is the audit and
plan the issue asks for before implementation. Nothing here claims
AutoCAD/Revit parity; CAD stages are scoped to what the current
codebase can honestly support, in verifiable steps.

## 1. AI assistants — current state

| Surface | Route | Component | State |
|---|---|---|---|
| AI Engineering Assistant (canonical) | `/ai-engineer` | `src/pages/AIEngineerPage.tsx` | Live. Multi-conversation chat, searchable history, quick prompts; conversations in `localStorage`. Calls the `ai-chat` Edge Function. |
| AI Engineer Chat (legacy) | `/ai-assistant` | `src/pages/AIAssistantPage.tsx` | **Route already consolidated:** `src/App.tsx` redirects `/ai-assistant` → `/ai-engineer`. The page component is **no longer routed or imported anywhere** — orphaned dead code. It was a single-thread chat using `localStorage` key `civilos-ai-chat`, with BNBC-oriented starter suggestions and no unique capability the canonical page lacks, except its separate stored history. |
| Navigation | — | `src/lib/navigation.ts`, `DashboardSidebar` | Already shows **one** assistant entry ("AI Engineering Assistant" → `/ai-engineer`). No duplicate cards remain in current navigation. |

**Exact gaps / risks**

1. **Stranded history:** users of the legacy page have messages under
   `localStorage["civilos-ai-chat"]`; the canonical page never reads
   that key, so their history silently disappears from view (data is
   not deleted, just unreachable).
2. **Dead code risk:** `AIAssistantPage.tsx` can be re-imported by
   accident, recreating the duplication #49 exists to remove.
3. Neither page labelled modes (Ask / Calculate / Check / Draw guide /
   Document) or document upload yet — those are #49 features still to
   build on the canonical page, reusing its existing thread model
   rather than a new state system.

## 2. Drawing / 3D — current state

| Surface | Route | State |
|---|---|---|
| Floor Plan & 3D Design Studio | `/floor-plan-studio` (`FloorPlanStudioPage`) | Live; prompt/spec → plan via `ai-floorplan`, 2D canvas, Three.js 3D, exports. CAD core lives in `src/lib/cad2d/` (geometry, snapping, wall network/openings, room analysis), with `src/lib/planGenerator.ts` and unit tests for geometry/snap/walls/openings/analysis/export. |
| Plan Generator | `/plan-generator` (`PlanGeneratorPage`) | Live. |
| AI Drawing Analysis | `/ai-drawing` (`AIDrawingPage`) | Live, behind `PlanFeatureGate feature="ai_drawing"`. |
| Visualizations | `/visualizations`, `/visualizations/:id` | Live (`viz-analyze`). |
| IndoCAD | `/indo-cad` (`IndoCADPage`) | **Admin preview only.** Nav entry is `adminOnly`; sidebar shows non-admins a disabled "Coming Soon" item; the page itself renders "Coming Soon" badges for non-admins. |
| Coming Soon page | *(unrouted)* | `ComingSoonPage.tsx` exists but is not imported by `App.tsx`; its own logic reuses existing modules instead of a dead end. |

**Exact gaps vs #49's CAD expectations**

- No unified workspace shell: plan generation, manual 2D editing, 3D
  and exports live in separate routes instead of one model-driven
  workspace (the issue's source-of-truth requirement).
- No layers panel, properties panel, undo/redo history, autosave/
  recovery UI, dimension/annotation toolset in one place yet — the
  geometry foundations (`cad2d`) exist and are tested; the editor UX
  stages are unbuilt.
- No DXF/DWG story: DXF export can be scoped honestly; native DWG
  read/write must not be promised without a licensed SDK.
- IndoCAD's public availability is a product decision, not just code:
  it is currently an admin preview.

## 3. Contact email inventory (#49 section 6)

Product-displayed contact/support emails found on 2026-11-05:

| Location | Before | After this PR |
|---|---|---|
| `src/components/Footer.tsx` | `civilosaibd@gmail.com` | unchanged (already correct) |
| `src/pages/PrivacyPolicyPage.tsx` ("8. Contact us") | personal Gmail | `civilosaibd@gmail.com` |
| `src/pages/TermsOfServicePage.tsx` ("12. Contact") | personal Gmail | `civilosaibd@gmail.com` |
| `src/pages/ContactPage.tsx` | shows a form (no address); footer below it already shows the product address | unchanged |

Deliberately **not** changed, per the issue's own guardrails: the same
personal address inside SQL migrations and test fixtures is an
auth/bootstrap **identity**, not a displayed contact email. Changing
it there would break admin bootstrap and tests. Admin pages render
member emails from data (`mailto:${m.email}`) — also out of scope.

## 4. Staged PR sequence (each independently reviewable)

1. **PR A (this PR)** — contact email unification (section 3) + this
   plan + regression guard test.
   *Acceptance:* Privacy/Terms/Footer show only
   `civilosaibd@gmail.com`; no migration/auth file touched; CI green.
2. **PR B — legacy assistant cleanup.** Delete orphaned
   `AIAssistantPage.tsx`; add one-time import of
   `localStorage["civilos-ai-chat"]` into the canonical page's
   conversation list (marked imported, deduplicated, removable).
   *Acceptance:* `/ai-assistant` still redirects; a seeded legacy key
   appears as an imported conversation; unit tests for the importer;
   no other behaviour change.
3. **PR C — assistant modes.** Add explicit mode selector (Ask,
   Calculate, Check drawing/document, Draw guide, Summarise document)
   on `AIEngineerPage`, passed as structured context to `ai-chat`
   (server keeps financial/permission decisions, per #338's hardened
   endpoint). *Acceptance:* mode is visible, persisted per
   conversation, covered by tests; no second chat surface created.
4. **PR D — workspace shell.** One Drawing & Design workspace route
   that hosts the existing Floor Plan Studio model as the single
   source of truth, with layer list and properties panel reading the
   same model; existing routes redirect into it.
   *Acceptance:* editing in 2D updates the shared model; 3D view reads
   the same model; existing studio tests pass unchanged.
5. **PR E — editor essentials.** Undo/redo, autosave + recovery
   prompt, dimension/annotation tools on the shared model.
   *Acceptance:* undo/redo unit tests; refresh mid-edit recovers the
   draft; dimension values derive from model geometry.
6. **PR F — exports.** Print/PDF sheet output and DXF export from the
   shared model with scale/title-block metadata; DWG explicitly out
   of scope unless a licensed SDK is adopted.
   *Acceptance:* a known test plan exports DXF that re-opens with the
   expected wall geometry within tolerance.
7. **PR G — IndoCAD decision.** Either promote IndoCAD out of admin
   preview into the workspace (if product approves) or fold its
   prompt-to-CAD flow into PR D's shell and retire the separate route
   with a redirect. *Acceptance:* one CAD entry point in navigation.

## 5. Migrations and dependencies

- **PRs A–C, G:** no database migration required. Chat history stays
  client-side (`localStorage`) as today; moving it server-side later
  would reuse `user_workspace` (#335) rather than a new table.
- **PRs D–F:** no migration expected; the plan model stays in existing
  project/workspace storage. If server-side plan versioning is added,
  it needs its own issue, RLS design and tests — not bundled here.
- **Dependencies:** none new for A–C. DXF export (PR F) may add a
  small serializer or be hand-rolled against the existing export tests;
  decide inside that PR. DWG support would require a licensed SDK —
  flagged, not assumed.

## 6. Non-goals (from the issue)

No fake locked modules as the deliverable, no AutoCAD/Revit parity
claims, no unrelated rewrites (billing, auth, admin/RBAC), no
secret/credential changes, and no renaming of admin accounts or auth
identities as part of the email unification.
