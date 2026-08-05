# ADR-0006: Explicit Errors and Diagnostics

**Status:** Accepted

## Context
Missing knowledge and provider failures must not silently corrupt results.

## Decision
AGS uses typed fatal errors for structural failures and typed recoverable diagnostics for local or expected resolution failures.

## Consequences
Callers receive results plus diagnostics and can distinguish incomplete output from invalid execution.

## Forbidden alternatives
- swallowed exceptions
- generic string-only error handling
- invented fallback interpretations
