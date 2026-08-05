# TASK-0008 / TASK-0010: Loud Persistence & Generated Domain Readings

## Status
Implemented (authorized by the architect, 2026-08-05).

## TASK-0008 — persistence is never silent
Chart creation surfaces storage outcome end to end: the store reports the
exact Supabase insert error (or "not configured" / "not signed in"), the API
returns it, and the wizard shows a warning card ("created but NOT saved")
instead of silently redirecting. Memory fallback remains, but visibly.

## TASK-0010 — full per-domain readings
- `src/interpretation/domains.ts`: 11 domain definitions with deterministic
  factor scopes (planets/houses/angles per domain; summary = whole chart).
- `src/interpretation/reading-pipeline.ts`: domain-filtered grammar matches
  -> composed sentences -> teaching-voice AI (structured JSON, validated,
  one retry) -> full `Reading` object with evidence (chartFactors,
  relevantAspects), confidence from evidence counts, suggested next.
- Teaching prompt: beginner-first, explains mechanics as it goes, concrete
  everyday examples per section ("In practice, this can look like…"),
  mandatory coverage of every factor, no invention. max_tokens 6000
  (general interpretation raised to 4000 — fixes truncated readings).
- Storage: `readings` table (migration 202608050002, RLS) + memory fallback.
- API: GET list/progress, GET one, POST …/readings/:slug/generate.
- ReadingService swapped to API routes; demo chart keeps its mock readings.
- UI: domain cards now appear for every chart below the wheel; astrological
  data tables (positions, cusps, aspects) render on the overview below the
  wheel; ungenerated readings show a Generate CTA; the reading page renders
  generated content through the existing components unchanged.

## Validation
typecheck ✓ · 28 tests ✓ · lint ✓ · build ✓ · runtime smoke: create ->
11 scaffolds -> generate guard (409 uncalculated / 503 no key) -> demo
readings intact -> storageError surfaced.
