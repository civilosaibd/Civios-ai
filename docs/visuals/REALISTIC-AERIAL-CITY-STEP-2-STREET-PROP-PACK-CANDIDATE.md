# Step 2 — CC0 Photoreal Street-Prop Pack Candidate

## Candidate reviewed

**Hidden Alley Props — 39 models**  
Source: https://hydethebooty98.itch.io/hidden-alley-props  
Published pack size: approximately 186 MB.  
Listed format: glTF models with 1K textures, plus a Blender Asset Browser file.  
License stated by the publisher: CC0 1.0.

The pack listing describes street lamps, security cameras, roller-shutter doors, a fire escape, utility boxes, trash cans, tyres, modular facades and fences. These are useful categories for filling the visual gaps between major buildings and roads.

## Selection policy

This is a source-screened candidate, **not an acquired or approved runtime dependency**. The pack includes a covered car, which must not be used as a moving traffic vehicle. Only individual props that suit the city composition should be selected.

Before any model enters the app:

1. Download the archive and inspect its contents.
2. Match selected models to their original Poly Haven source records and CC0 evidence.
3. Open each selected GLB in Blender or a glTF inspector.
4. Check dimensions, origin, orientation, mesh density, UVs and material maps.
5. Create appropriate LODs and compress textures.
6. Record a SHA-256 hash and place the optimized model under `public/assets/city/models/`.
7. Update the manifest with the exact runtime path and verified metadata.

## Runtime and licensing caution

Do not ship the entire pack merely because its listing says CC0. Keep only the individual assets actually used, preserve source/license evidence in the repository, and re-check the original asset records at acquisition time. The manifest entry remains `not-acquired` and has no runtime path until those checks pass.

## Step 2 status

The candidate expands the street-prop source catalog. It does **not** close Step 2: no binary has yet been downloaded, visually inspected, optimized or committed.
