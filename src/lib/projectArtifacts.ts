import { supabase } from "@/integrations/supabase/client";

export type ProjectArtifact = {
  id: string;
  project_id: string;
  artifact_type: string;
  title: string;
  description: string | null;
  data: Record<string, unknown>;
  storage_path: string | null;
  file_name: string | null;
  mime_type: string | null;
  metadata: Record<string, unknown>;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type SaveProjectArtifactInput = {
  id?: string;
  projectId: string;
  artifactType: string;
  title: string;
  description?: string | null;
  data?: Record<string, unknown>;
  storagePath?: string | null;
  fileName?: string | null;
  mimeType?: string | null;
  metadata?: Record<string, unknown>;
};

const cleanText = (value: string, max: number) => value.trim().slice(0, max);

/**
 * List saved artifacts for a project. Supabase RLS remains the authorization boundary;
 * this helper deliberately does not attempt to bypass membership checks.
 */
export async function listProjectArtifacts(projectId: string) {
  if (!projectId) throw new Error("A project ID is required.");

  const { data, error } = await (supabase as any)
    .from("project_artifacts")
    .select("*")
    .eq("project_id", projectId)
    .order("updated_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as ProjectArtifact[];
}

/** Create a new artifact or update a known artifact ID within the given project. */
export async function saveProjectArtifact(input: SaveProjectArtifactInput) {
  if (!input.projectId) throw new Error("A project ID is required.");

  const artifactType = cleanText(input.artifactType, 80);
  const title = cleanText(input.title, 180);
  if (!artifactType) throw new Error("Artifact type is required.");
  if (!title) throw new Error("Artifact title is required.");

  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  if (!authData.user) throw new Error("Sign in to save project artifacts.");

  const payload = {
    project_id: input.projectId,
    artifact_type: artifactType,
    title,
    description: input.description ? cleanText(input.description, 2000) : null,
    data: input.data ?? {},
    storage_path: input.storagePath ?? null,
    file_name: input.fileName ? cleanText(input.fileName, 255) : null,
    mime_type: input.mimeType ? cleanText(input.mimeType, 160) : null,
    metadata: input.metadata ?? {},
    updated_by: authData.user.id,
  };

  const query = (supabase as any).from("project_artifacts");
  const result = input.id
    ? await query.update(payload).eq("id", input.id).eq("project_id", input.projectId).select("*").single()
    : await query.insert({ ...payload, created_by: authData.user.id }).select("*").single();

  if (result.error) throw result.error;
  if (!result.data) throw new Error("The artifact could not be saved.");
  return result.data as ProjectArtifact;
}

export async function deleteProjectArtifact(projectId: string, artifactId: string) {
  if (!projectId || !artifactId) throw new Error("Project and artifact IDs are required.");

  const { error } = await (supabase as any)
    .from("project_artifacts")
    .delete()
    .eq("project_id", projectId)
    .eq("id", artifactId);

  if (error) throw error;
}

/** A download helper for already-uploaded private files; never exposes a public bucket URL. */
export async function createProjectArtifactDownloadUrl(storagePath: string, expiresInSeconds = 60) {
  if (!storagePath) throw new Error("A private storage path is required.");
  const ttl = Math.min(300, Math.max(30, Math.floor(expiresInSeconds)));
  const { data, error } = await supabase.storage
    .from("project-artifacts")
    .createSignedUrl(storagePath, ttl, { download: true });

  if (error) throw error;
  if (!data?.signedUrl) throw new Error("Could not create a secure download link.");
  return data.signedUrl;
}
