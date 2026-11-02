# CivilOS AI — Realistic Aerial City Asset Inventory
## Step 2: Asset sourcing, technical screening and acquisition register

**Status:** Inventory and technical screening completed; final production asset downloads are intentionally not marked as acquired until the exact files are downloaded, inspected and committed with licence evidence.  
**Target:** Commercial homepage hero in a real-time Three.js / React Three Fiber scene.  
**Visual standard:** realistic silhouettes, correct scale, detailed PBR surfaces and no toy-like / cartoon placeholder assets.

---

## 1. Asset strategy

A single free library does not provide a complete photorealistic city. The production scene will use a controlled mix:

1. **CC0 materials and selected environment props** from Poly Haven, subject to per-asset size and topology checks.
2. **Original, purpose-built building assets** for the landmark and the neighbourhood typologies. This avoids repetitive generic assets and gives us consistent architectural language.
3. **Licensed, rigged human models and vehicle models** selected individually after checking the exact model page licence and redistribution conditions.
4. **Optimized vegetation and street furniture** using LOD variants. High-resolution source models may be used as source masters, not shipped unchanged to the browser.
5. **No static city panorama as the city itself.** HDRIs may be used only as lighting/reflection input when the background does not visually replace the actual 3D city.

### Primary source and licence policy

- Poly Haven states that its assets are CC0 and can be used commercially, redistributed and used without mandatory attribution: https://polyhaven.com/license
- Poly Haven's model catalogue is useful for selected props, nature and material support, but its current catalogue has only a limited Architecture category and does not constitute a complete city kit: https://polyhaven.com/models
- Poly Haven's texture catalogue includes asphalt, concrete, brick, stone and paving categories suitable for the city's PBR material library: https://polyhaven.com/textures
- Sketchfab assets are not automatically free for commercial use. The exact licence on each downloaded model must be checked; editorial-only assets are not acceptable for this promotional homepage: https://sketchfab.com/licenses
- Do not use a model just because it has a download button. Store the licence text/screenshot and source metadata with every acquired file.
- Do not scrape Google Maps / Google Earth / proprietary 3D city tiles or reuse copyrighted renders as geometry.

## 2. Asset inventory and decisions

| ID | Asset family | Required production quantity | Candidate source / approach | Screening result | Decision |
|---|---|---:|---|---|---|
| BLD-01 | Landmark mixed-use building | 1 hero asset | Original Blender model, GLB export | Must be bespoke and hero-quality; no verified off-the-shelf city landmark selected | **Create original** |
| BLD-02 | Mid-rise residential buildings | 6–10 unique shells | Original modular Blender kit | Need facade variation, balconies, real window depth, roof plant and varied footprints | **Create original kit** |
| BLD-03 | Townhouses / low-rise | 4–8 variations | Original Blender models | Need varied rooflines, entrances and setbacks | **Create original kit** |
| BLD-04 | Commercial / office buildings | 2–4 variations | Original Blender models | Must complement the landmark and avoid cloned window grids | **Create original kit** |
| BLD-05 | Distant skyline | 8–15 optimized variants | Original simplified-but-detailed silhouettes | Distant assets can use controlled LOD, but must retain believable architectural profiles | **Create original LOD set** |
| VEH-01 | Passenger cars | 4–6 distinct models | Individually licensed/CC0 model or original model | Need visible wheels, glazing, lights and correct proportions | **Not yet approved** |
| VEH-02 | Bus / minibus | 1–2 models | Individually licensed/CC0 model or original model | Required for varied city traffic; brand marks must be removed | **Not yet approved** |
| VEH-03 | Delivery van / truck | 1–2 models | Individually licensed/CC0 model or original model | Correct wheelbase, cargo body and lights | **Not yet approved** |
| VEH-04 | Motorcycle / rickshaw-like local traffic | Optional 1–2 | Original or individually licensed model | Add only if model quality and visual scale pass; avoid stereotypes or visual clutter | **Optional, not yet approved** |
| HUM-01 | Rigged pedestrians | 3–5 base characters with clothing variations | Individually licensed rigged GLB/GLTF or original models | Must have usable skeleton and walk animation; verify commercial-use and redistribution terms | **Not yet approved** |
| VEG-01 | Broadleaf street trees | 2–3 species | Poly Haven source models as source masters; custom optimized LODs | Tree Small 02 is CC0 but 5M tris / 263.02 MB; too heavy unchanged. Jacaranda Tree is CC0 but 312K tris / 584.53 MB; also too heavy unchanged | **Use only after LOD/texture optimization** |
| VEG-02 | Shrubs / planters / grass | 3–5 assets | Poly Haven Nature catalogue or original assets | Need varied silhouette and modest draw/texture cost | **Candidate source; per-asset review required** |
| STR-01 | Street lamps | 1–2 variants | Poly Haven Street Lamp 01 as a source candidate | CC0; 31K tris and 31.41 MB source download. Too heavy for repeated unoptimized browser instances | **Candidate; create optimized LOD** |
| STR-02 | Benches, bins, bollards, signs, bus stops | 2–4 each | Original kit or individually verified CC0 assets | Use coherent design language and correct metric scale | **Not yet approved** |
| MAT-01 | Asphalt PBR | 2 material variants | Poly Haven Asphalt & Bitumen texture library | CC0 asset library; select exact material by texture maps and visual inspection | **Source approved; individual material TBD** |
| MAT-02 | Concrete / sidewalk PBR | 2–3 variants | Poly Haven Concrete / Paving texture libraries | CC0 asset library; select exact maps and ensure texel density | **Source approved; individual material TBD** |
| MAT-03 | Brick / plaster / facade PBR | 3–5 variants | Poly Haven Brick & Block / Concrete / Stone libraries | CC0 asset library; choose a restrained architectural palette | **Source approved; individual material TBD** |
| MAT-04 | Glass / metal / roof materials | 2–4 variants | Original shader setup plus verified PBR textures | Need realistic reflectance and roughness; avoid flat blue window planes | **Build shader set; textures TBD** |
| ENV-01 | Daylight / sky lighting | 1 environment | Sky system or a sky-only HDRI with verified licence | Must not display a photographic city in place of the 3D scene | **Select in lighting phase** |

