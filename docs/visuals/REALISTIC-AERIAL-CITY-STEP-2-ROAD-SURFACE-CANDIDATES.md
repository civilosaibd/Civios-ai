# Step 2 — Road and Asphalt Surface Candidates

This addendum records two additional source-screened candidates for the CivilOS AI realistic aerial city. It does **not** mark either asset as acquired or approved for runtime use.

## 1. Modular two-lane road

- Source: https://www.innerscene.com/tools/library/3d-parts/two-lane-straight-road-with-markings-8d2ba089
- Format: GLB
- Reported file size: 6.7 MB
- License: CC0 (source page states public-domain use, modification and redistribution, including commercial use)
- Reported footprint: 12 × 12 m
- Reported cross-section: 1.85 m sidewalk + 0.15 m curb + 8.00 m asphalt carriageway + 0.15 m curb + 1.85 m sidewalk
- Reported markings: two 3.50 m lanes, 0.50 m edge strips, 0.15 m white lines, broken centre line
- Traffic orientation: right-hand traffic
- Branding: unbranded

**Why it is a strong candidate:** real-world metric dimensions and an explicit road/sidewalk/curb cross-section make it more useful for the planned measured city blockout than a generic road plane. Its 12 m module can be evaluated for repeatable street assembly and intersection transitions.

**Not yet verified:** actual mesh topology, UVs, texture resolution, material quality, seam continuity, origin/pivot, and whether the markings remain crisp at the intended drone camera distance.

## 2. Fresh asphalt PBR

- Source: https://www.meshy.ai/textures/concrete/fresh-asphalt
- License: CC0; source page states commercial use is allowed
- Seamless: yes, according to source
- Reported 2K PBR pack size: 4.6 MB
- Reported maps: base colour, normal and roughness

**Why it is a candidate:** provides a physically based asphalt surface instead of a flat grey material. The road model's own painted markings should remain separate from the base asphalt so lane markings can be controlled consistently.

**Not yet verified:** downloaded archive contents, map dimensions, color-space metadata, real-world scale, tiling artifacts, and performance after compression.

## Runtime acquisition gate

Both entries are recorded in `public/assets/city/manifest/asset-manifest.json` with `runtimeStatus: not-acquired` and `runtimePath: null`.

Before either asset is enabled:
1. Download the original archive from its source page.
2. Re-check the license on the actual download page at acquisition time.
3. Inspect the GLB and texture maps in Blender or an equivalent 3D viewer.
4. Check scale, axes, origin, topology, UVs, materials and texture resolution.
5. Test the road module in repeated straight runs, corners, junctions and sidewalks.
6. Optimize geometry and textures for desktop and mobile, with LODs where appropriate.
7. Record SHA-256 hashes and exact source/license evidence.
8. Commit the optimized runtime files and update the manifest with real paths and hashes.

## Important visual-quality note

A source being CC0 and downloadable as GLB does not prove that it is photorealistic. The road and asphalt candidates must pass visual inspection in the actual city scene. No generated screenshot, preview image, or procedural placeholder should be represented as proof that the source model has been acquired or integrated.

## Step 2 status

**Still open — source catalog expanded; binary acquisition and visual inspection remain outstanding.**
