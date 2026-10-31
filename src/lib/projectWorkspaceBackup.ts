import type { ProjectArtifact } from "@/lib/projectArtifacts";

type BackupProject = {
  id: string;
  name: string;
  client_name?: string | null;
  location?: string | null;
  project_type?: string | null;
  status?: string | null;
  budget?: number | null;
  start_date?: string | null;
  end_date?: string | null;
  file_name?: string | null;
  inputs?: unknown;
  estimate?: unknown;
  bnbc_loads?: unknown;
};

export type WorkspaceBinaryFile = { path: string; bytes: Uint8Array; sourceName: string };
export type WorkspaceDocumentRecord = {
  id: string; file_name: string; file_type?: string | null; file_size?: number | null;
  created_at?: string | null; file_url?: string | null;
};

const encoder = new TextEncoder();
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  crcTable[n] = c >>> 0;
}

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function u16(view: DataView, offset: number, value: number) { view.setUint16(offset, value, true); }
function u32(view: DataView, offset: number, value: number) { view.setUint32(offset, value >>> 0, true); }

function dosDateTime(date: Date) {
  const year = Math.max(1980, date.getFullYear());
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

type ZipEntry = { name: string; bytes: Uint8Array };

function createZip(entries: ZipEntry[]) {
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;
  const stamp = dosDateTime(new Date());

  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const checksum = crc32(entry.bytes);
    const local = new Uint8Array(30 + name.length);
    const lv = new DataView(local.buffer);
    u32(lv, 0, 0x04034b50); u16(lv, 4, 20); u16(lv, 6, 0x0800);
    u16(lv, 8, 0); u16(lv, 10, stamp.time); u16(lv, 12, stamp.date);
    u32(lv, 14, checksum); u32(lv, 18, entry.bytes.length); u32(lv, 22, entry.bytes.length);
    u16(lv, 26, name.length); u16(lv, 28, 0); local.set(name, 30);
    localParts.push(local, entry.bytes);

    const central = new Uint8Array(46 + name.length);
    const cv = new DataView(central.buffer);
    u32(cv, 0, 0x02014b50); u16(cv, 4, 20); u16(cv, 6, 20);
    u16(cv, 8, 0x0800); u16(cv, 10, 0);
    u16(cv, 12, stamp.time); u16(cv, 14, stamp.date);
    u32(cv, 16, checksum); u32(cv, 20, entry.bytes.length); u32(cv, 24, entry.bytes.length);
    u16(cv, 28, name.length); u16(cv, 30, 0); u16(cv, 32, 0);
    u16(cv, 34, 0); u16(cv, 36, 0); u32(cv, 38, 0); u32(cv, 42, offset);
    central.set(name, 46);
    centralParts.push(central);
    offset += local.length + entry.bytes.length;
  }

  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  u32(ev, 0, 0x06054b50); u16(ev, 4, 0); u16(ev, 6, 0);
  u16(ev, 8, entries.length); u16(ev, 10, entries.length);
  u32(ev, 12, centralSize); u32(ev, 16, offset); u16(ev, 20, 0);
  const all = [...localParts, ...centralParts, end];
  const total = all.reduce((sum, part) => sum + part.length, 0);
  const result = new Uint8Array(total);
  let cursor = 0;
  for (const part of all) { result.set(part, cursor); cursor += part.length; }
  return result;
}

/**
 * Creates a ZIP-compatible, uncompressed workspace backup. It includes project metadata
 * and structured artifacts; it deliberately does not include private uploaded binary files.
 */
