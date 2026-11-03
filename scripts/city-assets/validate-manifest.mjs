#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "../..");
const manifestPath = path.join(repoRoot, "public/assets/city/manifest/asset-manifest.json");
const runtimeRoot = path.join(repoRoot, "public/assets/city/runtime");

function fail(message) {
  console.error(`[city-assets] ERROR: ${message}`);
  process.exitCode = 1;
}

if (!fs.existsSync(manifestPath)) {
  fail(`Manifest not found: ${manifestPath}`);
  process.exit();
}

let manifest;
try {
  manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
} catch (error) {
  fail(`Manifest is not valid JSON: ${error.message}`);
  process.exit();
}

if (!Array.isArray(manifest.assets)) {
  fail("Manifest must contain an assets array.");
  process.exit();
}

const seen = new Set();
let approvedCount = 0;

for (const [index, asset] of manifest.assets.entries()) {
  const label = asset?.id || `assets[${index}]`;
  if (!asset || typeof asset !== "object") {
    fail(`${label}: asset entry must be an object.`);
    continue;
  }
  if (typeof asset.id !== "string" || !asset.id.trim()) {
    fail(`${label}: missing stable id.`);
  } else if (seen.has(asset.id)) {
    fail(`${label}: duplicate asset id.`);
  } else {
    seen.add(asset.id);
  }

  if (asset.runtimeStatus === "approved") {
    approvedCount += 1;
    if (asset.license !== "CC0" && asset.license !== "CC-BY-4.0") {
      fail(`${label}: approved runtime license is not in the explicit allow-list.`);
    }
    if (typeof asset.runtimePath !== "string" || !asset.runtimePath.startsWith("/assets/city/runtime/")) {
      fail(`${label}: approved asset must use /assets/city/runtime/ path.`);
      continue;
    }
    if (asset.runtimePath.includes("..") || !asset.runtimePath.endsWith(".glb")) {
      fail(`${label}: runtimePath must be a safe .glb path.`);
      continue;
    }
    const diskPath = path.join(repoRoot, "public", asset.runtimePath.replace(/^\//, ""));
    if (!diskPath.startsWith(runtimeRoot + path.sep)) {
      fail(`${label}: runtimePath escapes the city runtime directory.`);
    } else if (!fs.existsSync(diskPath)) {
      fail(`${label}: approved runtime file does not exist: ${asset.runtimePath}`);
    }
    if (!asset.sha256 || !/^[a-f0-9]{64}$/i.test(asset.sha256)) {
      fail(`${label}: approved asset requires a SHA-256 checksum.`);
    }
    if (!asset.inspection || asset.inspection.visualReview !== "passed") {
      fail(`${label}: approved asset requires a passed visual review record.`);
    }
  } else if (asset.runtimeStatus === "not-acquired" && asset.runtimePath != null) {
    fail(`${label}: not-acquired assets must not expose a runtimePath.`);
  }
}

if (process.exitCode) {
  console.error("[city-assets] Manifest validation failed.");
} else {
  console.log(`[city-assets] Manifest valid: ${manifest.assets.length} catalog entries, ${approvedCount} approved runtime assets.`);
  if (approvedCount === 0) {
    console.warn("[city-assets] No approved runtime assets yet. This is expected until binaries pass inspection.");
  }
}
