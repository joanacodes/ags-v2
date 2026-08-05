# ADR-0003: Deterministic Execution

**Status:** Accepted

## Context
AGS results must be reproducible and testable.

## Decision
Identical normalized inputs, configuration, modules, providers, code, and knowledge versions produce identical structured outputs.

## Consequences
Ordering, IDs, deduplication, and tie-breaking require canonical deterministic rules.

## Forbidden alternatives
- randomness in core execution
- wall-clock-derived IDs
- iteration-order-dependent results
