# Demo Estimate — Automated QA checklist

This checklist complements the automated regression tests in `src/lib/estimateExportQuality.test.ts`.
It does not claim that a PDF has been rendered or visually inspected.

## Automated checks

Run these from the repository root:

```bash
npm ci
npm test -- --run
npm run lint
npm run build
```

The focused regression suite checks:
- finite, non-negative project and material values;
- material and BOQ row arithmetic;
- quotation total = base project cost + one contractor profit amount;
- timeline phase fields and positive durations;
- deterministic outputs for identical inputs;
- supported material-rate overrides changing generated costs.

## Manual PDF/export smoke test

1. Open Demo Estimate with the default demo project and a second project with several floors.
2. Download the Professional Report PDF; confirm the file opens and every page has a readable header/footer and page number.
3. Check the project summary, cost breakdown, material schedule, labor schedule, detailed BOQ, quotation adjustments, structural-load indicators and timeline.
4. Confirm each material/labor/BOQ schedule total equals the visible rows (allowing only documented rounding).
5. Export BOQ CSV and quotation CSV. Open them in a spreadsheet and compare line items and totals with the UI/PDF.
6. Try an empty or filtered BOQ where supported; no blank download, uncaught error, or clipped table should occur.
7. Try an invalid/non-positive quotation total in a controlled test fixture; export should stop with a user-facing message rather than download a misleading report.
8. Check a narrow mobile viewport and a long BOQ to spot horizontal overflow and pagination clipping.

## Scope and limitations

The tests validate deterministic application data and arithmetic invariants. They do not certify quantities against drawings, verify live market rates, prove BNBC/code compliance, or replace a licensed engineer's review. PDF rendering, browser downloads, Vercel deployment and real-device layout still require CI or manual verification.
