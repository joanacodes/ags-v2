# TASK-0006: Supabase Persistence and Auth

## Status
Implemented (authorized by the architect, 2026-08-04).

## Summary
Ported and adapted from the unmerged `feature/engine-foundation` branch of
the previous repository: Supabase clients (browser/server/middleware, all
graceful when unconfigured), auth pages and server actions restyled to the
v2 design system, sidebar auth status, session middleware. New server chart
store (`src/server/charts-store.ts`) merges demo charts with RLS-scoped
user charts; `ChartService` swapped to real API routes with zero component
or hook changes. Migration `202608040001_ags_v2_core.sql` (profiles +
charts, RLS, profile trigger) plus optional `reset-legacy.sql`.

## Behaviour matrix
- No Supabase env: identical to before (mock + in-memory session charts).
- Configured, signed out: sidebar shows "Sign in"; creation stays in-memory.
- Configured, signed in: wizard charts persist privately; favourites persist.

## Validation
npm run typecheck / npm test / npm run lint / npm run build — see report.
