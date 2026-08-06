# TASK-0011 — Temporal Module (SPEC, awaiting architect validation of KB drafts)

## Endpoints (confirmed in official docs, 2026-08-06)
- Progressions: /docs/western/progressions
- Solar Return: /docs/western/solar-return ("annual birthday chart & themes")
- Planetary Return: /docs/western/planetary-return (Saturn return via planet=saturn)
Base: https://api.freeastroapi.com · auth x-api-key (same as natal).

## Knowledge drafts pending validation (grounding rule)
- techniques/saturn_return · techniques/solar_return · techniques/secondary_progressions
(files under knowledge/vocabulary/techniques/*, marked DRAFT)

## Build plan (next session, after validation)
1. Provider: three fetchers in src/server/providers (reuse key/mapping utils).
2. Temporal store: compute for a chart — next Saturn return window (+ last),
   solar returns for the next 6 years from generation date, progressed
   positions now + upcoming progressed sign changes.
3. Grammar: temporal facts -> matches grounded in techniques/* + natal
   placements; composer group "Temporal Cycles".
4. Report: new section "The Years Ahead" (Saturn return, 6 solar returns,
   progression chapters) + reading page /charts/:id/temporal.
5. Report date-anchored: computed from the date the report is generated.
