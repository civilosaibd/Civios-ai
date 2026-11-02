# CivilOS AI Homepage — Realistic Aerial City
## Step 1: Complete 3D City Architecture & Production Plan

**Status:** Planning baseline  
**Scope:** Homepage hero scene only. This document defines the scene before asset production and implementation.  
**Visual target:** A convincing, photorealistic real-time 3D city viewed from a high drone camera—not a miniature diorama, cartoon, flat image, or collection of primitive boxes.

---

## 1. Experience brief

Build a compact but visually rich urban district that reads as a real city at first glance. The camera looks diagonally down from a drone at a high altitude. The scene has a clear foreground, middle distance, and hazy skyline. Roads form a believable connected network; buildings sit on coherent parcels; sidewalks, crossings, trees, street furniture, vehicles, and pedestrians have correct scale and placement.

The city should feel inhabited and in motion while remaining a supporting visual for the CivilOS AI homepage. The architectural landmark is a natural part of the district, not an isolated product pedestal.

**Non-goals:** a full navigable metropolitan simulator, engineering-accurate BIM, photogrammetric reconstruction of a real named city, or a static city photograph used as a fake 3D background.

## 2. Spatial layout baseline

Use a local metric coordinate system (metres), with Y as vertical. The initial hero composition covers approximately **420 m × 420 m**. Final dimensions may be tuned after camera/framing tests, but all assets must use consistent real-world scale.

### District zones

| Zone | Approx. footprint | Role and visual contents |
|---|---:|---|
| Central landmark block | 90 × 90 m | Signature contemporary mixed-use building; detailed facade, entrance, roof plant, loading/service access and landscaped public forecourt |
| Main avenue | 24 m corridor | Two-way multi-lane road, lane markings, junctions, pedestrian crossings, traffic lights, sidewalks and street trees |
| Secondary streets | 12–16 m corridors | Connected local streets, curb radii, parking bays, junction priority and realistic block access |
| Residential blocks | 6–10 blocks | Varied mid-rise apartments and townhouses; balconies, window depth, roof details, courtyards and service areas |
| Commercial blocks | 2–3 blocks | Offices/retail frontage, canopies, signage kept subtle, loading/service access |
| Green/public space | 1–2 pockets | Park planting, paths, benches, small plaza and optional water feature |
| Urban edge/background | Remaining perimeter | Lower-detail but varied skyline and vegetation, with atmospheric depth to avoid a hard scene boundary |

### Street/block logic

- Roads must connect into a coherent street network; no disconnected road strips or cars driving across buildings.
- Building footprints align to parcels and maintain plausible setbacks, entrances, fire/service access and sidewalks.
- Add intersections, zebra crossings, stop lines, lane arrows, curb ramps, medians and parking where appropriate.
- Use varied block shapes and building heights. Avoid repeating the same building mesh or identical window grids.
- Place trees and street furniture with deliberate spacing and clear pedestrian paths.

## 3. Building typology and asset requirements

The city must use detailed, licensed 3D assets or purpose-built high-quality models—not simple box geometry as final visible buildings.

1. **Landmark:** one hero-quality contemporary mixed-use building with articulated facade, glazing, balcony/terrace details, roof equipment, realistic ground-floor entrance and material variation.
2. **Mid-rise residential:** multiple distinct 4–10 storey assets, varied footprints, balconies, recessed windows, facade bays and rooftop services.
3. **Townhouses/low-rise:** 2–4 storey assets with varied rooflines, setbacks, entrance details and small yards.
4. **Commercial/office:** glass/concrete/metal facade systems, podiums, canopies and ground-floor retail frontage.
5. **Background skyline:** modular but visually varied assets, reduced geometry and texture resolution at distance.

Use a shared material language (concrete, brick/render, stone, glass, painted metal, asphalt, paving) while varying facade composition and palette. Rooftops should not be empty slabs: include parapets, HVAC, lift overruns, solar panels or water tanks where appropriate.

## 4. Roads, vehicles, people and landscape

### Roads and street furniture
- PBR asphalt with subtle roughness/aggregate variation, not a flat grey plane.
- Physically plausible curbs, sidewalks, tactile paving, drains, manholes, road paint and crosswalks.
- Traffic lights, poles, signs, benches, bins, bollards, bus stops and street lamps placed at believable scale.

### Vehicles
- Use detailed low-to-mid polygon licensed vehicle models with visible wheels, glazing, headlights/taillights and correct proportions.
- Traffic follows spline/lane paths with direction, speed variation, safe spacing, intersection rules and no clipping.
- Use instancing/LOD where possible; keep a small, curated visible traffic population for the hero view.

### Pedestrians
- Use rigged human models with actual walk cycles and varied silhouettes/clothing.
- Pedestrians stay on sidewalks/crossings and follow simple path routes; avoid capsule primitives and floating/slide movement.
- Keep crowd count modest and prioritize silhouettes that read correctly from the drone camera.

### Vegetation
- Use detailed tree assets with varied species, canopy sizes and seasonal/colour variation.
- Add shrubs, grass beds and planters only where they fit the landscape plan.
- Avoid repeated low-poly geometric blobs as the final vegetation treatment.

## 5. Drone camera and composition

