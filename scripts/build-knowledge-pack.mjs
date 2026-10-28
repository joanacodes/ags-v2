/**
 * Builds the AGS core knowledge pack from knowledge/vocabulary into
 * src/data/knowledge-pack.json.
 *
 * Deterministic: sorted record keys, sorted module keys, stable JSON.
 * Only prompt-facing modules are included (see knowledge/manifest.json);
 * process modules (metadata, changelog, tests, reasoning) are excluded.
 *
 * Usage: node scripts/build-knowledge-pack.mjs
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const VOCAB = join(ROOT, "knowledge", "vocabulary");
const OUT = join(ROOT, "src", "data", "knowledge-pack.json");

const PROMPT_MODULES = [
  "identity",
  "semantics",
  "grammar",
  "language",
  "modifier_types",
  "development",
  "expression",
  "query_rules",
];

const records = {};
for (const category of readdirSync(VOCAB).sort()) {
  const catDir = join(VOCAB, category);
  if (!statSync(catDir).isDirectory()) continue;
  for (const entity of readdirSync(catDir).sort()) {
    const entDir = join(catDir, entity);
    if (!statSync(entDir).isDirectory()) continue;
    const modules = {};
    for (const moduleName of PROMPT_MODULES) {
      const file = join(entDir, `${moduleName}.json`);
      try {
        const parsed = JSON.parse(readFileSync(file, "utf8"));
        if (parsed && typeof parsed === "object") {
          if ("content" in parsed) {
            modules[moduleName] = parsed.content;
          } else {
            // Some entities store module content at the top level.
            const { $schemaVersion, id, moduleType, parentObject, ...content } = parsed;
            void $schemaVersion; void id; void moduleType; void parentObject;
            if (Object.keys(content).length > 0) modules[moduleName] = content;
          }
        }
      } catch {
        // module absent for this entity — fine, packs are sparse
      }
    }
    if (Object.keys(modules).length === 0) continue;
    const key = `${category}/${entity}`;
    records[key] = { id: key, category, entity, modules };
  }
}

// Reference conventions (sign rulerships, station thresholds) become
// "conventions/<name>" records with a single `reference` module. They are
// tables the grammar rules read at setup time, never prompt material.
try {
  const convDir = join(ROOT, "knowledge", "conventions");
  for (const file of readdirSync(convDir).sort()) {
    if (!file.endsWith(".json")) continue;
    const parsed = JSON.parse(readFileSync(join(convDir, file), "utf8"));
    const name = file.replace(/\.json$/, "");
    const key = `conventions/${name}`;
    if (parsed?.id !== key) throw new Error(`${file}: id must be "${key}"`);
    const { $schemaVersion, id, description, ...reference } = parsed;
    void $schemaVersion; void id; void description;
    records[key] = { id: key, category: "conventions", entity: name, modules: { reference } };
  }
} catch (error) {
  // The folder is optional (older checkouts); a broken file is not.
  if (error?.code !== "ENOENT") throw error;
}

// Engine condition semantics (retrograde, station, …) become grounding
// records under "conditions/<name>".
try {
  const conditionsPath = join(ROOT, "knowledge", "engine", "canonical_functions", "conditions", "condition_types.json");
  const parsed = JSON.parse(readFileSync(conditionsPath, "utf8"));
  const conditions = parsed?.conditions ?? {};
  for (const [name, value] of Object.entries(conditions)) {
    if (value && typeof value === "object" && typeof value.purpose === "string") {
      const key = `conditions/${name}`;
      records[key] = {
        id: key,
        category: "conditions",
        entity: name,
        modules: { identity: { canonicalFunction: value.purpose.replace(/^Describe /, "expresses ").replace(/\.$/, "") } },
      };
    }
  }
} catch {
  // engine conditions are optional
}

const pack = {
  $schemaVersion: "1.0",
  packId: "ags-core-vocabulary",
  version: "1.0.0",
  locale: "en",
  generatedFrom: "knowledge/vocabulary",
  records,
};

writeFileSync(OUT, JSON.stringify(pack, null, 1) + "\n");
const count = Object.keys(records).length;
console.log(`knowledge pack written: ${OUT} (${count} records)`);
