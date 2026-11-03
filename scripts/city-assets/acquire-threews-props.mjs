#!/usr/bin/env node
/**
 * Acquire a small, review-only batch of CC0 street props from the public
 * three.ws Object Library. Files are intentionally written to incoming/,
 * never to runtime/. Human visual review is still required before approval.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";

const endpoint = "https://three.ws/api/objects/library";
const outDir = path.resolve("public/assets/city/incoming/three-ws");
const maxAssets = Number(process.env.CITY_ASSET_MAX_COUNT || 10);
const maxFileBytes = Number(process.env.CITY_ASSET_MAX_FILE_BYTES || 12 * 1024 * 1024);
const maxTotalBytes = Number(process.env.CITY_ASSET_MAX_TOTAL_BYTES || 60 * 1024 * 1024);
const dryRun = process.argv.includes("--dry-run");

const wanted = [
  ["street-lamp", /street.?lamp|lamp.?post|streetlight/i],
  ["bench", /park.?bench|street.?bench|bench/i],
  ["bin", /trash.?can|garbage.?bin|rubbish.?bin|waste.?bin/i],
  ["traffic-light", /traffic.?light|signal.?light/i],
  ["road-sign", /road.?sign|street.?sign|traffic.?sign/i],
  ["bollard", /bollard/i],
  ["bus-shelter", /bus.?shelter|bus.?stop/i],
  ["hydrant", /fire.?hydrant/i],
  ["fence", /fence|railing/i],
  ["tree", /tree|planter/i],
  ["bicycle", /bicycle|bike.?rack/i],
  ["street-prop", /mailbox|utility.?box|manhole/i],
];

const response = await fetch(endpoint, { headers: { accept: "application/json" } });
if (!response.ok) throw new Error(`Object library request failed: HTTP ${response.status}`);
const payload = await response.json();
const objects = Array.isArray(payload.objects) ? payload.objects : [];
if (!objects.length) throw new Error("Object library returned no objects; refusing to create an empty acquisition report.");

const candidates = [];
const usedSlots = new Set();
for (const [slot, pattern] of wanted) {
  const match = objects
    .filter((item) => String(item.license || "").toUpperCase() === "CC0")
    .filter((item) => typeof item.url === "string" && item.url.startsWith("https://"))
    .filter((item) => Number(item.bytes) > 0 && Number(item.bytes) <= maxFileBytes)
    .filter((item) => pattern.test([item.name, ...(item.categories || []), ...(item.tags || [])].join(" ")))
    .sort((a, b) => Number(a.bytes) - Number(b.bytes))[0];
  if (match && !usedSlots.has(match.url)) {
    candidates.push({ slot, item: match });
    usedSlots.add(match.url);
  }
}
if (!candidates.length) throw new Error("No matching CC0 street props found within the configured size limit.");

await mkdir(outDir, { recursive: true });
const acquired = [];
let totalBytes = 0;
for (const { slot, item } of candidates) {
  if (acquired.length >= maxAssets) break;
  if (totalBytes + Number(item.bytes) > maxTotalBytes) continue;

  const assetResponse = await fetch(item.url, { redirect: "follow" });
  if (!assetResponse.ok) {
    acquired.push({ slot, name: item.name, url: item.url, status: "download-failed", httpStatus: assetResponse.status });
    continue;
  }
  const bytes = Buffer.from(await assetResponse.arrayBuffer());
  if (bytes.length < 20 || bytes.toString("ascii", 0, 4) !== "glTF") {
    acquired.push({ slot, name: item.name, url: item.url, status: "rejected-not-glb", actualBytes: bytes.length });
    continue;
  }
  if (bytes.length > maxFileBytes || totalBytes + bytes.length > maxTotalBytes) {
    acquired.push({ slot, name: item.name, url: item.url, status: "rejected-size-limit", actualBytes: bytes.length });
    continue;
  }

  const slug = String(item.name || slot).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 64) || slot;
  const filename = `${slot}--${slug}.glb`;
  if (!dryRun) await writeFile(path.join(outDir, filename), bytes);
  totalBytes += bytes.length;
  acquired.push({
    slot, id: item.id || null, name: item.name, filename: dryRun ? null : filename,
    sourceUrl: item.url, license: "CC0", source: item.source || "three.ws object library",
    bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex"),
    status: dryRun ? "dry-run-downloaded-in-memory" : "downloaded-review-only",
    runtimeApproved: false,
  });
}

const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  source: endpoint,
  sourceTotal: payload.total ?? objects.length,
  policy: "CC0-only; incoming review batch; no automatic runtime approval",
  acquiredCount: acquired.filter((x) => x.status === "downloaded-review-only" || x.status === "dry-run-downloaded-in-memory").length,
  totalBytes,
  assets: acquired,
};
if (!dryRun) {
  await writeFile(path.join(outDir, "acquisition-report.json"), JSON.stringify(report, null, 2) + "\n");
}
console.log(JSON.stringify(report, null, 2));
if (!report.acquiredCount) process.exitCode = 1;
