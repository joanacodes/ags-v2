# TASK-0010b: Extended Factors, Clinical Default, Editable Reports

## Status
Implemented (authorized by the architect, 2026-08-05).

## Summary
- Extended bodies: Chiron, Lilith, North/South Node and the Vertex now flow
  end to end — requested from FreeAstroAPI (include_features), mapped into
  `Chart.points`, normalized as facts, matched by new grammar rules
  (point_in_sign, point_in_house, planet_retrograde), composed with grounded
  sentences (retrograde semantics come from the engine's condition
  knowledge: "internalized or reflective processing style").
- KNOWLEDGE DRAFTS pending architect validation: `points/lilith` and
  `angles/vertex` identity entries were added (marked DRAFT in the files).
- Domain scopes updated: Family covers mother figure (Moon/4th), father
  figure (Saturn-Sun/10th), siblings (Mercury/3rd) with structured prompt
  guidance; Healing gains Chiron+Lilith; Love gains Vertex+Lilith; Purpose
  gains the Nodes.
- Writing style is real and clinical by default; per-style prompt
  instructions; the generate route accepts {style}.
- Coverage checklist injected into every prompt (explicit factor list the
  model must address) — targets the "missing parts" reports.
- Readings hub: "Generate all readings" runs every pending domain
  sequentially with progress and error surfacing.
- Reports: Summary section first; sections carry the FULL reading text with
  sub-headings; sections are editable inline (edits persisted per chart,
  reserved slug `_report_edits`, applied on every rebuild and in print).
- Print/PDF: tables never split across pages (break-inside rules), headings
  stick to their content.

## Deferred (next tasks, per architect notes)
- Temporal module: progressions (sign changes over the years — confirmed
  real via secondary progressions), Saturn return, solar returns over the
  next 6 years (FreeAstroAPI endpoints exist for all three).
- Readee ratings and comments on readings.

## Validation
typecheck ✓ · 29 tests ✓ (incl. extra-points mapping) · lint ✓ · build ✓
