// Browser-only image helpers: read pixel size, downscale big images, rasterise PDF page 1.
export const MAX_ANALYSIS_BYTES = 7.5 * 1024 * 1024;

export async function readImageSize(blob: Blob): Promise<{ width: number; height: number }> {
  const bmp = await createImageBitmap(blob);
  const r = { width: bmp.width, height: bmp.height }; bmp.close?.();
  return r;
}

async function toJpeg(src: CanvasImageSource, w: number, h: number, quality: number): Promise<Blob> {
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const ctx = c.getContext("2d")!; ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h); ctx.drawImage(src, 0, 0, w, h);
  return await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("Could not encode image"))), "image/jpeg", quality));
}

/** If an image is too heavy for the AI step, make a downscaled JPEG copy (kept as role='derived'). */
export async function downscaleForAnalysis(file: File, maxSide = 3000): Promise<{ blob: Blob; width: number; height: number } | null> {
  const bmp = await createImageBitmap(file);
  try {
    const big = Math.max(bmp.width, bmp.height) > maxSide;
    if (!big && file.size <= MAX_ANALYSIS_BYTES) return null;
    const k = big ? maxSide / Math.max(bmp.width, bmp.height) : 1;
    const w = Math.round(bmp.width * k), h = Math.round(bmp.height * k);
    for (const q of [0.9, 0.8, 0.7, 0.55]) { const b = await toJpeg(bmp, w, h, q); if (b.size <= MAX_ANALYSIS_BYTES) return { blob: b, width: w, height: h }; }
    throw new Error("Image is too large to prepare for analysis even after compression. Export a smaller image.");
  } finally { bmp.close?.(); }
}

/** Rasterise page 1 of a PDF (lazy-loaded pdf.js; runs entirely in the browser). */
export async function rasterizePdf(file: File, maxSide = 2800): Promise<{ blob: Blob; width: number; height: number; pages: number }> {
  const pdfjs = await import("pdfjs-dist");
  const worker = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = worker;
  let doc;
  try { doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise; }
  catch (e) {
    const n = (e as { name?: string })?.name;
    throw new Error(n === "PasswordException" ? "This PDF is password-protected. Remove the password and upload again." : "This PDF could not be read (corrupted or unsupported).");
  }
  try {
    const page = await doc.getPage(1);
    const v1 = page.getViewport({ scale: 1 });
    const scale = Math.min(4, maxSide / Math.max(v1.width, v1.height));
    const vp = page.getViewport({ scale });
    const c = document.createElement("canvas"); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
    const ctx = c.getContext("2d")!; ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    const blob = await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("PDF render failed"))), "image/jpeg", 0.88));
    return { blob, width: c.width, height: c.height, pages: doc.numPages };
  } finally { void doc.destroy(); }
}
