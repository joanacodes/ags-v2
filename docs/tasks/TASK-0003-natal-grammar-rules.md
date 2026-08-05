# TASK-0003: natal-grammar-rules

## Status
Implemented (authorized directly by the architect, 2026-08-04).

## Summary
Concrete natal rules (src/grammar/rules): planet_in_sign, planet_in_house, planet_aspect_planet, angle_in_sign, house_cusp_in_sign, each attaching explicit knowledge references.

## Validation
npm run typecheck / npm test (20 passing) / npm run lint / npm run build — all green at implementation time.
