# AGS — Astrology Grammar System

A dark-theme, professional astrology workspace (frontend only). Built with
Next.js 14 (App Router), TypeScript, TailwindCSS, TanStack Query, React Hook
Form + Zod, Framer Motion and Lucide icons.

The UI ships with two themes — the original dark mode (default) and a light
mode in coffee brown, powder blue and gold — switchable from the sidebar
("Appearance") or the header toggle on mobile, persisted per device.

> This is a **UI shell**: no backend, no auth, no real astrological
> calculations. All data comes from local mock JSON served through a service
> layer designed to be swapped for a real API without touching the UI.

## Getting started

```bash
npm install
npm run dev        # http://localhost:3000
npm run build      # production build
npm run lint       # ESLint (next/core-web-vitals)
npm run typecheck  # tsc --noEmit
npm start          # serve the production build
```

## Screens

| Route | Screen |
|---|---|
| `/dashboard` | Workspace dashboard (stats, transit density, recent charts, engine status) |
| `/charts` | Birth Chart Library (search, filters, grid/list) |
| `/charts/new` | Create Chart wizard (4 steps, Zod validation, local draft save) |
| `/charts/[chartId]` | Chart Overview (interactive SVG wheel, placements, themes) |
| `/charts/[chartId]/readings` | Reading Hub (11 life domains) |
| `/charts/[chartId]/readings/[slug]` | Reading page (evidence, styles, factors rail, chart-facts mode) |
| `/charts/[chartId]/report` | Full Report Preview (sections, locked content, export rail) |
| `/reports`, `/settings` | Index / placeholder screens |

## Interpretation engine (new)

`/charts/:id/interpretation` shows two layers, in this order:

1. **Composed sentences** — deterministic. Chart facts are normalized
   (`src/normalization`), matched by tradition-neutral grammar rules
   (`src/grammar`), and each match pulls its wording from the AGS knowledge
   base (`knowledge/` -> generated pack in `src/data/knowledge-pack.json`).
   Same chart, same sentences, every time. Missing knowledge produces
   diagnostics, never invented meaning.
2. **AI interpretation** — on demand, below the grammar. The model receives
   ONLY the composed sentences and must not introduce meanings absent from
   them. Requires `ANTHROPIC_API_KEY` in `.env.local` (server-side only);
   without it the UI shows a clear "not configured" notice.

Regenerate the pack after editing `knowledge/`:

```bash
node scripts/build-knowledge-pack.mjs
```

Engine tests (dependency-free, node:test): `npm test`.

## Architecture

```
Pages (src/app)          – route composition only
  └── Components         – presentational + local interaction state
        └── Hooks        – TanStack Query wrappers (src/hooks)
              └── Services (src/services)  ← the ONLY layer that knows
                    └── Mock JSON (src/data)   where data comes from
```

Rules the codebase follows:

- **One central data model** — every entity type lives in `src/types/index.ts`.
- **No hardcoded astrology values in components.** Planet positions, aspects,
  reading text, report sections all come from JSON via services. Glyphs and
  formatting helpers live in `src/lib/astro.ts`.
- **Services are async and Promise-based** with a small artificial delay, so
  loading skeletons, error states and mutation pending states are real.

### Swapping in a real backend

Only files in `src/services/` need to change. Each service method already has
the signature of a future endpoint, e.g.:

```ts
// chart-service.ts — today
async getChartById(id: string): Promise<Chart> {
  await delay(250);
  return findInJson(id);
}

// tomorrow
async getChartById(id: string): Promise<Chart> {
  const res = await fetch(`/api/charts/${id}`);
  if (!res.ok) throw new Error("Failed to load chart");
  return res.json();
}
```

Hooks, components and pages are untouched: they consume typed Promises and
already handle loading / error / empty states. The wizard's mock geocoder
(`src/lib/geo.ts`) is the same idea — replace `lookupPlace()` with a places
API call returning the same `GeoMatch` shape.

### Notable implementation details

- **Chart wheel** (`src/components/chart/chart-wheel.tsx`): pure SVG computed
  from JSON longitudes; Ascendant pinned at 9 o'clock, zodiac running
  counterclockwise. Planets, houses and aspect lines are clickable and drive a
  selection readout. No ephemeris math — positions are data.
- **Wizard** (`src/app/charts/new`): single React Hook Form with a Zod schema;
  per-step validation via `trigger()`, "birth time unknown" toggle relaxing
  the time requirement, and a localStorage draft (`ags:chart-draft`) restored
  on return.
- **Reading page**: writing style switch (Poetic / Clinical / Conversational)
  and "Regenerate" run through a mutation to simulate re-generation; the
  evidence card, factors rail and suggested readings are all JSON-driven.
- **Report**: sections render from `sample-report.json`, including locked
  sections and a settings-gated technical appendix; export is a placeholder
  mutation.
- **Theme**: semantic HSL tokens in `tailwind.config.ts`
  (`surface / line / ink / accent / success / warning / danger`) — restyling
  the app is a token edit, not a component sweep.

## What is intentionally NOT here

Backend, database, authentication, real astrological calculation, external
APIs, AI generation. Every place where those will plug in is marked by a
service method or a clearly labelled placeholder.
