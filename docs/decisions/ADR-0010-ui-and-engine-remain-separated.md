# ADR-0010: UI and Engine Remain Separated

**Status:** Accepted

## Context
The current repository contains a Next.js UI shell and mock data, while AGS engine behavior must remain independently testable.

## Decision
UI components, hooks, and services consume engine APIs but do not define grammar, knowledge, or interpretation semantics.

## Consequences
Engine code must remain usable without React or Next.js and frontend integration occurs through adapters or services.

## Forbidden alternatives
- engine rules inside React components
- frontend mock data becoming authoritative knowledge contracts
- engine packages depending on UI modules
