import type { ProjectArtifact } from "@/lib/projectArtifacts";

type BackupProject = {
  id: string;
  name: string;
  location?: string | null;
  project_type?: string | null;
  status?: string | null;
  budget?: number | null;
  start_date?: string | null;
  end_date?: string | null;
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
export function createProjectWorkspaceBackup(project: BackupProject, artifacts: ProjectArtifact[]) {
  const safeName = (project.name || "project").replace(/[^a-z0-9-_]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 70) || "project";
  const exportedAt = new Date().toISOString();
  const manifest = {
    format: "civilos-project-workspace-backup",
    formatVersion: 1,
    exportedAt,
    project: {
      id: project.id,
      name: project.name,
      location: project.location ?? null,
      project_type: project.project_type ?? null,
      status: project.status ?? null,
      budget: project.budget ?? null,
      start_date: project.start_date ?? null,
      end_date: project.end_date ?? null,
    },
    artifactCount: artifacts.length,
    artifacts: artifacts.map(({ id, artifact_type, title, description, file_name, mime_type, storage_path, created_at, updated_at }) => ({
      id, artifact_type, title, description, file_name, mime_type,
      hasPrivateStorageFile: Boolean(storage_path), created_at, updated_at,
    })),
    limitations: [
      "This backup contains project metadata and structured workspace artifact data.",
      "Private uploaded binary files and legacy project documents are not embedded; download them separately from the Project Documents tab.",
      "Restoring a backup must respect the destination project's membership and row-level security policies.",
    ],
  };
  const entries: ZipEntry[] = [
    { name: "manifest.json", bytes: encoder.encode(JSON.stringify(manifest, null, 2)) },
    { name: "project/project.json", bytes: encoder.encode(JSON.stringify(manifest.project, null, 2)) },
    { name: "README.txt", bytes: encoder.encode(
      "CivilOS AI — Project Workspace Backup\n\n" +
      "This ZIP contains a JSON manifest and structured workspace artifacts.\n" +
      "Artifacts are separated into artifacts/ by artifact type and safe title.\n" +
      "Private binary files and legacy project documents are not included.\n" +
      "Treat this archive as project data and store it securely.\n"
    ) },
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
