# ADR-0005: Modules Extend Without Core Rewrites

**Status:** Accepted

## Context
AGS must support natal, transit, synastry, composite, returns, mundane, astrocartography, horary, and electional systems.

## Decision
New astrology systems are delivered through explicit modules that register compatible rules, providers, schemas, and knowledge packs.

## Consequences
Core contracts must remain generic and module activation must be explicit.

## Forbidden alternatives
- adding system-specific branches throughout core execution
- implicit global module mutation
- duplicating the engine per astrology system
