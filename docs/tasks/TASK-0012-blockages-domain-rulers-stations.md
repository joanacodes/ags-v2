# TASK-0012: Blockages & Repeating Patterns reading, house rulers, stations

## Status
Implemented (authorized by the architect, 2026-10-27).

## Why
A client asked three questions in one message: is something blocking me that
was created before or after my birth; why does what I announce get delayed or
cancelled; is it a family pattern, something unseen. The existing readings
split that material across Family, Pain & Healing, Communication and Purpose,
and three structures every one of those questions runs through were invisible
to the engine: which planet rules which house, planets standing still at
birth, and contacts to the lunar nodes. The report also never states the
South Node's position. Curses, karma and fate are excluded by the knowledge
base (house 12 "notInherent", South Node "doesNotMean", nodal axis
"exclusions"); the new reading keeps that line explicitly.

## What
1. **Reading domain** `blockages-patterns`, deep. Focus: Saturn, Mercury,
   Pluto, Neptune, Moon; houses 3, 4, 8, 12; the IC; both nodes, Chiron,
   Lilith. Contacts measured from Chiron, Lilith and the South Node (a
   contact to the South Node is the opposition to the North Node, so one
   node stands for the axis). The rest of the chart arrives as supporting
   material, as for the other deep readings.
2. **Prompt** `reading.deep.blockages-patterns` (editable in Settings).
   Hard rule: never curse, karma, past life, evil eye, black magic, fate,
   destiny, never "someone did this to you"; translate that vocabulary into
   attention, timing and exposure. Ten sections, one of them the check that
   is not astrology: a one-month log of what was announced and what
   happened, next to the good things never announced, plus one sentence
   pointing a persistent stuck or low feeling to a doctor or therapist.
3. **Grammar** (`src/grammar/rules/convention-rules.ts`):
   `natal.house_ruler_in_house` emits one match per cusp whose ruler is
   placed, linking both houses; `natal.planet_stationary` fires when a
   body's daily motion is within its threshold. Both are factories that take
   their table as a parameter; built without one they raise
   `RULE_UNSUPPORTED_INPUT` diagnostics instead of guessing.
4. **Knowledge**: `knowledge/conventions/rulerships.json` (modern and
   traditional tables, default modern) and `knowledge/conventions/stations.json`
   (one tenth of each body's mean daily motion). The pack builder emits them as
   `conventions/*` records with a single `reference` module;
   `src/knowledge/conventions.ts` validates them at the boundary and resolves
   an absent record to null.
5. **Data**: `speed` (degrees per day, signed) on `PlanetPosition` and
   `PointPosition`, mapped from the provider's `speed` field (the request
   already asked for `include_speed`), normalized as a fact value only when
   present so older charts normalize unchanged.
6. **Composer**: groups "Stationary Motion" and "House Rulers"; sentences
   assembled from the two house records, the planet record and the
   `conditions/station` record only.
7. **Reading pipeline**: domain filter for both structures (a ruler link
   belongs to a domain through either house it connects), evidence cards,
   contact header naming the domain's sources, suggested-next order.
8. **Point contacts**: any requested point can be a source; node-to-node
   pairs are skipped.
9. **UI**: lock icon, grid subtitle and short title.

## Decisions recorded
- Rulership is reference data with a tradition label, never a table in the
  engine's TypeScript (ADR-0002, ADR-0004). The provider keeps its own modern
  table for the chart-ruler summary; unifying the two is a separate task.
- The traditional table ships but is unused until a chart configuration
  option selects it. That option is a public type change and was not added.
- Station threshold is per body, in data, editable without code.
- The ruler domain filter uses houses only, not the ruling planet, so the
  coverage checklist of planet-heavy domains does not grow with every ruler.
- No new dependency, no migration (readings are keyed by slug text).

## Limitations
- Charts calculated before this change carry no speeds. `POST
  /api/charts/:id/calculate` recalculates and stores them for any non-demo
  chart; the overview button only shows for pending or failed charts.
- The provider field name `speed` follows the request flag; if a live
  response names it differently the mapper keeps nothing and stations stay
  silent. Verify once against a live response.
- Minor aspects are still not requested, so a close quincunx stays unseen.
- No prenatal lunation, transits or profections (temporal scope, TASK-0011).
- The report's "Chart data" appendix still lists planets and cusps only.

## Validation
`npm run typecheck` ✓ · `npm test` 87 passing (13 new: convention rules,
conventions loader, domain scope, composer sentences, normalization speed,
mapper speed, node contacts) ✓ · `npm run lint` ✓ · `npm run build` ✓.
Smoke run of the compiled pipeline on a chart shaped like the client's
(Mercury at −0.005°/day, twelve cusps, four points): no grammar or
composition diagnostics, one station, twelve ruler links, 41 of 67 factors
selected by the new domain, South Node trine Mars at 0°10' among the
contacts. Live provider call not run in the build environment.
