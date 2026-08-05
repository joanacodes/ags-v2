# TASK-0004: knowledge-registry-and-pack

## Status
Implemented (authorized directly by the architect, 2026-08-04).

## Summary
Knowledge layer (src/knowledge) + generated core pack (scripts/build-knowledge-pack.mjs -> src/data/knowledge-pack.json) from knowledge/vocabulary; runtime validation, duplicate rejection, explicit unresolved outcomes.

## Validation
npm run typecheck / npm test (20 passing) / npm run lint / npm run build — all green at implementation time.
