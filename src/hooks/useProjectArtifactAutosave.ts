import { useEffect, useMemo, useRef, useState } from "react";
import { saveProjectArtifact, type ProjectArtifact, type SaveProjectArtifactInput } from "@/lib/projectArtifacts";

export type ProjectAutosaveStatus = "idle" | "saving" | "saved" | "error";

type AutosaveInput = Omit<SaveProjectArtifactInput, "id"> & {
  /** Existing artifact ID; omit on first save. */
  artifactId?: string;
  /** Set false when the editor is read-only or has no project selected. */
  enabled?: boolean;
  /** Debounce delay in milliseconds. */
  debounceMs?: number;
};

type AutosaveResult = {
  status: ProjectAutosaveStatus;
  artifactId: string | null;
  lastSavedAt: Date | null;
  error: string | null;
  saveNow: () => Promise<ProjectArtifact | null>;
};

/**
 * Debounced project artifact autosave.
 *
 * Use only for editors whose state is serializable JSON. File uploads should first
 * upload to private Storage and then save the resulting storage path as artifact metadata.
 */
export function useProjectArtifactAutosave(input: AutosaveInput): AutosaveResult {
  const [status, setStatus] = useState<ProjectAutosaveStatus>("idle");
  const [artifactId, setArtifactId] = useState<string | null>(input.artifactId ?? null);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  const serializedData = useMemo(() => JSON.stringify(input.data ?? {}), [input.data]);
  const serializedMetadata = useMemo(() => JSON.stringify(input.metadata ?? {}), [input.metadata]);

  const performSave = async (): Promise<ProjectArtifact | null> => {
    if (input.enabled === false || !input.projectId) return null;
    if (inFlight.current) return null;

    inFlight.current = true;
    setStatus("saving");
    setError(null);

    try {
      const saved = await saveProjectArtifact({
        id: artifactId ?? undefined,
        projectId: input.projectId,
        artifactType: input.artifactType,
        title: input.title,
        description: input.description,
        data: JSON.parse(serializedData) as Record<string, unknown>,
        metadata: JSON.parse(serializedMetadata) as Record<string, unknown>,
        storagePath: input.storagePath,
        fileName: input.fileName,
        mimeType: input.mimeType,
      });
      setArtifactId(saved.id);
      setLastSavedAt(new Date(saved.updated_at));
      setStatus("saved");
      return saved;
    } catch (cause) {
      setStatus("error");
      setError(cause instanceof Error ? cause.message : "Could not save this project artifact.");
      return null;
    } finally {
      inFlight.current = false;
    }
  };

  useEffect(() => {
    if (input.enabled === false || !input.projectId) {
      setStatus("idle");
      return;
    }

    const timer = window.setTimeout(() => {
      void performSave();
    }, Math.max(500, input.debounceMs ?? 1200));

    return () => window.clearTimeout(timer);
    // Serialized JSON values avoid triggering a save merely because a parent recreated an object.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    input.enabled,
    input.projectId,
    input.artifactType,
    input.title,
    input.description,
    input.storagePath,
    input.fileName,
    input.mimeType,
    input.debounceMs,
    serializedData,
    serializedMetadata,
  ]);

  return { status, artifactId, lastSavedAt, error, saveNow: performSave };
}
