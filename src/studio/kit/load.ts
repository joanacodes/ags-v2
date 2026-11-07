/**
 * Reading and checking the brand kit. `parseKit` never throws: an owner's edit that doesn't parse or
 * validate comes back as a list of problems with their place in the file, and the editor shows them.
 */
import { parse as parseYaml, YAMLParseError } from "yaml";
import { DEFAULT_KIT_YAML } from "./default-kit";
import { kitSchema, type Kit, type KitPlatform } from "./schema";
import type { Format, Language, Pillar, Platform } from "../types";
import { PLATFORMS } from "../types";

export interface KitProblem {
  readonly path: string;
  readonly message: string;
  readonly level: "error" | "warning";
}

export type KitResult = { ok: true; kit: Kit; problems: KitProblem[] } | { ok: false; problems: KitProblem[] };

export function parseKit(yamlText: string): KitResult {
  let raw: unknown;
  try {
    raw = parseYaml(yamlText, { prettyErrors: true });
  } catch (err) {
    const message = err instanceof YAMLParseError ? err.message : String(err);
    return { ok: false, problems: [{ path: "(file)", message, level: "error" }] };
  }
  const parsed = kitSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      problems: parsed.error.issues.map((issue) => ({
        path: issue.path.map(String).join(".") || "(root)",
        message: issue.message,
        level: "error" as const,
      })),
    };
  }
  const problems = lintKit(parsed.data);
  if (problems.some((p) => p.level === "error")) return { ok: false, problems };
  return { ok: true, kit: parsed.data, problems };
}

/** The rules a kit must keep beyond its shape. */
export function lintKit(kit: Kit): KitProblem[] {
  const problems: KitProblem[] = [];
  const total = kit.pillars.reduce((sum, p) => sum + p.share, 0);
  if (Math.abs(total - 100) > 0.001) {
    problems.push({ path: "pillars", message: `the shares add up to ${total}, not 100`, level: "error" });
  }
  const ids = new Set<string>();
  for (const p of kit.pillars) {
    if (ids.has(p.id)) problems.push({ path: `pillars.${p.id}`, message: "this pillar is listed twice", level: "error" });
    ids.add(p.id);
  }
  for (const lang of ["en", "fr"] as const) {
    for (const platform of kit.languages[lang]) {
      if (!kit.platforms[platform]) {
        problems.push({ path: `languages.${lang}`, message: `${platform} has no entry under platforms`, level: "error" });
      }
    }
  }
  for (const [platform, conf] of Object.entries(kit.platforms) as [Platform, KitPlatform][]) {
    if (!conf.by_hand && !conf.slots) {
      problems.push({ path: `platforms.${platform}.slots`, message: "a platform posted by the Studio needs its slots", level: "error" });
    }
    if (conf.slots && !Array.isArray(conf.slots)) {
      for (const format of Object.keys(conf.slots)) {
        if (!conf.formats.includes(format as Format)) {
          problems.push({ path: `platforms.${platform}.slots.${format}`, message: `${format} is not one of this platform's formats`, level: "warning" });
        }
      }
    }
  }
  const srcs = new Set<string>();
  for (const [platform, conf] of Object.entries(kit.platforms)) {
    if (srcs.has(conf.src)) problems.push({ path: `platforms.${platform}.src`, message: `the src tag ${conf.src} is used twice`, level: "error" });
    srcs.add(conf.src);
    if (!(conf.src in kit.src_tags)) {
      problems.push({ path: `platforms.${platform}.src`, message: `${conf.src} is not listed under src_tags`, level: "warning" });
    }
  }
  for (const lang of ["en", "fr"] as const) {
    const seen = new Set<string>();
    kit.hooks[lang].forEach((hook, i) => {
      const key = hook.text.trim().toLowerCase();
      if (seen.has(key)) problems.push({ path: `hooks.${lang}.${i}`, message: "this hook is listed twice", level: "warning" });
      seen.add(key);
      if (/[\u{1F300}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u.test(hook.text)) {
        problems.push({ path: `hooks.${lang}.${i}`, message: "no emoji in a hook", level: "error" });
      }
    });
  }
  if (!kit.disclosure.en.trim() || !kit.disclosure.fr.trim()) {
    problems.push({ path: "disclosure", message: "the AI-voice disclosure is required in both languages", level: "error" });
  }
  return problems;
}

let cachedDefault: Kit | null = null;

/** Version 1, as written in the repository. Throws only if the repository's own kit is broken (a test catches that). */
export function defaultKit(): Kit {
  if (cachedDefault) return cachedDefault;
  const result = parseKit(DEFAULT_KIT_YAML);
  if (!result.ok) {
    throw new Error(`the default brand kit is invalid: ${result.problems.map((p) => `${p.path}: ${p.message}`).join("; ")}`);
  }
  cachedDefault = result.kit;
  return cachedDefault;
}

/** The platforms a piece in this language may go to. */
export function platformsFor(kit: Kit, language: Language): Platform[] {
  return kit.languages[language].filter((p): p is Platform => (PLATFORMS as readonly string[]).includes(p));
}

/** The slots (Paris "HH:MM", or "Fri HH:MM") of one platform for one format. */
export function slotsFor(kit: Kit, platform: Platform, format: Format): string[] {
  const conf = kit.platforms[platform];
  if (!conf?.slots) return [];
  if (Array.isArray(conf.slots)) return conf.slots;
  return conf.slots[format] ?? [];
}

export function pillarShares(kit: Kit): Record<Pillar, number> {
  const shares: Record<Pillar, number> = { test: 0, placements: 0, tested: 0, sky: 0 };
  for (const p of kit.pillars) shares[p.id] = p.share;
  return shares;
}

export function srcFor(kit: Kit, platform: Platform): string {
  return kit.platforms[platform]?.src ?? platform;
}

/** The test's address with the platform's src tag, the one link every piece carries. */
export function testLink(kit: Kit, language: Language, platform: Platform): string {
  const base = kit.links["test"]?.[language] ?? `https://${kit.brand.site}/test/`;
  return `${base}?src=${encodeURIComponent(srcFor(kit, platform))}`;
}
