# Step 2 — Repeatable Local GLB Asset Intake

## Purpose

Use a local developer machine or a controlled CI runner to discover and download candidate GLB files. This avoids hotlinking third-party model URLs in the CivilOS AI homepage and keeps downloaded binaries out of the GitHub text-only editing workflow.

A possible discovery utility is `@three-ws/assets`. Its published documentation describes searching the three.ws CC0 object catalog and downloading selected GLBs into a local project directory. Review the package source and current README before running it; do not run unpinned third-party code in a privileged environment.

## Suggested isolated intake session

Use a disposable branch or temporary folder, with no production secrets loaded:

```bash
mkdir -p /tmp/civilos-city-intake
cd /tmp/civilos-city-intake
npm init -y
npm view @three-ws/assets version
npm view @three-ws/assets dist.tarball
```

Inspect the package metadata and source before executing any CLI command. Pin the reviewed package version rather than relying on an unpinned latest version.

The package documentation shows this general workflow (confirm the current command syntax against its README):

```bash
npx @three-ws/assets search street lamp --kind object
npx @three-ws/assets search bench --kind object
npx @three-ws/assets search trash bin --kind object
```

Only select catalog entries whose per-entry license is explicitly CC0. Do not assume all characters or motion clips in the wider catalog are CC0; the character library documents multiple license types.

## Intake gate for every downloaded model

1. Record catalog name/slug, direct GLB URL, original source, per-entry license, byte size and thumbnail URL.
2. Verify the original source record and license evidence independently.
3. Download into a temporary intake directory, not directly into the application.
4. Inspect the GLB in Blender or another trusted glTF inspector.
5. Record dimensions, origin, forward axis, triangle count, mesh count, material count, texture dimensions and alpha/transparency usage.
6. Reject broken UVs, missing textures, unsuitable style, excessive geometry, incorrect scale or unclear provenance.
7. Optimize a copy, create LODs where useful, and test the result on a mid-range mobile device.
8. Compute SHA-256 and add a provenance record to the manifest.
9. Commit only the selected optimized files and their license/provenance records.

## Security and production rules

- Do not put API keys, cloud credentials or production secrets in the intake environment.
- Do not run an unreviewed `npx` package with elevated privileges.
- Do not use remote CDN URLs as final runtime paths.
- Do not add entire asset packs blindly; select only models that visibly improve the aerial city.
- Keep source files and optimized files separate; never overwrite the original download.
- Record a checksum for both the original archive/model and the optimized runtime model.
- A successful download is not visual approval.

## Current status

This document defines a reproducible intake route. No GLB has been downloaded or approved by this documentation change. The manifest must continue to show `not-acquired` until actual binary inspection and optimization are complete.
