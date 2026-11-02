# Step 2 — Verified Asset Sources & Acquisition Gate

## Status

This update expands the asset inventory with specific CC0 GLB candidates for passenger vehicles and animated pedestrians. It does **not** claim that any binary asset has been downloaded or integrated. Every new candidate remains `runtimeStatus: not-acquired` until the full acquisition gate below passes.

## Newly screened vehicle candidates

| Asset | Source | Declared format/size | Decision |
|---|---|---:|---|
| Generic compact SUV | https://www.innerscene.com/tools/library/3d-parts/generic-compact-suv-9f157ee5 | GLB / 4.6 MB | Candidate; inspect mesh, materials and visual fidelity |
| Silver five-door compact hatchback | https://www.innerscene.com/tools/library/3d-parts/silver-five-door-compact-hatchback-6bf4a878 | GLB / 4.8 MB | Candidate; inspect mesh, materials and visual fidelity |
| SUV | https://www.innerscene.com/tools/library/3d-parts/suv-dc972cab | GLB / 623 KB | Candidate; exterior-only, cabin/suspension/powertrain omitted |

The models are described by their source pages as original, unbranded, real-world-scale GLB assets under CC0. CC0 and format suitability do not prove photorealism; visual review is still mandatory.

## Newly screened pedestrian candidates

| Asset | Source | Declared format/size | Animation |
|---|---|---:|---|
| Relaxed walk — Sam | https://www.innerscene.com/tools/library/3d-parts/relaxed-walk-sam-3d-person-animated-732f1206 | GLB / 20.0 MB | Seamless 2-second walk loop |
| Locomotion collection — Maya | https://www.innerscene.com/tools/library/3d-parts/locomotion-collection-maya-3d-person-animated-1499b2fd | GLB / 20.3 MB | Idle, walk, brisk walk, jog, run, carry walk, sit/stand |

Both pages describe CC0 rigged/skinned GLB models adapted from MakeHuman/MPFB CC0 assets. These are promising animation candidates, not yet approved final visuals. Character appearance, skeleton compatibility, texture memory and animation playback must be tested.

## Licensing policy

- Poly Haven states that its assets are CC0 and may be used commercially and redistributed: https://polyhaven.com/license
- Innerscene's individual candidate pages state CC0/public-domain use, including commercial use and redistribution. Re-check each asset page and its licence at the time of download.
- Do not bundle assets with unclear rights, editorial-only terms, or restrictions incompatible with redistribution.
- Do not use the live Poly Haven API without accounting for its separate attribution requirement.

## Acquisition gate (must pass per asset)

1. Download the actual binary from its source page.
2. Re-check and archive licence evidence.
3. Open the file in Blender or a compatible GLB viewer; reject corrupt or incomplete files.
4. Inspect geometry, normals, UVs, material slots, textures and embedded animations.
5. Verify dimensions, up-axis, forward direction and ground-contact origin.
6. Measure triangle count and texture memory; create suitable LODs and compress textures.
7. Test in the target Three.js scene, including mobile performance.
8. Record SHA-256, source URL, creator, licence, original filename and optimized runtime path.
9. Only then change `runtimeStatus` to `acquired-and-inspected` and commit the binary.

## Remaining gaps

No production-ready landmark, residential, townhouse, commercial or skyline building kit has been approved. Bus, delivery van, motorcycle, sidewalk props, and the PBR surface/environment set also remain open. Bespoke architecture is still expected to provide the distinctive skyline and avoid a repetitive asset-store look.

## Current execution limitation

The available GitHub file-writing connector accepts UTF-8 text only, not binary GLB uploads. The execution environment also could not resolve the asset-host domain for direct binary downloads. Therefore this PR records verified source candidates and an auditable gate; it does not fabricate or substitute placeholder GLBs. Binary acquisition must be completed through an enabled browser/download workflow or a local Blender asset pipeline before Step 2 can be marked complete.
