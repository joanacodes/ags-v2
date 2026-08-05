# ADR-0009: Runtime Validation at Data Boundaries

**Status:** Accepted

## Context
Knowledge packs and future module manifests may enter AGS as unknown external data.

## Decision
Unknown external input is validated at runtime before registration or execution, then represented by strict TypeScript contracts internally.

## Consequences
Invalid data fails early with typed errors and internal code may rely on validated shapes.

## Forbidden alternatives
- casting unknown JSON directly to internal types
- partial silent acceptance of malformed packs
- validation only in the UI
