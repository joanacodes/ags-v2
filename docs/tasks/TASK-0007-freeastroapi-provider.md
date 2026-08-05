# TASK-0007: FreeAstroAPI Provider Integration

## Status
Implemented (authorized by the architect, 2026-08-04).

## Summary
Real natal calculation via FreeAstroAPI (api.freeastroapi.com, x-api-key),
adapted from the audited `feature/knowledge-model` branch and re-mapped to
the v2 Chart model (`src/server/providers/freeastroapi.ts`): planets,
houses, angles, major aspects (orb formatting), summary (sun/moon/asc,
chart ruler by modern rulership, dominants from the provider, strongest
houses, provider confidence). Calculation runs at chart creation; a
`POST /api/charts/:id/calculate` route plus a "Calculate now" button on the
overview retries pending/failed charts. Placeholder Aries placements are no
longer shown for uncalculated charts. New status value: `failed`.

## Environment
`FREE_ASTRO_API_KEY` in `.env.local` (server-side only). Without it,
charts stay in the `processing` state and the button explains what to add.

## Validation
typecheck / 23 passing tests (incl. mapper fixtures: degree-minute
conversion, minor-aspect filtering, unknown-body skipping, determinism) /
lint / build — all green. Live API calls not run in the build environment.
