export const DRAWING_ACCEPT = ".pdf,.jpg,.jpeg,.png,.webp,.dxf,.dwg";
export const MAX_DRAWING_FILE_BYTES = 20 * 1024 * 1024;

export type DrawingFileKind = "image" | "pdf" | "dxf";
export type DrawingType =
  | "architectural" | "structural" | "foundation" | "column-layout" | "beam-layout"
  | "slab-layout" | "floor-plan" | "section" | "elevation" | "site-plan"
  | "plumbing" | "electrical" | "road" | "bridge" | "general" | "unknown";

export interface DrawingInspection {
  ok: true;
  kind: DrawingFileKind;
  mimeType: string;
  drawingType: DrawingType;
  typeSource: "filename" | "cad-layers" | "unknown";
  warnings: string[];
}

export type DrawingInspectionResult = DrawingInspection | { ok: false; error: string };

const extensionOf = (name: string) => name.toLowerCase().split(".").pop() ?? "";

function hasBytes(head: Uint8Array, bytes: number[], offset = 0): boolean {
  return bytes.every((byte, index) => head[offset + index] === byte);
}

function matchesFileSignature(ext: string, head: Uint8Array): boolean {
  switch (ext) {
    case "jpg":
    case "jpeg":
      return head.length >= 3 && hasBytes(head, [0xff, 0xd8, 0xff]);
    case "png":
      return head.length >= 8 && hasBytes(head, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case "webp":
      return head.length >= 12 && String.fromCharCode(...head.slice(0, 4)) === "RIFF"
        && String.fromCharCode(...head.slice(8, 12)) === "WEBP";
    case "pdf":
      return head.length >= 5 && String.fromCharCode(...head.slice(0, 5)) === "%PDF-";
    case "dxf": {
      if (!head.length || head.includes(0)) return false;
      const sample = new TextDecoder().decode(head);
      return /(?:^|\r?\n)\s*0\s*\r?\n\s*SECTION\s*(?:\r?\n|$)/i.test(sample)
        || /\bENTITIES\b/i.test(sample);
    }
    default:
      return false;
  }
}

const TYPE_RULES: Array<{ type: DrawingType; rx: RegExp }> = [
  { type: "foundation", rx: /foundation|footing|pile|raft|ফাউন্ডেশন/i },
  { type: "column-layout", rx: /column|col(?:umn)?[-_ ]?layout|কলাম/i },
  { type: "beam-layout", rx: /beam|girder|বিম/i },
  { type: "slab-layout", rx: /slab|roof[-_ ]?plan|স্ল্যাব/i },
  { type: "structural", rx: /structural|structure|rebar|reinforcement|bbs|স্ট্রাকচার/i },
  { type: "plumbing", rx: /plumb|sanitary|drainage|water[-_ ]?supply|প্লাম্ব/i },
  { type: "electrical", rx: /electrical|lighting|power[-_ ]?layout|বৈদ্যুতিক/i },
  { type: "road", rx: /road|highway|pavement|সড়ক/i },
  { type: "bridge", rx: /bridge|culvert|সেতু/i },
  { type: "site-plan", rx: /site[-_ ]?plan|layout[-_ ]?plan|plot[-_ ]?plan|সাইট প্ল্যান/i },
  { type: "section", rx: /section|cross[-_ ]?section|longitudinal/i },
  { type: "elevation", rx: /elevation|facade|ফ্যাসাড/i },
  { type: "floor-plan", rx: /floor[-_ ]?plan|ground[-_ ]?floor|first[-_ ]?floor|floorplan|ফ্লোর প্ল্যান/i },
  { type: "architectural", rx: /architectural|architecture|room[-_ ]?layout|architect|আর্কিটেকচার/i },
];

export function detectDrawingType(fileName: string, layers: string[] = []): {
  type: DrawingType;
  source: DrawingInspection["typeSource"];
} {
  for (const rule of TYPE_RULES) {
    if (rule.rx.test(fileName)) return { type: rule.type, source: "filename" };
  }
  const layerText = layers.join(" ");
  for (const rule of TYPE_RULES) {
    if (rule.rx.test(layerText)) return { type: rule.type, source: "cad-layers" };
  }
  return { type: "unknown", source: "unknown" };
}

/**
 * Validates file type using the extension AND its actual signature.
 * DWG is detected intentionally but rejected until a trusted DWG-to-DXF conversion
 * service is integrated; metadata-only analysis must never masquerade as geometry analysis.
 */
export function inspectDrawingHeader(
  file: { name: string; size: number },
  head: Uint8Array,
): DrawingInspectionResult {
  const ext = extensionOf(file.name);
  const supported = ["jpg", "jpeg", "png", "webp", "pdf", "dxf"];
  if (ext === "dwg") {
    return { ok: false, error: "DWG ফাইল শনাক্ত হয়েছে, কিন্তু ব্রাউজারে এর জ্যামিতি নির্ভরযোগ্যভাবে পড়া যায় না। AutoCAD/BricsCAD/LibreCAD থেকে ASCII DXF হিসেবে Export করে আপলোড করুন।" };
  }
  if (!supported.includes(ext)) {
    return { ok: false, error: "Unsupported file type. Upload PDF, JPG, PNG, WEBP or ASCII DXF drawings only." };
  }
  if (file.size <= 0) return { ok: false, error: "The selected file is empty." };
  if (file.size > MAX_DRAWING_FILE_BYTES) {
    return { ok: false, error: "File size exceeds 20 MB. Export or compress the drawing and upload again." };
  }
  if (!matchesFileSignature(ext, head)) {
    return { ok: false, error: "The file content does not match its extension. It may be corrupted or renamed; upload the original drawing file." };
  }

  const kind: DrawingFileKind = ext === "pdf" ? "pdf" : ext === "dxf" ? "dxf" : "image";
  const mimeType = ext === "pdf" ? "application/pdf"
    : ext === "dxf" ? "application/dxf"
      : ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
  const classification = detectDrawingType(file.name);
  const warnings = classification.type === "unknown"
    ? ["Drawing type could not be identified from the file name. AI analysis will provide a suggested type; verify it before using the drawing."]
    : [];
  return {
    ok: true,
    kind,
    mimeType,
    drawingType: classification.type,
    typeSource: classification.source,
    warnings,
  };
}

export async function inspectDrawingFile(file: File): Promise<DrawingInspectionResult> {
  const head = new Uint8Array(await file.slice(0, 1024).arrayBuffer());
  const result = inspectDrawingHeader(file, head);
  if (!result.ok) return result;

  if (result.kind === "image") {
    try {
      const bitmap = await createImageBitmap(file);
      const valid = bitmap.width >= 256 && bitmap.height >= 256;
      const dimensions = `${bitmap.width}×${bitmap.height}`;
      bitmap.close?.();
      if (!valid) return { ok: false, error: `Image resolution is too small (${dimensions}). Export the drawing at a higher resolution (at least 256×256 px).` };
    } catch {
      return { ok: false, error: "The image could not be decoded. It may be corrupted or use an unsupported encoding." };
    }
  }

  if (result.kind === "dxf") {
    const sample = await file.slice(0, Math.min(file.size, 5 * 1024 * 1024)).text();
    if (!/\bSECTION\b/i.test(sample) || !/\bENTITIES\b/i.test(sample)) {
      return { ok: false, error: "DXF does not contain a readable ENTITIES section. Re-export it as ASCII DXF." };
    }
    if (file.size > 5 * 1024 * 1024) {
      return { ...result, warnings: [...result.warnings, "Large DXF: only the first 5 MB is sent to the AI text review in this phase. Use the visualization DXF importer for geometry parsing."] };
    }
  }
  return result;
}
