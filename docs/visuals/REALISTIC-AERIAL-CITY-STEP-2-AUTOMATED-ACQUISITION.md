# Automated CC0 city-prop acquisition

This workflow obtains a small batch of public CC0 GLB props from the three.ws
Object Library API and validates each downloaded file with glTF Transform.

## What it does

- Queries the public Object Library API.
- Selects at most one match per street-prop category (lamp, bench, bin,
  traffic light, road sign, bollard, bus shelter, hydrant, fence, tree,
  bicycle and utility/street props).
- Requires the source manifest to label each selected object CC0.
- Enforces per-file (12 MiB) and total (60 MiB) download limits.
- Checks the GLB container signature, calculates SHA-256, and records source
  URL, bytes and license in an acquisition report.
- Runs glTF validation and inspection.
- Uploads the result as a GitHub Actions artifact for 14 days.

## Important safety gate

The workflow deliberately writes to
`public/assets/city/incoming/three-ws/`, **not** to
`public/assets/city/runtime/`. A successful download or automated glTF
validation does not establish visual quality. Every candidate still needs
manual Blender review for geometry, textures, scale, orientation, normals,
visual realism, draw-call cost and suitability for the aerial camera.

Do not set `runtimeApproved` to true or add a runtime path based only on this
workflow. The existing manifest validator continues to require an explicit
approval record and a committed runtime file.

## Run it

Open GitHub Actions → **City Asset Acquisition (review batch)** → Run workflow.
The resulting `city-cc0-asset-review-batch` artifact contains GLBs,
`acquisition-report.json`, and per-model glTF inspection reports.

Source API documentation: https://github.com/nirholas/three.ws/blob/main/docs/object-library.md
