import { describe, expect, it } from "vitest";
import type { ProjectArtifact } from "@/lib/projectArtifacts";
import {
  createProjectWorkspaceBackup,
  readProjectWorkspaceBackup,
} from "@/lib/projectWorkspaceBackup";

const project = {
  id: "project-123",
  name: "Sample Residence / Dhaka",
  location: "Dhaka",
  project_type: "Residential",
  status: "active",
  budget: 2500000,
  start_date: "2026-01-01",
  end_date: "2026-12-31",
};

const artifact: ProjectArtifact = {
  id: "artifact-456",
  project_id: project.id,
  artifact_type: "boq",
  title: "Ground Floor BOQ",
  description: "Initial quantity takeoff",
  data: {
    items: [{ description: "Concrete", quantity: 12.5, unit: "m³" }],
    totals: { subtotal: 125000 },
  },
  storage_path: "private/project-123/report.pdf",
  file_name: "report.pdf",
  mime_type: "application/pdf",
  metadata: { sourceModule: "BOQGeneratorPage", formatVersion: 1 },
  created_by: "user-1",
  updated_by: "user-1",
  created_at: "2026-10-28T10:00:00.000Z",
  updated_at: "2026-10-28T10:30:00.000Z",
};

function readBlobAsArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) resolve(reader.result);
      else reject(new Error("Could not read test ZIP data."));
    };
    reader.onerror = () => reject(reader.error ?? new Error("Could not read test ZIP data."));
    reader.readAsArrayBuffer(blob);
  });
}

function testFile(parts: BlobPart[], name: string) {
  const file = new File(parts, name, { type: "application/zip" });
  // jsdom's File/Blob may not implement arrayBuffer(), although browsers do.
  Object.defineProperty(file, "arrayBuffer", {
    configurable: true,
    value: () => readBlobAsArrayBuffer(file),
  });
  return file;
}

async function backupFile(artifacts: ProjectArtifact[] = [artifact]) {
  const backup = createProjectWorkspaceBackup(project, artifacts);
  return testFile([await readBlobAsArrayBuffer(backup.blob)], backup.fileName);
}

describe("project workspace ZIP backup", () => {
  it("round-trips project manifest and structured artifact data", async () => {
    const file = await backupFile();
    const restored = await readProjectWorkspaceBackup(file);

    expect(restored.manifest.format).toBe("civilos-project-workspace-backup");
    expect(restored.manifest.formatVersion).toBe(1);
    expect(restored.manifest.project).toMatchObject({
      id: project.id,
      name: project.name,
      location: project.location,
    });
    expect(restored.manifest.artifactCount).toBe(1);
    expect(restored.artifacts).toHaveLength(1);
    expect(restored.artifacts[0]).toMatchObject({
      id: artifact.id,
      artifact_type: artifact.artifact_type,
      title: artifact.title,
      description: artifact.description,
      data: artifact.data,
      metadata: artifact.metadata,
    });
  });

  it("does not put private storage paths into restored artifact records", async () => {
    const restored = await readProjectWorkspaceBackup(await backupFile());
    expect(restored.artifacts[0]).not.toHaveProperty("storage_path");
    expect(restored.artifacts[0]).not.toHaveProperty("file_name");
    expect(restored.artifacts[0]).not.toHaveProperty("mime_type");
  });

  it("supports a backup with no artifacts", async () => {
    const restored = await readProjectWorkspaceBackup(await backupFile([]));
    expect(restored.manifest.artifactCount).toBe(0);
    expect(restored.artifacts).toEqual([]);
  });

  it("rejects files that are not ZIP backups", async () => {
    const file = testFile(["not a zip archive"], "invalid.zip");
    await expect(readProjectWorkspaceBackup(file)).rejects.toThrow(
      "not a valid CivilOS workspace ZIP backup",
    );
  });

  it("rejects empty files with a clear error", async () => {
    const file = testFile([], "empty.zip");
    await expect(readProjectWorkspaceBackup(file)).rejects.toThrow(
      "between 1 byte and 50 MB",
    );
  });
  it("rejects a backup whose manifest bytes were corrupted after export", async () => {
    const original = await backupFile();
    const bytes = new Uint8Array(await original.arrayBuffer());
    const marker = new TextEncoder().encode('"format": "civilos-project-workspace-backup"');
    let markerOffset = -1;
    outer: for (let i = 0; i <= bytes.length - marker.length; i++) {
      for (let j = 0; j < marker.length; j++) {
        if (bytes[i + j] !== marker[j]) continue outer;
      }
      markerOffset = i;
      break;
    }
    expect(markerOffset).toBeGreaterThanOrEqual(0);
    bytes[markerOffset + marker.length - 2] ^= 1;
    const corrupted = testFile([bytes], "corrupted.zip");
    await expect(readProjectWorkspaceBackup(corrupted)).rejects.toThrow(
      "Checksum validation failed",
    );
  });

  it("rejects a ZIP whose local header disagrees with its central directory", async () => {
    const original = await backupFile();
    const bytes = new Uint8Array(await original.arrayBuffer());
    const view = new DataView(bytes.buffer);
    let localHeader = -1;
    for (let i = 0; i <= bytes.length - 4; i++) {
      if (view.getUint32(i, true) === 0x04034b50) {
        localHeader = i;
        break;
      }
    }
    expect(localHeader).toBeGreaterThanOrEqual(0);
    // Corrupt the local-header compression method while leaving the central directory intact.
    view.setUint16(localHeader + 8, 8, true);
    const corrupted = testFile([bytes], "mismatched-header.zip");
    await expect(readProjectWorkspaceBackup(corrupted)).rejects.toThrow(
      "file header does not match its directory entry",
    );
  });

  it("rejects ZIPs with trailing bytes after the end-of-central-directory record", async () => {
    const original = await backupFile();
    const bytes = new Uint8Array(await original.arrayBuffer());
    const corrupted = testFile([bytes, new Uint8Array([0])], "trailing-data.zip");
    await expect(readProjectWorkspaceBackup(corrupted)).rejects.toThrow(
      "directory is invalid or too large",
    );
  });

});