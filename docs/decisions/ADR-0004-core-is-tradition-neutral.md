# ADR-0004: Core Is Tradition-Neutral

**Status:** Accepted

## Context
Natal, mundane, traditional, modern, Vedic, and other systems may disagree in meaning and technique.

## Decision
The core engine exposes generic contracts and does not privilege one astrological tradition.

## Consequences
Tradition-specific behavior belongs in modules, providers, configuration, or knowledge packs.

## Forbidden alternatives
- modern psychological defaults hidden in core
- traditional rulership assumptions hardcoded globally
- one tradition defining universal engine semantics
