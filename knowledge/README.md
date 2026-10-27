# AGS Knowledge Base

The astrological "grammar" of AGS, consolidated from 492 source packages
(AGS.zip) into one deduplicated tree. This is the source material the AI
interpretation engine reads — **server-side only, never shipped to the
browser**.

## Structure

```
knowledge/
├── manifest.json        # generated index: every entity, its modules, stats
├── vocabulary/          # 77 entities — the meanings
│   ├── planets/         # 10  (sun … pluto)
│   ├── signs/           # 12  (aries … pisces)
│   ├── houses/          # 12  (house_1 … house_12)
│   ├── angles/          # 4   (ascendant, midheaven, descendant, imum_coeli)
│   ├── aspects/         # 33  (majors + full minor families, septile → vigintile)
│   ├── points/          # 3   (chiron, north/south node)
│   ├── axes/            # nodal_axis
│   └── blueprints/      # generic sign/angle templates
├── engine/              # 105 files — interpretation rules
│   ├── canonical_functions/  aspects/{weighting,resolution,semantic_matrix,…}
│   ├── synthesis/  dominance/  patterns/  chart_interpretation/
│   ├── query/  development/  temporal/  report_generator/  output/  …
├── conventions/         # reference tables, not meanings: sign rulerships by
│                        # tradition, station thresholds (read by grammar rules)
├── glossary/glossary.json
└── _archive/conflicts/  # losing variants of 58 duplicated files (audit trail)
```

Each vocabulary entity has up to 12 module files. `manifest.json` splits them:

- **promptModules** — fed to the AI when the entity is relevant to a reading:
  `identity, semantics, grammar, language, modifier_types, development,
  expression, query_rules`
- **processModules** — bookkeeping, never sent to the AI:
  `metadata, changelog, tests, reasoning`

`conventions/` is the one folder that is not vocabulary: `rulerships.json`
(which planet rules which sign, per named tradition) and `stations.json`
(degrees per day under which a body is stationary) become `conventions/*`
records with a `reference` module. The house-ruler and station grammar rules
read them at setup time; they are never sent to the AI.

## How the engine uses this

For a reading, the evidence selector picks chart facts (e.g. *Venus in house 7,
Venus square Mars 4°12'*), loads the matching vocabulary modules
(`planets/venus`, `houses/house_7`, `aspects/square`) plus the relevant
`engine/` rules (aspect weighting, synthesis), and hands the AI **only that** —
chart facts + your definitions. The AI writes; it does not invent meanings.

## Provenance

Consolidation rules: exact duplicates merged; when two packages carried
different versions of the same file (58 cases, e.g. two Semisextile exports,
two Pluto Foundations), the later-timestamped export won and the other variant
was preserved under `_archive/conflicts/`. Ceremonial/meta packages
(FINAL/ETERNAL/SUCCESSOR records, certificates, manifests) were ignored:
251 of 492 packages contained actual vocabulary/engine content.
