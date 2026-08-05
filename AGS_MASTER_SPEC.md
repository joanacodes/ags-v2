# AGS Master Specification

## 1. Purpose

AGS (Astrology Grammar System) is a deterministic, modular, data-driven engine for transforming normalized astrological facts into structured interpretations.

AGS is not a chart-calculation library, not an AI text generator, and not a repository of hardcoded astrological meanings. It is the orchestration layer between chart facts, generic grammar structures, external knowledge packs, and final interpretations.

## 2. Architectural invariants

1. Grammar describes astrological structure, never meaning.
2. Astrology meanings live in external JSON-compatible knowledge packs.
3. Interpretation is deterministic for identical inputs, configuration, code, and knowledge versions.
4. Core engine code remains tradition-neutral.
5. New astrology systems are added through modules and knowledge packs, not by rewriting the engine.
6. Public APIs must be explicit, typed, stable, and additive where possible.
7. Missing knowledge produces diagnostics, never invented meaning.
8. Duplicate IDs are rejected explicitly.
9. Ordering and deduplication rules must be stable and testable.
10. UI code must not become the source of truth for engine behavior.

## 3. Project boundaries

### AGS owns

- normalized grammar outputs
- generic grammar rules and combinations
- grammar rule registration and execution
- knowledge pack contracts, validation, registration, and lookup
- interpretation providers, pipelines, diagnostics, priorities, and results
- module contracts
- deterministic IDs and provenance

### AGS does not own

- ephemeris calculations
- geocoding or timezone lookup
- UI rendering
- authentication or billing
- AI-generated astrological meaning
- copyrighted or licensed knowledge content unless explicitly supplied as a separate pack

## 4. Core processing flow

```text
Normalized chart facts
  -> Grammar executor
  -> Grammar matches and combinations
  -> Knowledge resolver
  -> Interpretation providers
  -> Interpretation builder
  -> Deduplication and deterministic sorting
  -> Results plus diagnostics
```

## 5. Grammar layer

The grammar layer expresses reusable astrological structures such as:

- PlanetInSignRule
- PlanetInHouseRule
- PlanetAspectPlanetRule
- HouseRulerRule
- PointAspectPointRule
- CombinationRule

A grammar match must contain a stable ID, structure ID, normalized values, and optional explicit knowledge references. Grammar rules must not contain prose interpretations, tradition-specific claims, or locale-specific text.

## 6. Knowledge layer

Knowledge is supplied as JSON-compatible packs composed of datasets and records.

A knowledge record may contain:

- stable ID
- title
- body
- locale
- module
- tradition
- priority
- tags
- metadata

The knowledge layer validates unknown input at runtime, rejects malformed data, rejects duplicate identifiers, and supports deterministic lookup. Knowledge resolution must return explicit resolved or unresolved outcomes.

## 7. Interpretation layer

The interpretation layer consumes grammar output and resolved knowledge. It is responsible for:

- provider registration
- context handling
- knowledge resolution
- result construction
- provenance preservation
- stable IDs
- priority normalization
- deterministic ordering
- deduplication
- recoverable diagnostics
- fatal structural errors

Providers may transform resolved knowledge into interpretation candidates, but they may not invent astrology meaning not present in knowledge data.

## 8. Modules

A module packages behavior for an astrology system or domain, for example:

- natal
- transit
- synastry
- composite
- solar return
- lunar return
- mundane
- astrocartography
- horary
- electional

Modules may register grammar rules, providers, schemas, and compatible knowledge packs. Modules must not mutate global engine behavior implicitly.

## 9. Knowledge packs

A knowledge pack is versioned, locale-aware, module-aware, and optionally tradition-aware. Packs are external data products. The engine must support multiple packs without embedding their content into TypeScript.

Future pack capabilities may include overlays, compatibility ranges, fallbacks, inheritance, and licensing metadata. These capabilities require explicit ADRs before implementation.

## 10. Determinism

For identical normalized input, enabled modules, provider set, configuration, and knowledge pack versions, AGS must produce byte-equivalent structured output.

Determinism requires:

- stable IDs
- canonical serialization inputs
- stable provider order
- stable grammar match order
- stable priority comparison
- stable tie-breaking
- stable deduplication
- no wall-clock or random values in core execution

## 11. Errors and diagnostics

Structural corruption, invalid contracts, or impossible engine states may throw typed fatal errors.

Missing records, unsupported structures, and provider-local failures should normally emit typed recoverable diagnostics. Exceptions must not be silently swallowed.

## 12. Public API

Public exports must be deliberate. Internal helpers remain internal unless a task explicitly promotes them. Existing public exports must not be renamed or removed without an accepted ADR and migration plan.

## 13. TypeScript rules

- strict TypeScript
- no `any`
- prefer readonly data
- use discriminated unions for result states
- use typed error codes
- avoid hidden mutation
- avoid circular dependencies
- no new dependency without explicit authorization

## 14. Testing requirements

Every deterministic subsystem must test:

- repeated execution equality
- stable ordering
- stable IDs
- duplicate rejection
- invalid input handling
- empty input
- recoverable failures
- fatal failures where applicable

## 15. Current repository status

### Implemented in main

- Next.js UI shell
- mock chart and reading data
- frontend services and hooks
- grammar registry and executor (TASK-0001)
- chart normalization (TASK-0002)
- concrete natal grammar rules (TASK-0003)
- knowledge registry + generated core vocabulary pack (TASK-0004)
- deterministic sentence composition, interpretation pipeline, API routes,
  interpretation page, and knowledge-grounded AI layer (TASK-0005)

### Implemented in prior Codex work but not yet merged into main

- preliminary grammar output contracts
- preliminary knowledge registry and loader
- preliminary interpretation pipeline and tests

These preliminary files must be reviewed against this specification before adoption.

### Planned

- normalized chart input
- grammar rule registry
- grammar executor
- combination evaluation
- module manifests
- production knowledge pack schemas
- natal module
- transit module
- frontend integration
- persistence and remote loading

## 16. Governance

Architecture is controlled by this specification, accepted ADRs, architecture documents, and approved task contracts.

When these documents conflict, precedence is:

1. accepted ADR
2. AGS_MASTER_SPEC.md
3. architecture document
4. approved task file
5. existing implementation

Conflicts must be reported before implementation.

## 17. Terminology

- **Fact**: normalized astrological input datum.
- **Grammar rule**: generic detector of an astrological structure.
- **Grammar match**: deterministic output from a grammar rule.
- **Combination**: deterministic relation among multiple matches.
- **Knowledge record**: external meaning-bearing data.
- **Knowledge pack**: versioned collection of datasets and records.
- **Provider**: interpretation adapter operating on grammar and knowledge.
- **Interpretation result**: final structured meaning with provenance.
- **Module**: installable astrology-system package.
- **Diagnostic**: typed non-result information about execution.
