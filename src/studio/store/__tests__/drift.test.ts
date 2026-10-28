import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { TABLE_SCHEMAS } from "../rows";

/** Column names per table, read from the migrations' create table statements. */
function migrationColumns(): Map<string, string[]> {
  const dir = path.resolve(process.cwd(), "supabase/migrations");
  const sql = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => readFileSync(path.join(dir, f), "utf8"))
    .join("\n");
  const tables = new Map<string, string[]>();
  const re = /create table if not exists public\.(\w+) \(([\s\S]*?)\n\);/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql))) {
    const body = m[2] ?? "";
    const cols: string[] = [];
    for (const raw of body.split("\n")) {
      const line = raw.trim();
      if (line === "" || line.startsWith("--")) continue;
      if (/^(primary key|unique|check|constraint|foreign key)\b/i.test(line)) continue;
      const name = /^([a-z_][a-z0-9_]*)\s/.exec(line)?.[1];
      if (name) cols.push(name);
    }
    tables.set(m[1] ?? "", cols);
  }
  return tables;
}

test("every row schema has exactly the columns of its table in the migration", () => {
  const tables = migrationColumns();
  for (const [table, schema] of Object.entries(TABLE_SCHEMAS)) {
    const cols = tables.get(table);
    assert.ok(cols, `${table} is not created by any migration`);
    const keys = Object.keys(schema.shape).sort();
    assert.deepEqual(keys, [...cols].sort(), `${table}: the schema and the migration disagree`);
  }
});
