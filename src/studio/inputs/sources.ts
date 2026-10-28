/**
 * The sites as idea material: every published page of The Astro Study (and Maison Tarot, off by
 * default) read from its repository through GitHub's API, its title and description kept with its
 * address. The strategist reads the week's new encyclopaedia entries from here; nothing is copied
 * into a post, and only The Astro Study's own pages are ever linked.
 */
import { parse as parseYaml } from "yaml";
import type { AgentContext } from "../agents/context";
import { SkipRun, withRun } from "../run";
import type { NewSource } from "../store/store";
import type { Language } from "../types";

export interface SiteConfig {
  readonly key: string;
  readonly repo: string;
  readonly base: string;
  readonly dirs: Readonly<Record<Language, string>>;
  readonly prefixes: Readonly<Record<Language, string>>;
}

export const SITES: Readonly<Record<string, SiteConfig>> = {
  astrostudy: { key: "astrostudy", repo: "joanacodes/astrostudy", base: "https://astrostudy.co.uk", dirs: { en: "content/en", fr: "content/fr" }, prefixes: { en: "/", fr: "/fr/" } },
  "maison-tarot": { key: "maison-tarot", repo: "joanacodes/maison-tarot", base: "https://www.maisontarot.example", dirs: { en: "content/en", fr: "content/fr" }, prefixes: { en: "/", fr: "/fr/" } },
};

/** Pages that are not ideas: the legal pages, the order flow, the forms. */
const SKIP = /(?:^|\/)(?:legal-notice|mentions-legales|privacy|confidentialite|disclaimers|avertissements|terms|order-received|thank-you|merci|contact|order|commande)\.md$/;

export interface FrontMatter {
  readonly title?: string;
  readonly description?: string;
  readonly slug?: string;
  readonly url?: string;
  readonly draft?: boolean;
}

export function frontMatter(text: string): FrontMatter | null {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!m) return null;
  try {
    const data = parseYaml(m[1] ?? "") as unknown;
    return data && typeof data === "object" ? (data as FrontMatter) : null;
  } catch {
    return null;
  }
}

/** The page's address, as Hugo makes it: the file's path under the language's folder, or its slug or url. */
export function pageUrl(site: SiteConfig, language: Language, path: string, fm: FrontMatter): string {
  if (fm.url) return `${site.base}${fm.url.startsWith("/") ? "" : "/"}${fm.url}`;
  const rel = path.slice(site.dirs[language].length + 1).replace(/\.md$/, "");
  const parts = rel.split("/");
  if (parts[parts.length - 1] === "_index") parts.pop();
  else if (fm.slug) parts[parts.length - 1] = fm.slug;
  const tail = parts.filter(Boolean).join("/");
  return `${site.base}${site.prefixes[language]}${tail ? `${tail}/` : ""}`;
}

const strip = (s: string | undefined) => (s ?? "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();

export async function readSite(site: SiteConfig, token: string | null, fetchImpl: typeof fetch = fetch): Promise<NewSource[]> {
  const headers: Record<string, string> = { Accept: "application/vnd.github+json", "User-Agent": "the-astro-study-studio", "X-GitHub-Api-Version": "2022-11-28" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const tree = await fetchImpl(`https://api.github.com/repos/${site.repo}/git/trees/HEAD?recursive=1`, { headers });
  if (!tree.ok) throw new Error(`GitHub answered ${tree.status} for ${site.repo}${tree.status === 404 ? " (a private repository needs STUDIO_SOURCES_TOKEN)" : ""}`);
  const list = ((await tree.json()) as { tree?: { path: string; type: string }[] }).tree ?? [];
  const out: NewSource[] = [];
  for (const language of ["en", "fr"] as const) {
    const dir = `${site.dirs[language]}/`;
    for (const file of list.filter((f) => f.type === "blob" && f.path.startsWith(dir) && f.path.endsWith(".md") && !SKIP.test(f.path))) {
      const res = await fetchImpl(`https://api.github.com/repos/${site.repo}/contents/${file.path.split("/").map(encodeURIComponent).join("/")}`, { headers: { ...headers, Accept: "application/vnd.github.raw+json" } });
      if (!res.ok) continue;
      const fm = frontMatter(await res.text());
      if (!fm || fm.draft === true || !fm.title) continue;
      const rel = file.path.slice(dir.length);
      out.push({
        site: site.key,
        language,
        path: file.path,
        url: pageUrl(site, language, file.path, fm),
        section: rel.includes("/") ? (rel.split("/")[0] ?? null) : "page",
        title: strip(fm.title).slice(0, 300),
        description: strip(fm.description).slice(0, 600) || null,
      });
    }
  }
  return out;
}

export async function runSources(ctx: AgentContext, opts: { fetchImpl?: typeof fetch } = {}) {
  const { store, settings } = ctx;
  return withRun(store, { agent: "sources", trigger: ctx.trigger }, async (log) => {
    const wanted = Object.entries(settings.get("input-site").sites).filter(([, on]) => on).map(([key]) => key);
    if (wanted.length === 0) throw new SkipRun("skipped", "no site is turned on in Settings");
    const token = (process.env.STUDIO_SOURCES_TOKEN ?? "").trim() || null;
    let total = 0;
    for (const key of wanted) {
      const site = SITES[key];
      if (!site) {
        log.note(`${key}: no such site`);
        continue;
      }
      try {
        const rows = await readSite(site, token, opts.fetchImpl);
        total += await store.upsertSources(rows);
        log.note(`${key}: ${rows.length} pages`);
      } catch (err) {
        log.note(`${key}: not read (${err instanceof Error ? err.message : String(err)})`);
      }
    }
    log.count("studio_sources", total);
    return { outcome: "ok" as const };
  });
}
