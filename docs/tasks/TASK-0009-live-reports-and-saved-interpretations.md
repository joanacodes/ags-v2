# TASK-0009: Live Reports, Print/PDF Export, Saved Interpretations

## Status
Implemented (authorized by the architect, 2026-08-05).

## Summary
- Live report assembly (`src/server/report-builder.ts`): sections built from
  the chart's generated domain readings in domain order; ungenerated domains
  render as locked sections that unlock by generating the reading. Technical
  appendix (positions incl. retrogrades, house cusps) from real chart data.
  Demo chart keeps its sample report.
- `GET /api/charts/:id/report`; ReportService swapped to the API.
- Export: "Export Now" (PDF/Print) opens the browser print dialog; app
  chrome (sidebar, header, export rail) hidden via print styles so the
  printed page is the report alone. DOCX/Share remain visibly unwired.
- Overview header buttons wired: Settings -> /settings, Export -> report.
- Overview AI interpretation now persists (readings table, reserved slug
  `_overview_ai`, no new migration) and is shown on page load with its
  saved timestamp; Generate becomes Regenerate.
- Bug fix: `useRegenerateReading` never updated the query cache, so a
  successfully generated reading ("family") never reached the screen. The
  mutation now writes the reading into the cache and invalidates the list
  and progress queries.

## Validation
typecheck ✓ · 28 tests ✓ · lint ✓ · build ✓ · runtime smoke: live report
(11 sections, locked when ungenerated, real appendix), savedAi in payload,
demo report intact.
