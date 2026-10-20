import { fileKind, sniffMatches, type VizFileKind } from "../../../supabase/functions/viz-analyze/normalize";

export interface UploadLimits { maxFileMb: number; maxFiles: number }
export const DEFAULT_LIMITS: UploadLimits = { maxFileMb: 25, maxFiles: 10 };
export const ACCEPT = ".jpg,.jpeg,.png,.webp,.pdf,.dxf,.dwg";

export type UploadCheck = { ok: true; kind: VizFileKind } | { ok: false; error: string };

/** Pure check: extension, size, count and magic bytes (`head` = first bytes of the file). */
export function checkUpload(f: { name: string; size: number }, head: Uint8Array, limits: UploadLimits, existingCount: number): UploadCheck {
  const kind = fileKind(f.name);
  if (!kind) return { ok: false, error: `"${f.name}": unsupported type. Allowed: JPG, PNG, WEBP, PDF, DXF, DWG.` };
  if (existingCount >= limits.maxFiles) return { ok: false, error: `Maximum ${limits.maxFiles} files per visualization.` };
  if (f.size <= 0) return { ok: false, error: `"${f.name}" is empty.` };
  if (f.size > limits.maxFileMb * 1024 * 1024) return { ok: false, error: `"${f.name}" is ${(f.size / 1048576).toFixed(1)} MB — the limit is ${limits.maxFileMb} MB.` };
  if (!sniffMatches(kind, head)) return { ok: false, error: `"${f.name}": the file content does not match its extension (corrupted or renamed file).` };
  return { ok: true, kind };
}

export async function validateFile(file: File, limits: UploadLimits, existingCount: number): Promise<UploadCheck> {
  const head = new Uint8Array(await file.slice(0, 1024).arrayBuffer());
  return checkUpload(file, head, limits, existingCount);
}
