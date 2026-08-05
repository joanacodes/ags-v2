# ADR-0007: Stable Identifiers and Provenance

**Status:** Accepted

## Context
Interpretations must be reproducible, traceable, and deduplicated.

## Decision
Grammar matches, knowledge records, providers, datasets, modules, and interpretation results use stable identifiers. Results preserve source provenance.

## Consequences
ID construction inputs must be canonical and version-aware where relevant.

## Forbidden alternatives
- random IDs in deterministic output
- IDs derived from display text alone
- results without source references
