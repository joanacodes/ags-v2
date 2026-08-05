# TASK-0001: Grammar Registry and Executor

## Status
Approved for implementation after this governance branch is merged.

## Objective
Implement the first tradition-neutral grammar execution foundation. The task creates generic rule contracts, deterministic registration, execution, and diagnostics. It must not add astrology meanings or system-specific interpretation behavior.

## Governing documents

- `AGS_MASTER_SPEC.md`
- `AGENTS.md`
- ADR-0001
- ADR-0003
- ADR-0004
- ADR-0005
- ADR-0006
- ADR-0007
- ADR-0008
- ADR-0010

## Exact files allowed

Create or modify only:

- `src/grammar/types.ts`
- `src/grammar/errors.ts`
- `src/grammar/rule.ts`
- `src/grammar/registry.ts`
- `src/grammar/executor.ts`
- `src/grammar/index.ts`
- `src/grammar/__tests__/grammar.test.ts`
- `tsconfig.test.json`
- `package.json`
- `.gitignore`

If any listed file already exists, inspect and extend it rather than creating a competing abstraction.

## Files forbidden

Do not modify:

- `src/app/**`
- `src/components/**`
- `src/hooks/**`
- `src/services/**`
- `src/data/**`
- `src/interpretation/**`
- `src/knowledge/**`
- `src/types/index.ts`
- documentation or ADR files

## Required contracts

### Normalized grammar input

Define a JSON-compatible, readonly input contract containing:

- stable input ID
- normalized facts
- optional metadata

Facts remain generic and must support typed structure/value records without importing UI chart types.

### GrammarRule

A grammar rule must expose:

- stable `id`
- stable `structure`
- `evaluate(input, context)`

Evaluation returns zero or more grammar matches and may be synchronous or asynchronous only if one consistent contract is chosen for the entire registry. Prefer a Promise-normalized executor so both implementations can be supported without branching public APIs.

### GrammarMatch

A match must contain:

- stable ID
- rule ID
- structure
- normalized JSON-compatible values
- source fact IDs
- optional metadata

It must not contain interpretation prose.

### GrammarRegistry

Required behavior:

- register one rule
- reject duplicate rule IDs
- retrieve by ID
- list rules sorted deterministically by rule ID
- clear rules

### GrammarExecutor

Required behavior:

- accept normalized input, execution context, and registry
- execute rules in deterministic registry order
- isolate recoverable rule failures as diagnostics
- treat contract corruption as fatal
- canonicalize match ordering
- reject duplicate match IDs produced by different outputs or emit a typed fatal error
- return `{ matches, diagnostics }`
- repeated execution with identical inputs must be deeply equal

## Diagnostics

Define typed diagnostic codes at minimum for:

- `RULE_FAILED`
- `RULE_UNSUPPORTED_INPUT`

Diagnostics include rule ID, code, message, and optional JSON-compatible metadata.

## Errors

Define typed errors at minimum for:

- duplicate rule registration
- duplicate match ID
- invalid rule output

## Determinism rules

- registry order is ascending rule ID
- match order is ascending structure, then rule ID, then match ID
- source fact IDs are canonicalized ascending
- metadata must not affect ordering unless explicitly stated
- no random or wall-clock values

## Tests required

Test at minimum:

1. registration, retrieval, deterministic listing, and clearing
2. duplicate rule rejection
3. zero, one, and multiple matches
4. deterministic rule execution order
5. deterministic match ordering
6. repeated execution equality
7. recoverable rule failure
8. duplicate match ID rejection
9. empty registry
10. no interpretation prose is required or introduced by contracts

## Validation commands

Run and report actual results:

```bash
npm run typecheck
npm test
npm run lint
npm run build
git diff --check
```

If the repository lacks a test command, add the smallest dependency-free Node test setup consistent with the existing TypeScript configuration. Do not add a testing dependency.

## Out of scope

- concrete `PlanetInSignRule` implementation
- concrete `PlanetInHouseRule` implementation
- concrete aspect calculations
- chart normalization from UI models
- knowledge resolution
- interpretation providers
- combinations
- module manifests
- frontend integration

## Ambiguity rule

If an existing grammar implementation conflicts with this task or any required contract cannot be implemented without changing forbidden files, stop and report `ARCHITECTURAL DECISION REQUIRED` before editing.
