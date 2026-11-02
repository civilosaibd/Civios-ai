# Step 2 — Architecture Asset Candidates

This update adds two architecture candidates to the machine-readable asset manifest. Their source pages describe downloadable GLB files under CC0, including commercial use and redistribution. This is **source-level screening only**: no binary has yet been downloaded, opened in Blender, visually approved, optimized or committed.

## Candidate buildings

| Candidate | Declared size | Potential role | Source |
|---|---:|---|---|
| Three-storey office building | 30.196 × 20.936 × 11.595 m; 13.0 MB | Low-rise commercial district / office block | [Innerscene source](https://www.innerscene.com/tools/library/3d-parts/three-storey-office-building-16b33ce5) |
| Mixed-use high-rise | 56.2 × 42.3 m footprint; 134.6 m high; 23.1 MB | Skyline landmark / central mixed-use tower | [Innerscene source](https://www.innerscene.com/tools/library/3d-parts/mixed-use-high-rise-27a41221) |

## Quality and integration notes

- The mixed-use tower description includes a glazed curtain wall, retail podium, balconies and roof terrace. It is a plausible skyline candidate, but the source description does not prove photorealistic quality.
- The office building is a plausible mid-rise district asset. Its facade detail, glazing, roof geometry, UVs and texture resolution must be checked in the actual GLB.
- Both models must be inspected for mesh density, normals, material assignments, texture memory, origin, orientation and real-world scale.
- Create distance-appropriate LODs and test shadow cost, transparent glazing overdraw and draw-call count in the actual Three.js scene.
- Do not mark either asset as acquired or use it as a final hero building until the original binary is reviewed.

## Explicit exclusions

The newly found City Block filler and several commercial city-kit models are low-poly/stylized assets. They may be considered for distant background LOD only after review; they are not approved for close-up photorealistic buildings. A low-poly substitute must not silently replace the requested realistic city.

## Remaining Step 2 work

1. Acquire the actual GLB binaries and preserve licence evidence.
2. Inspect them in Blender and capture review screenshots/turntables.
3. Measure triangle counts, texture dimensions, materials and actual file sizes.
4. Generate optimized LODs and validate mobile GPU performance.
5. Commit only reviewed binaries with SHA-256 metadata and set manifest runtime paths.
6. Continue sourcing residential/townhouse architecture, a distinctive central landmark, PBR asphalt/concrete/facade materials, trees and street furniture.

**Status:** architecture source coverage improved; asset acquisition and visual inspection are still pending. Step 2 is not complete.
