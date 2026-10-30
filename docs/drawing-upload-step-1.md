# Drawing Upload Intelligence — Step 1

## Scope
This phase establishes safe drawing intake and preliminary document triage for the Building Estimate upload page and File Assistant. It is not a quantity takeoff engine and does not certify engineering measurements.

## Supported input
- PDF, up to 20 MB. The AI review renders and inspects the first five pages only. If the source PDF contains more than five pages, the result is marked incomplete and the Building Estimate handoff remains blocked. Split the PDF into page batches and review each batch separately.
- JPG/JPEG, PNG and WEBP, up to 20 MB, with a minimum decoded image dimension of 256 × 256 pixels.
- ASCII DXF, up to 20 MB, provided it contains a readable ENTITIES section. The AI text review is limited to the first 30,000 characters. Large/truncated DXFs are marked incomplete and cannot proceed to estimate handoff in this phase. The existing CAD/visualization workflow is the appropriate place for CAD geometry review.
- DWG is detected, but deliberately rejected. Export it as ASCII DXF from a compatible CAD application. Metadata-only DWG analysis is not presented as geometry analysis.

## Validation
The upload utility validates the filename extension, file size, file signature, basic image decoding/resolution and DXF text structure. File-name or CAD-layer based discipline detection is a hint, not authoritative classification. Users can correct the detected drawing discipline before review.

## AI review
The authenticated `ai-analyze` Edge Function accepts a bounded set of up to five page-numbered raster images or readable DXF text. It keeps the existing JWT verification, endpoint rate-limit and AI credit checks. Metadata-only requests are rejected. AI output is shape-checked before rendering.

The AI is instructed to treat drawing annotations as untrusted document content, not instructions; not to invent dimensions, scale, member sizes, areas or quantities; and to report uncertainty, missing information and conflicts. AI observations are not verified measurements.

## Estimate handoff safety gate
The Building Estimate upload flow will not use AI-inferred area or floor count to fill project dimensions. The user must enter positive project dimensions and floor information from the drawing, review the analysis, acknowledge the warnings, and choose a supported architectural/floor-plan/site-plan/general drawing type. Incomplete PDF/DXF reviews and structural-only/member-only, plumbing or electrical drawings cannot be submitted to the whole-building estimate flow.

These controls are safeguards, not proof that user-entered values are correct. Quantity takeoff must wait for the dedicated geometry, scale calibration, engineering calculation and verification work in later phases.

## Data handling note
This upload path sends the selected rasterized drawing pages or DXF text to the existing authenticated `ai-analyze` Edge Function, which forwards the bounded content to the configured Lovable AI Gateway. This phase does not create a drawing record or persist the original upload in Supabase Storage. Do not upload confidential project drawings unless the project owner has approved this AI-processing route and its provider data-handling terms.

## Validation still required
Before production release, run the repository's unit tests, lint and production build; deploy the updated `ai-analyze` Edge Function to the configured Supabase project; test real sample PDFs/images/DXFs; and verify the Vercel preview on desktop and mobile. This GitHub change alone does not deploy the Edge Function or make it live on the production website.
