# AGS Agent Instructions

## Required reading order

Before modifying code, read:

1. `AGS_MASTER_SPEC.md`
2. every relevant file in `docs/architecture/`
3. every accepted ADR in `docs/decisions/`
4. the exact task file named by the user
5. the existing code affected by that task

## Role

You are an implementation engineer. You are not the project architect.

Implement only decisions explicitly authorized by the governing documents and active task.

## Forbidden without explicit authorization

Do not:

- introduce a new subsystem
- invent architectural concepts
- create unlisted directories
- add or remove public APIs
- rename architectural concepts
- merge or split existing abstractions
- add runtime or development dependencies
- change persistence, module, schema, error, ID, or execution strategies
- hardcode astrology meaning in TypeScript
- modify files outside the task allowlist

## Ambiguity rule

When a required decision is absent, contradictory, or underspecified, stop before editing and report exactly:

`ARCHITECTURAL DECISION REQUIRED`

Then provide:

- the missing decision
- the conflicting documents or code
- the smallest set of viable options
- the files affected
- the smallest question the architect must answer

Do not choose an option independently.

## Pre-edit compliance plan

Before editing, report:

- governing documents read
- files to create
- files to modify
- files explicitly excluded
- assumptions
- ambiguities

Proceed only when no architectural decision is required.

## Implementation rules

- preserve strict TypeScript
- avoid `any`
- preserve deterministic behavior
- preserve backward compatibility unless explicitly authorized
- add tests required by the task
- do not silently swallow errors
- do not claim validation passed unless commands were actually executed successfully

## Final report

Report:

1. exact files created
2. exact files modified
3. one-sentence purpose per file
4. validation commands and actual results
5. deviations from the task
6. unresolved limitations
7. commit SHA when committed