export function createProjectWorkspaceBackup(
  project: BackupProject,
  artifacts: ProjectArtifact[],
  documents: WorkspaceDocumentRecord[] = [],
  binaryFiles: WorkspaceBinaryFile[] = [],
  omittedFiles: string[] = [],
) {
  const safeName = (project.name || "project").replace(/[^a-z0-9-_]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 70) || "project";
  const exportedAt = new Date().toISOString();
  const manifest = {
    format: "civilos-project-workspace-backup",
    formatVersion: 1,
    exportedAt,
    project: {
      id: project.id,
      name: project.name,
      client_name: project.client_name ?? null,
      location: project.location ?? null,
      project_type: project.project_type ?? null,
      status: project.status ?? null,
      budget: project.budget ?? null,
      start_date: project.start_date ?? null,
      end_date: project.end_date ?? null,
      file_name: project.file_name ?? null,
      inputs: project.inputs ?? null,
      estimate: project.estimate ?? null,
      bnbc_loads: project.bnbc_loads ?? null,
    },
    artifactCount: artifacts.length,
    documentCount: documents.length,
    includedBinaryFileCount: binaryFiles.length,
    omittedFiles, 
    documents: documents.map(({ id, file_name, file_type, file_size, created_at }) => ({
      id, file_name, file_type: file_type ?? null, file_size: file_size ?? null, created_at: created_at ?? null,
    })),
    artifacts: artifacts.map(({ id, artifact_type, title, description, file_name, mime_type, storage_path, created_at, updated_at }) => ({
      id, artifact_type, title, description, file_name, mime_type,
      hasPrivateStorageFile: Boolean(storage_path), created_at, updated_at,
    })),
    limitations: [
      "This backup contains project metadata and structured workspace artifact data.",
      "Uploaded project documents and saved artifact binary files are embedded when their private storage objects can be downloaded.",
      "Files listed in omittedFiles could not be included; check storage permissions and retry the export.",
      "Restoring a backup must respect the destination project's membership and row-level security policies.",
    ],
  };
  const entries: ZipEntry[] = [
    { name: "manifest.json", bytes: encoder.encode(JSON.stringify(manifest, null, 2)) },
    { name: "project/project.json", bytes: encoder.encode(JSON.stringify(manifest.project, null, 2)) },
    { name: "project/documents.json", bytes: encoder.encode(JSON.stringify(manifest.documents, null, 2)) },
    { name: "README.txt", bytes: encoder.encode(
      "CivilOS AI — Project Workspace Backup\n\n" +
      "This ZIP contains project metadata, structured workspace artifacts, and downloaded project files.\n" +
      "Artifacts are separated into artifacts/ by artifact type and safe title.\n" +
      "Uploaded files are stored under uploaded-files/. See manifest.json for any files that could not be included.\n" +
      "Treat this archive as confidential project data and store it securely.\n"
    ) },
    ...binaryFiles.map((file, index) => ({
      name: file.path.replace(/^\\/+/, "").split("/").map((part) => part.replace(/\\.\\./g, "_")).join("/"),
      bytes: file.bytes,
    })),
    ...artifacts.map((artifact, index) => {
      const base = (artifact.title || artifact.artifact_type || "artifact")
        .replace(/[^a-z0-9-_]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 65) || "artifact";
      const type = (artifact.artifact_type || "other").replace(/[^a-z0-9-_]+/gi, "-").slice(0, 35) || "other";
      return {
        name: `artifacts/${type}/${String(index + 1).padStart(3, "0")}-${base}.json`,
        bytes: encoder.encode(JSON.stringify(artifact, null, 2)),
      };
    }),
  ];
  return {
    fileName: `civilos-${safeName}-workspace-${new Date().toISOString().slice(0, 10)}.zip`,
    blob: new Blob([createZip(entries)], { type: "application/zip" }),
    exportedAt,
    artifactCount: artifacts.length,
  };
}

export type ImportedWorkspaceArtifact = {
  id?: string;
  artifact_type: string;
  title: string;
  description?: string | null;
  data?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
};

export type ParsedWorkspaceBackup = {
  manifest: {
    format: string;
    formatVersion: number;
    artifactCount: number;
    project?: { id?: string; name?: string };
  };
  artifacts: ImportedWorkspaceArtifact[];
};

