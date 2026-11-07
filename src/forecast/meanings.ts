/**
 * The library's words for everything a forecast names, read from AGS's definition library (the same pack the
 * readings use; server-side only, so this module is never imported by a page). Techniques written for the forecast
 * and not yet validated by the owner are marked as drafts.
 */
import { coreKnowledgePack } from "../knowledge/pack-loader";
import type { Forecast, Meaning } from "./types";

/** The technique entries written for the forecast (knowledge/vocabulary/techniques), awaiting the owner's validation. */
export const DRAFT_TECHNIQUES: ReadonlySet<string> = new Set(["techniques/solar_arc_directions", "techniques/eclipses", "techniques/lunations", "techniques/planetary_returns"]);

const words = (s: string) => s.replace(/_/g, " ");
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

function meaningOf(id: string, modules: Record<string, unknown>): Meaning {
  const identity = isObject(modules.identity) ? modules.identity : {};
  const semantics = isObject(modules.semantics) ? modules.semantics : {};
  const core = isObject(identity.coreFunction) ? identity.coreFunction : {};
  const definition = [semantics.definition, identity.canonicalFunction, identity.definition, core.definition].find((d): d is string => typeof d === "string") ?? "";
  const domains = isObject(semantics.domains) ? Object.keys(semantics.domains) : strings(identity.coreDomains);
  const name = words(id.split("/")[1] ?? id).replace(/\bhouse (\d+)\b/, "house $1");
  return {
    name: name.charAt(0).toUpperCase() + name.slice(1),
    definition,
    domains: domains.map(words).slice(0, 6),
    notInherent: [...strings(identity.notInherent), ...strings(identity.doesNotInherentlySupply)].map(words),
    draft: DRAFT_TECHNIQUES.has(id),
  };
}

/** The meanings of the given library ids, skipping any the library does not hold. */
export function meaningsFor(ids: Iterable<string>): Forecast["meanings"] {
  const records = (coreKnowledgePack() as unknown as { records: Record<string, { modules?: unknown }> }).records;
  const out: Record<string, Meaning> = {};
  for (const id of ids) {
    const rec = records[id];
    if (rec && isObject(rec.modules)) out[id] = meaningOf(id, rec.modules);
  }
  return out;
}