## 3. Specific source candidates screened

These are source candidates, not a claim that the production files have already been downloaded or integrated.

### Approved source library for CC0 materials and selected props

- **Poly Haven licence:** CC0; commercial use and redistribution allowed. Attribution is not mandatory, though appreciated.  
  https://polyhaven.com/license
- **Poly Haven models:** 521-model catalogue at the time of screening; Architecture category is comparatively small, so it cannot supply the entire district.  
  https://polyhaven.com/models
- **Poly Haven textures:** includes 22 Asphalt & Bitumen entries and 127 Concrete entries at the time of screening. Exact maps still need individual selection.  
  https://polyhaven.com/textures

### Individual model candidates

| Candidate | Source | Licence / technical facts observed | Use decision |
|---|---|---|---|
| Tree Small 02 | https://polyhaven.com/a/tree_small_02 | CC0; 4.6 m tall; 5M tris; 263.02 MB download | Do not ship unchanged. Generate low/mid/high LODs, reduce leaf overdraw and compress textures first. |
| Jacaranda Tree | https://polyhaven.com/a/jacaranda_tree | CC0; 24.2 m canopy width; 312K tris; 584.53 MB download | Source master only; too large for direct repeated web use. Build optimized LODs and test canopy alpha cost. |
| Street Lamp 01 | https://polyhaven.com/a/street_lamp_01 | CC0; 3.9 m tall; 31K tris; 31.41 MB download | Candidate for one hero-quality close prop; create lower LOD for repeated placement. |
| Covered Car | https://polyhaven.com/a/covered_car | CC0; 4.4 m wide; 13K tris; model is a car under a fabric cover | **Rejected for traffic.** It is not a usable visible passenger-car model. Do not use it as a driving vehicle. |

### Sources not selected as final assets

- Kenney Prototype Kit is CC0 and contains building/vehicle/character prototype assets, but it is a prototype/game kit and does not meet the requested photorealistic visual bar as final city content. It may be used for interaction tests only, not final visible assets: https://kenney.nl/assets/prototype-kit
- Sketchfab may contain suitable individual models, but each exact model's licence must be checked. Editorial-only content is disallowed for this commercial/promotional homepage. Standard licence restrictions on stand-alone extraction/redistribution also need to be respected: https://sketchfab.com/licenses

## 4. Production asset format and technical acceptance

### Preferred delivery formats
- Static props/buildings: GLB/glTF 2.0.
- Animated pedestrians: GLB/glTF with skeleton and embedded walk animation; verify animation names and playback.
- Materials: PBR baseColor, normal, roughness, metallic and AO maps where useful.
- Texture containers: KTX2/Basis where the current application pipeline supports them; otherwise optimized WebP/PNG as appropriate.
- Keep editable source masters (for original assets) outside the browser payload; ship optimized runtime files only.