- High oblique aerial view (not straight-down orthographic and not low product-render angle).
- Initial camera target: central landmark and surrounding street network, with enough context to read several blocks.
- Starting camera elevation: approximately 55–70 degrees above the horizon (tune by composition); focal length/FOV chosen to avoid toy-like wide-angle distortion.
- Camera should feel stable like a drone hover. Optional very subtle drift/parallax only; no constant spinning city.
- Keep the landmark within the visual centre/thirds while allowing roads and neighbourhood fabric to establish scale.
- Use atmospheric perspective and restrained distance haze; avoid excessive fog that hides detail.
- Responsive framing: desktop shows broad district; mobile uses a tighter crop but retains recognizable roads/buildings and must not become an isolated building close-up.

## 6. Lighting, rendering and material quality

- Daylight baseline with physically plausible sun direction, soft but readable cast shadows, ambient fill and controlled contrast.
- PBR materials: base colour, roughness, normal maps and metalness where appropriate; correct UVs and texel density.
- Glass should reflect its environment and have believable tint/opacity; avoid opaque blue window stickers.
- Add subtle ambient occlusion/contact grounding and tone mapping; avoid over-saturated neon or glossy plastic surfaces.
- The city must remain legible against the homepage theme and must not look like a separate boxed card unless the existing page layout requires a container.

## 7. Implementation architecture (proposed)

Keep the hero scene isolated from unrelated homepage logic. Suggested component boundaries (names are provisional and may be adapted to the existing codebase):

- `HeroCity3D`: responsive canvas, loading/error fallback, reduced-motion handling.
- `CityScene`: lights, fog/atmosphere, camera and scene-level configuration.
- `CityLayout`: roads, parcels, blocks, district zoning and static placement.
- `BuildingAsset`: GLB/GLTF loading, material overrides, LOD and instancing.
- `RoadNetwork`: road surfaces, markings, junctions, sidewalks and route splines.
- `TrafficSystem`: vehicle path-following, lane offsets and simple intersection coordination.
- `PedestrianSystem`: rigged character loading, walk animation and sidewalk routes.
- `LandscapeSystem`: tree/plant placement and LOD.
- `AssetManifest`: central asset paths, scale, attribution/licence metadata and LOD variants.

Use Three.js / React Three Fiber already present in the project where practical. Load models asynchronously, show a graceful fallback, dispose resources correctly, and avoid rebuilding static geometry every frame. Use instancing for repeated props, LOD/distance culling, compressed textures and GLB assets. Do not add a new map/tile provider or paid API dependency without explicit approval and confirmed credentials/licensing.

## 8. Asset acquisition and licensing policy

- Prefer original project-created assets or assets with clear commercial-use permission (for example, verified CC0 assets).
- For every third-party model/texture, record source URL, creator, licence, attribution requirement, modification status and downloaded file path in an asset manifest.
- Do not assume a model is free because it is downloadable. Verify the exact licence for each asset.
- Do not scrape Google Maps/Google Earth 3D content or use copyrighted city imagery as geometry.
- Photogrammetry/3D Tiles providers are a separate optional direction requiring provider selection, API credentials, terms review and performance validation before integration.
- No external asset should be committed until its licence and intended commercial usage are checked.

## 9. Performance and responsive budget

Initial targets (to be measured and tuned against actual devices):

- Desktop: target 45–60 FPS on a typical modern integrated/discrete GPU at the hero's rendered size.
- Mid-range mobile: target stable 30 FPS with adaptive DPR and reduced shadow/LOD settings.
- Keep initial hero payload lean; lazy-load the scene and defer distant/background assets.
- Use compressed GLB (Meshopt/Draco where supported) and KTX2/Basis textures when the current build pipeline supports them.
- Limit real-time shadow casters; use baked/static lighting for distant objects where appropriate.
- Respect `prefers-reduced-motion`, context loss, WebGL unavailability and low-memory devices.
- No unbounded animation loops, per-frame React state updates, or excessive transparent overdraw.

## 10. Quality gates — no phase is considered complete without these

1. **Composition gate:** screenshot at desktop and mobile sizes; reads as a drone view of a city, not a diorama.
2. **Asset gate:** no visible final buildings/cars/people/trees made from placeholder primitives; asset licences documented.
3. **Scale gate:** vehicles, people, lanes, doors, floors and street furniture use consistent metric proportions.
4. **Movement gate:** cars stay on lanes; pedestrians stay on walkable paths; no visible clipping, teleporting or floating.
5. **Material gate:** no obvious flat-colour plastic surfaces, repeated facade patterns or fake window stickers.
6. **Performance gate:** record build result and measured FPS/memory on desktop and at least one representative mobile device.
7. **Accessibility gate:** reduced-motion and WebGL fallback work.
8. **Integration gate:** homepage hero layout, text, buttons and routes remain intact.
9. **Regression gate:** TypeScript/lint/tests/build pass; preview deployment is READY; visual review is performed before declaring completion.

## 11. Phase sequence after this planning step

- **Step 2:** build the asset inventory and procure/create approved hero, building, vehicle, pedestrian and landscape assets.
- **Step 3:** construct the metric city blockout and validate camera composition with real parcel/street geometry.
- **Step 4:** integrate detailed building assets and landmark architecture.
- **Step 5:** implement roads, street furniture and markings.
- **Step 6:** add vehicles and lane-based traffic.
- **Step 7:** add rigged pedestrians and walk routes.
- **Step 8:** add vegetation, PBR materials, daylight and atmospheric rendering.
- **Step 9:** implement drone camera controls, responsive composition and motion/accessibility behaviour.
- **Step 10:** optimize, test, review screenshots and validate production preview.

**Step 1 exit condition:** this architecture plan is committed and the scope, realism bar, coordinate system, district zones, camera intent, asset/licensing rules, implementation boundaries and acceptance gates are documented. No visual implementation is claimed complete by this planning document.
