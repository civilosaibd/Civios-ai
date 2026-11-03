# Step 2 — Street Detail Sources and Visual-Quality Screening

This update separates **photoreal runtime candidates** from **low-poly blockout helpers**. A CC0 license grants reuse rights; it does not guarantee visual fidelity or suitability for the final drone-view city.

## Low-poly parts: blockout only

The following Innerscene originals are CC0 GLBs with metric dimensions, but their source pages explicitly classify them as low-poly. They are recorded in the manifest as `blockout-only-low-poly`, not as approved final assets:

- Road straight — https://www.innerscene.com/tools/library/3d-parts/low-poly-city-road-straight-cf2e392c — 8 × 8 m.
- Road end — https://www.innerscene.com/tools/library/3d-parts/low-poly-city-road-end-baa1e3f9 — 8 × 8 m.
- Traffic light — https://www.innerscene.com/tools/library/3d-parts/low-poly-city-traffic-light-94ebd054 — approximately 0.33 × 0.275 × 3.5 m.
- Crosswalk — https://www.innerscene.com/tools/library/3d-parts/low-poly-city-crosswalk-5bd32d06 — 8 × 8 m.

They may be used temporarily to validate street layout, snapping, intersections, traffic-signal placement and pedestrian-crossing dimensions. They must not be presented as the final photoreal street assets.

## Additional CC0 prop-library lead

The 3DModelsCC0 City Environment Pack lists 11 city props, including an ATM, dumpster, bench, street light and traffic cone:
https://3dmodelscc0.itch.io/city-environment-pack

The listing states CC0 public-domain licensing. However, the pack's current downloadable archive, exact file formats, mesh quality and per-file contents still need verification. Treat it as a source lead only; do not assume that every similarly named pack from the publisher has the same license.

## High-quality prop strategy

For final street-level details, prioritize individually inspectable CC0 assets from established sources such as Poly Haven, then validate each original asset page and downloaded file. A curated CC0 aggregation may speed discovery, but its source attribution and license record must be checked per asset. Avoid bulk-importing hundreds of models without mesh, texture, trademark and performance review.

## Acceptance criteria for final street assets

- PBR materials with plausible roughness and normal detail.
- Correct real-world dimensions and consistent origin/orientation.
- No visible tiling seams in road surfaces.
- Crisp lane markings, crosswalks, curbs and sidewalk transitions at drone height.
- Appropriate detail density without excessive triangles or texture memory.
- LODs and compressed textures for mobile.
- No recognizable vehicle or corporate trademarks without separate rights clearance.

## Manifest changes

Four low-poly GLBs have been added as blockout-only entries. Each has `runtimeStatus: not-acquired` and `runtimePath: null`. They are not approved final assets.

## Step 2 status

**Open.** Asset discovery and screening have advanced, but no binary assets have yet been acquired, Blender-inspected, optimized, hash-recorded or committed. The next meaningful gate is binary acquisition and visual inspection—not another large list of untested source links.
