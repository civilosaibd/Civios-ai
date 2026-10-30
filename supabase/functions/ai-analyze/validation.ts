export const MAX_AI_ANALYSIS_BODY_BYTES = 12 * 1024 * 1024;
export const MAX_DRAWING_IMAGE_DATA_URL_CHARS = 5 * 1024 * 1024;
export const MAX_DRAWING_IMAGES = 5;
export const MAX_DRAWING_IMAGES_TOTAL_CHARS = 10 * 1024 * 1024;

export interface NumberedDrawingImage {
  pageNumber: number;
  dataUrl: string;
}

export type BodyReadResult =
  | { ok: true; value: unknown }
  | { ok: false; status: 400 | 413; error: string };

/** Read a JSON request body with a streaming byte ceiling, even when Content-Length is absent. */
export async function readJsonBodyLimited(
  request: Request,
  maxBytes = MAX_AI_ANALYSIS_BODY_BYTES,
): Promise<BodyReadResult> {
  const reader = request.body?.getReader();
  if (!reader) return { ok: false, status: 400, error: "Request body is required." };

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel();
        return { ok: false, status: 413, error: "Request too large. Please upload a smaller file." };
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false, status: 400, error: "Could not read request body." };
  } finally {
    reader.releaseLock();
  }

  const bodyBytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bodyBytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return { ok: true, value: JSON.parse(new TextDecoder().decode(bodyBytes)) };
  } catch {
    return { ok: false, status: 400, error: "Request body must contain valid JSON." };
  }
}

/** Verify both the declared raster MIME type and the actual binary signature. */
export function isValidDrawingImageDataUrl(value: unknown, maxChars = MAX_DRAWING_IMAGE_DATA_URL_CHARS): value is string {
  if (typeof value !== "string" || value.length > maxChars) return false;
  const match = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/i.exec(value);
  if (!match) return false;

  try {
    const prefix = atob(match[2].slice(0, 64));
    const bytes = Uint8Array.from(prefix, (char) => char.charCodeAt(0));
    const mime = match[1].toLowerCase();
    if (mime === "jpeg") return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    if (mime === "png") return bytes.length >= 8 && [0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a].every((b,i) => bytes[i] === b);
    return bytes.length >= 12
      && String.fromCharCode(...bytes.slice(0,4)) === "RIFF"
      && String.fromCharCode(...bytes.slice(8,12)) === "WEBP";
  } catch {
    return false;
  }
}

export type DrawingImagesResult =
  | { ok: true; images: NumberedDrawingImage[] }
  | { ok: false; status: 400 | 413; error: string };

/** Validate the bounded page array, including unique source page numbers and binary image signatures. */
export function validateDrawingImages(input: unknown): DrawingImagesResult {
  if (!Array.isArray(input) || input.length < 1 || input.length > MAX_DRAWING_IMAGES) {
    return { ok: false, status: 400, error: "Provide between 1 and 5 numbered drawing pages." };
  }
  const seenPages = new Set<number>();
  let totalChars = 0;
  const images: NumberedDrawingImage[] = [];
  for (const entry of input) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      return { ok: false, status: 400, error: "One or more drawing pages are invalid." };
    }
    const page = entry as Record<string, unknown>;
    if (!Number.isSafeInteger(page.pageNumber) || (page.pageNumber as number) < 1
      || seenPages.has(page.pageNumber as number)
      || !isValidDrawingImageDataUrl(page.dataUrl)) {
      return { ok: false, status: 400, error: "One or more drawing pages are invalid, duplicated or do not contain a valid supported image." };
    }
    seenPages.add(page.pageNumber as number);
    totalChars += (page.dataUrl as string).length;
    images.push({ pageNumber: page.pageNumber as number, dataUrl: page.dataUrl as string });
  }
  if (totalChars > MAX_DRAWING_IMAGES_TOTAL_CHARS) {
    return { ok: false, status: 413, error: "Combined drawing pages exceed the analysis request limit. Upload fewer pages or reduce their resolution." };
  }
  return { ok: true, images };
}
