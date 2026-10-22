# 2D / Render → 3D Construction Visualization: Acceptance Checklist

This checklist is for reviewing the existing CivilOS AI visualization workflow before describing it as production-ready. It is deliberately a verification checklist, not a claim that every item has already passed.

## Existing workflow to verify

- [ ] Upload a JPG/JPEG/PNG/WEBP architectural plan.
- [ ] Upload a finished architectural render and verify it is treated as conceptual reconstruction.
- [ ] Upload a PDF plan and verify rasterization and analysis.
- [ ] Upload an ASCII DXF and verify geometry extraction.
- [ ] Confirm DWG is rejected with a clear instruction to export to DXF.
- [ ] Calibrate dimensions and distinguish reference-derived, user-entered, and estimated values.
- [ ] Review and correct the detected model before saving it.
- [ ] Open the interactive 3D viewer and inspect camera controls.
- [ ] Play, pause, restart, scrub, and change speed in the construction stage player.
- [ ] Verify stage progression: site preparation → foundation → columns → beams/slabs → walls → openings/stairs → roof → completed model.
- [ ] Verify floor-by-floor reveal for buildings with 1, 2, 3, and 4+ floors.
- [ ] Verify the completed view can show the chosen surrounding environment.
- [ ] Export supported model/report formats and confirm failures are shown honestly.
- [ ] Reload the workspace and verify project/model state persists.
- [ ] Verify users cannot read or modify another user's visualization.
- [ ] Verify processing errors, cancelled jobs, stale jobs, and missing storage/configuration produce actionable messages.

## Specific acceptance criteria for render-image input

1. The uploaded render remains the primary visual reference.
2. The interface labels geometry inferred from a single perspective image as conceptual/estimated.
3. Users can supply floor count and approximate dimensions when the image alone cannot establish them.
4. The model does not claim exact hidden geometry or structural adequacy.
5. The generated construction sequence keeps the same floor count and overall massing throughout.
6. Any environment around the building is presented as visualization context, not as information extracted from the source drawing.

## Construction sequence expectations

The animation should show a logical illustrative order, with floors appearing progressively and a completed-building view at the end. If the model does not contain reinforcement geometry, the UI must not imply that detailed rebar placement was derived from the plan. Structural components and construction assumptions remain illustrative unless backed by verified engineering data.

## Definition of ready

Do not mark the feature production-ready based on the presence of a page or viewer alone. The upload → analysis → user verification → model → stage simulation → persistence → export workflow must be exercised end-to-end, including error and authorization cases. Record the actual test results in the pull request before merging.