### Scale and orientation
- One Blender unit equals one metre.
- Y is vertical in the scene coordinate system; normalize imported asset orientation during export/import.
- Every asset record must include real dimensions, origin/pivot, forward axis and applied scale.
- Human height reference: approximately 1.65–1.85 m. Car length reference: approximately 4.0–5.0 m. These are validation ranges, not hard limits.

### LOD targets (initial budgets; validate with actual camera)
- LOD0: near-camera assets only; preserve silhouette and important details.
- LOD1: roughly 40–60% of LOD0 triangles for mid-distance.
- LOD2: roughly 10–25% of LOD0 triangles for far-distance.
- LOD3 / impostor: optional for skyline only; must remain 3D geometry or controlled mesh impostor, never a full-scene photograph.
- Repeated trees, lamps and street props must not each load a huge unique texture set.
- Avoid large transparent leaf cards and excessive overdraw.

### Browser payload goals
- Compress GLB geometry (Meshopt or Draco where supported) and textures (KTX2/Basis where supported).
- Use instancing for repeated optimized assets.
- Load near assets first; defer skyline and non-visible assets.
- Target a small initial hero payload; exact per-asset budgets will be set after the first real asset import and device profiling.
- Do not add large assets to Git until compressed output, licence evidence and preview rendering are reviewed.

## 5. Required asset folder layout

Create these folders as assets are approved and downloaded:

```text
public/assets/city/
  buildings/
    landmark/
    residential/
    townhouse/
    commercial/
    skyline/
  vehicles/
    cars/
    bus/
    van-truck/
    two-wheel/
  people/
    rigged/
  vegetation/
    trees/
    shrubs/
    grass/
  street-furniture/
    lamps/
    benches/
    bins/
    signs/
  materials/
    asphalt/
    concrete/
    brick/
    stone/
    metal/
    glass/
  environment/
  manifest/
    asset-manifest.json
    licences/
```

No empty placeholder GLB files should be added. A folder is created when its first verified asset is ready.

## 6. Asset manifest record format

Each downloaded asset must have a record with these fields:

```json
{
  "id": "STR-LAMP-01",
  "name": "Street Lamp 01",
  "category": "street-furniture",
  "source": "https://polyhaven.com/a/street_lamp_01",
  "creator": "Josh Dean",
  "license": "CC0",
  "licenseUrl": "https://polyhaven.com/license",
  "commercialUse": true,
  "redistribution": true,
  "attributionRequired": false,
  "attributionText": "Optional attribution to creator and Poly Haven",
  "sourceFormat": "GLB",
  "runtimePath": "public/assets/city/street-furniture/lamps/street-lamp-01.glb",
  "dimensionsMeters": [0, 3.9, 0],
  "triangleCount": 0,
  "lods": [],
  "textureFormats": [],
  "optimized": false,
  "reviewStatus": "candidate",
  "reviewNotes": "Inspect source file, optimize and test in scene before approval"
}
```

Never set `reviewStatus` to `approved` until the actual file, licence and optimized runtime result have all been checked.

## 7. Acquisition checklist

For every asset:
1. Open the original source page and verify creator, exact licence, commercial use and redistribution conditions.
2. Download the original source file through the source's normal download flow.
3. Save the licence text or a dated evidence snapshot under `manifest/licences/`.
4. Inspect the file in Blender: scale, normals, UVs, materials, texture links, topology, pivot and orientation.
5. Remove unnecessary cameras/lights/hidden meshes and any protected logos/branding.
6. Create LODs and compress geometry/textures for web delivery.
7. Export GLB and load it in a minimal Three.js preview scene.
8. Record source and optimized file sizes, triangle counts, dimensions and licence evidence.
9. Review the asset at the actual drone camera distance on desktop and mobile.
10. Only then mark it approved and commit it.

## 8. Step 2 exit conditions

- [x] Asset families and target quantities identified.
- [x] Candidate source libraries and exact licence policies screened.
- [x] High-poly source models flagged so they cannot accidentally ship unchanged.
- [x] Unsuitable covered-car model explicitly rejected for traffic.
- [x] Bespoke architecture requirements recorded.
- [x] Human and vehicle asset requirements documented.
- [x] Runtime format, scale, LOD, compression and folder conventions defined.
- [ ] Actual production GLB files downloaded, optimized and checked into the repository.
- [ ] Actual pedestrian and traffic models verified with animation/visual tests.
- [ ] Asset manifest populated with exact runtime paths and measured file metadata.

**Honest status:** the inventory and sourcing decisions are complete. The last three acquisition items remain open because no binary model is being represented as downloaded or tested unless its actual file is present and verified. Step 3 must not begin using fake asset paths; the approved asset set must be available first.
