/**
 * From an agent's zod schema to the JSON schema the Messages API constrains its output with.
 *
 * Structured outputs accept a subset of JSON Schema: objects must say `additionalProperties: false`;
 * numeric bounds, string lengths and array sizes are not accepted. Those are dropped here and checked
 * again by zod on the answer (with one retry naming what failed), so a rule is never lost, only moved.
 */
import { z } from "zod/v4";

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type JsonSchema = { [key: string]: Json };

const DROPPED = new Set([
  "minLength",
  "maxLength",
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "multipleOf",
  "minItems",
  "maxItems",
  "uniqueItems",
  "pattern",
  "$schema",
  "default",
  "examples",
]);
const KEPT_FORMATS = new Set(["date-time", "time", "date", "duration", "email", "hostname", "uri", "ipv4", "ipv6", "uuid"]);

function clean(node: Json): Json {
  if (Array.isArray(node)) return node.map(clean);
  if (node === null || typeof node !== "object") return node;
  const out: { [key: string]: Json } = {};
  for (const [key, value] of Object.entries(node)) {
    if (DROPPED.has(key)) continue;
    if (key === "format" && typeof value === "string" && !KEPT_FORMATS.has(value)) continue;
    out[key] = clean(value);
  }
  if (out["type"] === "object") {
    out["additionalProperties"] = false;
    if (!out["properties"]) out["properties"] = {};
  }
  return out;
}

export function toApiSchema(schema: z.ZodType): JsonSchema {
  const raw = z.toJSONSchema(schema, { target: "draft-2020-12", unrepresentable: "any", io: "output" }) as unknown as Json;
  const cleaned = clean(raw);
  if (cleaned === null || typeof cleaned !== "object" || Array.isArray(cleaned)) {
    throw new Error("an output schema must be an object");
  }
  return cleaned;
}

/** Zod's complaints, as short lines a model can act on. */
export function describeIssues(error: z.ZodError, limit = 25): string[] {
  return error.issues.slice(0, limit).map((issue) => `${issue.path.map(String).join(".") || "(root)"}: ${issue.message}`);
}
