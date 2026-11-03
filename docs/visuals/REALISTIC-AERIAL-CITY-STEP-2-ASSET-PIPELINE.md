# Realistic Aerial City — Step 2 Asset Pipeline

## Pipeline status

The repository now has:
- A source catalog and license-screening notes.
- A local asset-intake procedure.
- Static GLB preparation scripts for Bash and Windows PowerShell.
- A manifest approval validator.

No candidate asset is approved for runtime merely because its source is listed. The current catalog intentionally remains separate from runtime delivery until the binary has been downloaded, inspected and reviewed.

## Windows 11 workflow

Install Node.js LTS, then install the CLI:

```powershell
npm install --global @gltf-transform/cli
gltf-transform --help
```

Prepare a downloaded static GLB:

```powershell
.\scripts\city-assets\prepare-static-glb.ps1 .\intake\model.glb .\review\model.optimized.glb
```

The script validates and inspects the source, creates a separate optimized copy, validates and inspects that copy, and prints SHA-256 checksums. Keep the original download unchanged.

Do not use the static preparation script for animated/skinned pedestrian models. Those need a dedicated animation-preserving workflow and a review of clips, skeleton, root motion and loop continuity.

## Approval record

An asset can be marked `runtimeStatus: approved` only after all of these are true:

1. The exact source file and its license evidence are recorded.
2. The original and optimized checksums are recorded.
3. Blender inspection confirms correct scale, orientation, normals, UVs and materials.
4. The optimized file passes glTF validation.
5. The file has a visual review record with `visualReview: passed`.
6. The optimized GLB is committed under `public/assets/city/runtime/`.
7. The manifest contains its exact runtime path and checksum.

Run the manifest gate from the repository root:

```powershell
node .\scripts\city-assets\validate-manifest.mjs
```

The gate checks unique IDs, approved licenses, runtime path containment, file existence, SHA-256 presence, visual approval and prevents `not-acquired` entries from declaring runtime paths.

## Three.js runtime compatibility

CivilOS AI uses Three.js / React Three Fiber. GLB is the preferred delivery format. Three.js `GLTFLoader` supports `EXT_texture_webp` and `EXT_meshopt_compression`; Meshopt-compressed assets require `loader.setMeshoptDecoder(MeshoptDecoder)`, Draco requires a `DRACOLoader`, and KTX2 requires a configured `KTX2Loader`. The current preparation scripts deliberately disable geometry compression and preserve scene hierarchy until the homepage loader is explicitly configured and tested. WebP texture output remains enabled. Do not turn on Meshopt/Draco/KTX2 compression until the matching loader path is integrated and tested on the target browser.

## Performance and visual acceptance

- Keep a high-quality source model outside the browser runtime.
- Use optimized runtime copies and multiple LODs for large buildings, vegetation and repeated props.
- Instance repeated static props where practical.
- Avoid loading all catalog assets at once; use distance/visibility-based loading.
- Check mobile memory, download size, frame time and texture memory.
- Compare the loaded model against the source in Blender and the actual homepage camera.
- Reject low-poly blockout assets as final city visuals.

## Current honest status

The scripts and gate are committed to the working PR branch. The scripts have not been run against a real candidate binary in this environment, and no asset is visually approved or integrated. Step 2 remains open until the binary acquisition and review gates pass.
