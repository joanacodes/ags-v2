# ADR-0008: Public API Is Deliberate

**Status:** Accepted

## Context
Accidental exports make future refactoring unsafe.

## Decision
Only explicitly approved contracts are exported publicly. Existing public APIs are additive and stable unless an accepted ADR authorizes a breaking change.

## Consequences
Internal helpers remain internal and breaking changes require migration plans.

## Forbidden alternatives
- barrel-exporting entire internal directories
- renaming public symbols casually
- exposing experimental types without approval
