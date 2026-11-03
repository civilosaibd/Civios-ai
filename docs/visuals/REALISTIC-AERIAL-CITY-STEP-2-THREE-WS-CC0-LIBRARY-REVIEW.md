# Step 2 — three.ws CC0 Object Library Source Review

## Why this source is being considered

The three.ws Object Library documentation describes several hundred CC0 GLB props, with a public JSON catalog and direct CDN model URLs. Entries reportedly include a name, categories, tags, file size, license and original source record. The documented endpoint is:

- Catalog: https://three.ws/api/objects/library
- Documentation: https://github.com/nirholas/three.ws/blob/main/docs/object-library.md

The library is a discovery source only. CivilOS AI must not depend on the three.ws API or CDN at runtime.

## Potential value for the aerial city

Search the catalog for street and urban details such as:
- benches, bins, bollards and street lights;
- electrical cabinets, utility boxes and public fixtures;
- fences, gates, signs and construction-site props;
- urban vegetation planters and street-side objects.

Do not assume that every catalog entry is appropriate. A CC0 tag is not a substitute for visual inspection, dimension checks, source provenance review and optimization.

## Acquisition and provenance rules

For each selected item:

1. Read the catalog entry and preserve its original `source`, name, URL, file size and stated license.
2. Confirm the original source asset page and license, not just the aggregator's catalog claim.
3. Download the GLB into a temporary intake folder; do not hotlink it in production.
4. Inspect the model visually in Blender or a trusted glTF viewer.
5. Check triangle count, dimensions, pivot, orientation, UVs, texture maps and transparency.
6. Optimize the mesh and textures, create LODs where appropriate, and test on a mid-range mobile device.
7. Compute SHA-256 and record the exact source URL, original author, license evidence, inspected dimensions, optimization settings and final runtime path.
8. Only then set the manifest entry to acquired/approved.

## Licensing and service dependency

The documentation states that its curated objects are CC0 and may be downloaded and redistributed. Verify each original asset record before bundling. Do not call the live catalog API from the CivilOS AI homepage: that would create an unnecessary third-party runtime dependency and make the city dependent on another service's availability and schema.

## Current status

This review adds a source-discovery route only. No model was downloaded, visually inspected, optimized or committed by this change. No runtime dependency is introduced. Step 2 remains open until actual binary assets pass the acquisition gate.
