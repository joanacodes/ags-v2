# ADR-0002: Knowledge Is External Data

**Status:** Accepted

## Context
AGS must support multiple traditions, locales, and licensed knowledge sources without engine rewrites.

## Decision
Astrological meanings are stored in versioned JSON-compatible knowledge packs outside core TypeScript logic.

## Consequences
Knowledge can be replaced, localized, licensed, and versioned independently.

## Forbidden alternatives
- prose meanings embedded in source code
- UI text acting as engine knowledge
- provider code inventing missing meanings