/** Reads only the uncompressed ZIP format generated by createProjectWorkspaceBackup. */
export async function readProjectWorkspaceBackup(file: File): Promise<ParsedWorkspaceBackup> {
  const MAX_BYTES = 200 * 1024 * 1024;
  const MAX_ENTRIES = 1000;
  if (file.size <= 0 || file.size > MAX_BYTES) throw new Error("Backup ZIP must be between 1 byte and 200 MB.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const read16 = (offset: number) => view.getUint16(offset, true);
  const read32 = (offset: number) => view.getUint32(offset, true);
  const eocdSignature = 0x06054b50;
  let eocd = -1;
  const min = Math.max(0, bytes.length - 22 - 65535);
  for (let offset = bytes.length - 22; offset >= min; offset--) {
    if (offset >= 0 && read32(offset) === eocdSignature) { eocd = offset; break; }
  }
  if (eocd < 0) throw new Error("This file is not a valid CivilOS workspace ZIP backup.");
  const diskNumber = read16(eocd + 4);
  const centralDiskNumber = read16(eocd + 6);
  const entriesOnDisk = read16(eocd + 8);
  const entriesCount = read16(eocd + 10);
  const centralSize = read32(eocd + 12);
  const centralOffset = read32(eocd + 16);
  const commentLength = read16(eocd + 20);
  if (
    diskNumber !== 0 ||
    centralDiskNumber !== 0 ||
    entriesOnDisk !== entriesCount ||
    eocd + 22 + commentLength !== bytes.length ||
    entriesCount > MAX_ENTRIES ||
    centralOffset > eocd ||
    centralOffset + centralSize > eocd ||
    centralOffset + centralSize !== eocd
  ) {
    throw new Error("The backup ZIP directory is invalid or too large.");
  }

  const decoder = new TextDecoder();
  const files = new Map<string, string>();
  let cursor = centralOffset;
  let totalUncompressed = 0;
  for (let index = 0; index < entriesCount; index++) {
    if (cursor + 46 > bytes.length || read32(cursor) !== 0x02014b50) {
      throw new Error("The backup ZIP contains an invalid directory entry.");
    }
    const flags = read16(cursor + 8);
    const method = read16(cursor + 10);
    const expectedCrc = read32(cursor + 16);
    const compressedSize = read32(cursor + 20);
    const uncompressedSize = read32(cursor + 24);
    const nameLength = read16(cursor + 28);
    const extraLength = read16(cursor + 30);
    const commentLength = read16(cursor + 32);
    const localOffset = read32(cursor + 42);
    const entryEnd = cursor + 46 + nameLength + extraLength + commentLength;
    if (entryEnd > centralOffset + centralSize) {
      throw new Error("The backup ZIP contains a truncated directory entry.");
    }
    const nameBytes = bytes.subarray(cursor + 46, cursor + 46 + nameLength);
    const name = decoder.decode(nameBytes);
    cursor = entryEnd;
    if (
      !name ||
      name.startsWith("/") ||
      name.includes("\\") ||
      /^[a-z]:/i.test(name) ||
      name.split("/").some((part) => part === ".." || part === ".")
    ) {
      throw new Error("The backup ZIP contains an unsafe file path.");
    }
    if (name.endsWith("/")) continue;
    if (flags & 0x0001) throw new Error("Encrypted ZIP entries are not supported.");
    if (method !== 0) throw new Error("This ZIP uses compression not supported by the CivilOS workspace importer.");
    totalUncompressed += uncompressedSize;
    if (totalUncompressed > MAX_BYTES || compressedSize !== uncompressedSize) {
      throw new Error("The backup contents exceed the supported 200 MB size.");
    }
    if (localOffset + 30 > bytes.length || read32(localOffset) !== 0x04034b50) {
      throw new Error("The backup ZIP contains an invalid file header.");
    }
    const localFlags = read16(localOffset + 6);
    const localMethod = read16(localOffset + 8);
    const localCrc = read32(localOffset + 14);
    const localCompressedSize = read32(localOffset + 18);
    const localUncompressedSize = read32(localOffset + 22);
    const localNameLength = read16(localOffset + 26);
    const localExtraLength = read16(localOffset + 28);
    const localNameStart = localOffset + 30;
    const localNameEnd = localNameStart + localNameLength;
    const dataStart = localNameEnd + localExtraLength;
    const dataEnd = dataStart + compressedSize;
    if (dataStart > bytes.length || dataEnd > centralOffset) {
      throw new Error("The backup ZIP contains a truncated or overlapping file.");
    }
    const localName = decoder.decode(bytes.subarray(localNameStart, localNameEnd));
    if (
      localName !== name ||
      localMethod !== method ||
      localFlags !== flags ||
      localCrc !== expectedCrc ||
      localCompressedSize !== compressedSize ||
      localUncompressedSize !== uncompressedSize
    ) {
      throw new Error("The backup ZIP file header does not match its directory entry.");
    }
    const fileBytes = bytes.subarray(dataStart, dataEnd);
    if (crc32(fileBytes) !== expectedCrc) {
      throw new Error(`Checksum validation failed for ${name}.`);
    }
    if (name === "manifest.json" || name.startsWith("artifacts/") && name.endsWith(".json")) {
      if (files.has(name)) throw new Error(`The backup ZIP contains duplicate entry ${name}.`);
      files.set(name, decoder.decode(fileBytes));
    }
  }

  const manifestText = files.get("manifest.json");
  if (!manifestText) throw new Error("This ZIP does not contain a CivilOS workspace manifest.");
  let manifest: ParsedWorkspaceBackup["manifest"];
  try { manifest = JSON.parse(manifestText); } catch { throw new Error("The workspace manifest is not valid JSON."); }
  if (manifest?.format !== "civilos-project-workspace-backup" || manifest?.formatVersion !== 1) {
    throw new Error("Unsupported workspace backup format or version.");
  }

  const artifacts: ImportedWorkspaceArtifact[] = [];
  for (const [name, raw] of files) {
    if (!name.startsWith("artifacts/")) continue;
    let artifact: any;
    try { artifact = JSON.parse(raw); } catch { throw new Error(`Invalid artifact JSON in ${name}.`); }
    if (!artifact || typeof artifact.artifact_type !== "string" || typeof artifact.title !== "string" || !artifact.title.trim()) {
      throw new Error(`An artifact in ${name} is missing required fields.`);
    }
    artifacts.push({
      id: typeof artifact.id === "string" ? artifact.id : undefined,
      artifact_type: artifact.artifact_type,
      title: artifact.title,
      description: typeof artifact.description === "string" ? artifact.description : null,
      data: artifact.data && typeof artifact.data === "object" && !Array.isArray(artifact.data) ? artifact.data : {},
      metadata: artifact.metadata && typeof artifact.metadata === "object" && !Array.isArray(artifact.metadata) ? artifact.metadata : {},
    });
  }
  if (artifacts.length !== manifest.artifactCount) {
    throw new Error("Artifact count does not match the manifest. The backup may be incomplete.");
  }
  return { manifest, artifacts };
}
