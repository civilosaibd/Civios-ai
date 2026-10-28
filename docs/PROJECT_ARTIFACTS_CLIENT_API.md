# Project artifact client API

This client API is the frontend adapter for the `project_artifacts` table introduced by the unified project workspace foundation migration.

## Files

- `src/lib/projectArtifacts.ts`: list, create/update, delete, and short-lived signed-download helpers.
- `src/hooks/useProjectArtifactAutosave.ts`: debounced autosave hook for JSON-serializable editor state.

## Example

```tsx
const autosave = useProjectArtifactAutosave({
  projectId,
  artifactType: "floor-plan",
  title: "Ground floor plan",
  data: { units: "mm", walls, openings },
  enabled: Boolean(projectId) && !readOnly,
});

return (
  <span role="status" aria-live="polite">
    {autosave.status === "saving" && "Saving…"}
    {autosave.status === "saved" && "Saved"}
    {autosave.status === "error" && (autosave.error ?? "Save failed")}
  </span>
);
```

Use stable JSON-compatible state and set `enabled: false` for viewers or while a project is not selected. The hook is a reusable building block; it is not automatically attached to every editor in this PR.

## Important deployment requirements

1. Apply the unified workspace migration before calling these functions.
2. Confirm the deployed RLS policies and project-role helper functions in staging.
3. Create a **private** Supabase Storage bucket named `project-artifacts` before using the signed-download helper. Do not make it public.
4. Upload files to a project-scoped path only after validating project membership. Save the storage path—not a public URL—in the artifact row.
5. Signed URLs are short-lived. The helper caps the requested lifetime at five minutes.
6. A successful database write does not mean a file upload or a ZIP export has completed. Whole-project ZIP generation is a separate trusted server-side worker and is not implemented by this client API.

## Authorization and failure handling

The client uses the current Supabase session to set `created_by` / `updated_by`, but those values are not an authorization mechanism. RLS must enforce access. Treat all errors as user-visible save failures and do not display “Saved” until the database confirms the write.

## Current scope

This PR adds a shared API and autosave primitive only. Existing module editors still need to be integrated one by one and tested against their own data models. No claim is made that all modules currently autosave to the project.
