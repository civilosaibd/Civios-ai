# Step 2 — AI Engineering Analysis Engine

## Purpose
Step 2 adds an evidence-backed engineering inventory layer after the Step 1 upload validation and preliminary AI review. It separates deterministic CAD geometry extraction from AI visual observations.

## Deterministic ASCII DXF analysis
The upload workflow now parses the DXF ENTITIES section and reports:
- Walls, columns, beams, slabs, foundations, doors, windows and reinforcement layer groups.
- CAD object counts, polyline/line/circle/arc geometry lengths, closed-polyline/circle areas, layer names and explicit floor labels.
- Drawing extents, CAD text labels and unsupported entity types.
- DXF units only when a supported $INSUNITS header value is present.

Layer names are classification hints, not universal CAD standards. An entity count is not guaranteed to equal a physical member count. Block INSERTs are reported as unsupported and are not expanded. Bulge-based polyline arcs are flagged because they are not expanded. Unknown units remain raw CAD units; the engine never guesses millimetres, metres or feet.

## AI visual engineering observations
The multimodal drawing review can return a structured inventory for visibly identifiable walls, columns, beams, slabs, foundations, doors, windows and reinforcement. It must provide a null count when objects are not clearly countable, identify a floor only when the drawing explicitly labels it, provide visible evidence, and keep confidence as a visual-evidence score rather than engineering correctness. These observations remain unverified.

## Architectural / structural cross-check
Users may add a companion ASCII DXF and identify one drawing as Architectural and the other as Structural. The current comparison:
- Requires explicit units in both drawings.
- Checks whether overall coordinate extents and origin appear aligned.
- Compares column CAD-object counts only when the coordinate frame can be compared.
- Blocks element matching when units, extents or coordinate frames do not agree.

This is a discrepancy flag, not proof that the structure is safe or that the drawings are coordinated. A common coordinate origin and same drawing revision must be confirmed by the user.

## Hard safety boundaries
- No default wall thickness, member size, slab thickness, reinforcement diameter, concrete volume, steel weight, floor repetition or missing geometry is invented by this analysis engine.
- No AI visual count or DXF entity count is automatically transferred to the BOQ/estimate.
- No scale conversion is performed for a DXF with missing/unsupported $INSUNITS.
- No structural design, load analysis, BNBC compliance certification or construction approval is provided.
- A qualified civil/structural engineer must review source drawings and approve dimensions and member schedules before quantities or construction decisions are used.

## Validation
Automated tests cover explicit and missing units, wall/column/beam/slab/foundation/rebar layer classification, closed polyline perimeter/area, legacy POLYLINE/VERTEX parsing, unsupported entity reporting, floor labels and cross-drawing comparison guards.

Production acceptance still requires the latest CI checks, a current Vercel preview, real-world sample drawing validation (including different CAD layer conventions), and review by a qualified engineer.