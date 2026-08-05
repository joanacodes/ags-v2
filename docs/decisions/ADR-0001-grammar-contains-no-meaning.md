# ADR-0001: Grammar Contains No Meaning

**Status:** Accepted

## Context
Grammar must detect reusable astrological structures across traditions and locales.

## Decision
Grammar rules and grammar matches contain structure, normalized values, IDs, provenance, and optional knowledge references only. They contain no interpretive prose or tradition-specific meaning.

## Consequences
The same grammar engine can support multiple knowledge traditions and locales.

## Forbidden alternatives
- hardcoded interpretations in rule classes
- locale-specific prose in grammar output
- using grammar rule names as hidden meaning containers
