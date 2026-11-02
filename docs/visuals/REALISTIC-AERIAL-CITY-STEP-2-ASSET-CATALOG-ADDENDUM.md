# Step 2 — Additional CC0 City Asset Candidates

This addendum expands the source-screened library for the aerial city scene. The linked source pages currently describe the assets as GLB files released under CC0, including commercial use and redistribution. This is **not** proof of visual quality or binary integrity; each candidate remains `not-acquired` until downloaded and inspected.

## Traffic vehicles

| Candidate | Declared size | Source / notes |
|---|---:|---|
| White four-door sedan | 4.8 MB | [Source](https://www.innerscene.com/tools/library/3d-parts/white-four-door-sedan-1f271353) — unbranded, 4.867 × 2.230 × 1.450 m |
| Passenger van with side windows | 5.6 MB | [Source](https://www.innerscene.com/tools/library/3d-parts/passenger-van-with-side-windows-474dd4a2) — 5.675 × 2.420 × 2.480 m |
| 12 m low-floor city bus | 6.1 MB | [Source](https://www.innerscene.com/tools/library/3d-parts/12-m-low-floor-city-bus-8e3c7229) — 12.138 m long; exterior visualization only |
| Road motorcycle | 627 KB | [Source](https://www.innerscene.com/tools/library/3d-parts/road-motorcycle-f2519759) — 2.1 m long, static model |

## Street furniture

| Candidate | Declared size | Source / notes |
|---|---:|---|
| Glass bus shelter | 2.1 MB | [Source](https://www.innerscene.com/tools/library/3d-parts/bus-shelter-90077332) — glass panels, bench and stop signage |

## Pedestrian variety

| Candidate | Declared size | Source / notes |
|---|---:|---|
| Relaxed walk — Harper | 17.9 MB | [Source](https://www.innerscene.com/tools/library/3d-parts/relaxed-walk-harper-3d-person-animated-b504cbac) — business-clothed rigged character, seamless 2-second walk loop |

## Important visual-quality decision

The 12 m bus and road motorcycle are realistic-scale candidates, but their mesh/material quality still needs direct inspection. The bus is an exterior visualization model and is not a fully functional vehicle simulation. Do not add visible logos or route text unless those are original and licensed.

A low-poly bus option was found but deliberately not selected for the photorealistic target. It may be useful only as a distant LOD after visual review; it must not become the close-up hero vehicle.

## Updated acquisition gate

For every candidate:
1. Download the original GLB and save its source page/licence evidence.
2. Open in Blender; check missing textures, normals, UVs, material roughness/metalness, mesh separation and animation clips.
3. Verify real-world dimensions and the origin/forward/up axes.
4. Generate at least three LOD levels where suitable; reduce texture memory and use GPU-friendly formats supported by the app's pipeline.
5. Test in Three.js at the intended aerial camera distance and on a mobile-class device.
6. Record source filename, creator, CC0 evidence, original byte size, optimized byte size, triangle count per LOD, texture sizes and SHA-256.
7. Only then set the manifest runtime status to acquired/inspected and add the binary to the repository.

## Current status

Source catalog is broader: passenger cars, SUV, van, bus, motorcycle, two animated pedestrian candidates and a bus shelter are now represented. No production GLB binaries have been downloaded, optimized or committed yet. Architecture assets and PBR materials remain the largest gaps. Step 2 remains open.
