# Unified Project Workspace — implementation plan

## Goal
Every saved result produced by a CivilOS AI module belongs to one selected project. The user can later reopen it, export the project as one archive, or share it with explicitly authorized collaborators.

## Foundation in this PR
- Adds `project_artifacts` as a project-scoped registry for module outputs and references to files stored in private Supabase Storage.
- Adds `project_exports` as the job/status/manifest registry for whole-project exports.
- Applies RLS so project members can read artifacts and export-job status, while only project admins/engineers can add or edit artifacts and request exports.
- Does not replace existing `projects`, `project_documents`, `project_members`, invitations, or activity tables.

## Artifact contract
Each module should save an artifact with:
- `project_id`: the currently selected project UUID (required).
- `artifact_type`: stable module identifier such as `floor_plan`, `cad_drawing`, `boq`, `estimate`, `bbs`, `bim_model`, `qa_qc_report`, `schedule`, or `gis_data`.
- `title`: user-visible name.
- `data`: structured JSON when applicable.
- `storage_path`, `file_name`, `mime_type`: optional reference to the original file in private Storage.
- `metadata`: format/version/units and module-specific details.

Do not store large binary files as base64 in JSON. Upload them to a private Storage bucket and store only their path and metadata here. Never trust a client-supplied user ID or project role; RLS must remain the authorization boundary.

## Whole-project export lifecycle
1. The client requests an export by inserting a `project_exports` row.
2. An authenticated Edge Function validates the caller's membership and role again, then assembles a manifest from project metadata, artifacts, documents, and supported module data.
3. The server downloads only authorized files from private Storage and builds a ZIP with clear folders and a manifest.
4. The ZIP is uploaded to a private export bucket; the job is marked `completed` with a storage path, file size, manifest and expiry.
5. The client obtains a short-lived signed download URL only after server-side authorization. Do not make private project exports public.
6. Failures update the job to `failed` with a safe error code/message; never silently omit files.

## Sharing lifecycle
Reuse existing project membership/invitation functionality where possible. Public share links, if added, must use cryptographically random tokens stored hashed, revocation/expiry controls, least-privilege read-only access, and server-side checks. Never expose private artifacts by weakening broad Storage policies.

## Follow-up implementation phases
1. Wire every module's save/load path to `project_artifacts` or its existing project-scoped data model.
2. Add a project-level artifacts/documents view and autosave status (Saving / Saved / Retry).
3. Implement an authenticated export Edge Function and private export bucket, with ZIP generation and complete manifest.
4. Add import/restore with schema-version checks and partial-failure reporting.
5. Connect secure sharing to the existing invitations and project membership UI.
6. Test cross-user isolation, viewer restrictions, export completeness, large files, and build/deploy.

## Deployment note
This migration is additive but must be applied through the project's normal Supabase migration workflow and tested in staging first. The migration alone does not enable the UI, create the export worker, or make ZIP downloads available yet.
