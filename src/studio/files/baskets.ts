/**
 * The Studio's two baskets: the pictures and files of The Astro Study's repository and of Maison Tarot's,
 * read straight from GitHub and never copied anywhere. Each repository keeps its own content; the Studio
 * lists it, the owner views it and downloads a copy. Nothing here writes to GitHub.
 *
 * Both repositories are public: one call to GitHub's API lists a copy (a branch) with every file in it,
 * and the browser loads each file from raw.githubusercontent.com, which the API's hourly limit doesn't
 * count. A key is used when there is one, for the API's higher limit.
 *
 * The baskets never mix: every item carries its basket, and the listing is built one basket at a time.
 */

export type BasketKey = "astrostudy" | "maison-tarot";

export interface Shelf {
  /** The branch read. */
  readonly ref: string;
  /** How the screen names this copy; null for the repository's main copy. */
  readonly label: string | null;
}

export interface Basket {
  readonly key: BasketKey;
  readonly label: string;
  readonly repo: string;
  /** The main copy first: on a path two copies both have, the earlier copy wins. */
  readonly shelves: readonly Shelf[];
}

export const BASKETS: readonly Basket[] = [
  { key: "astrostudy", label: "The Astro Study", repo: "joanacodes/astrostudy", shelves: [{ ref: "main", label: null }] },
  {
    key: "maison-tarot",
    label: "Maison Tarot",
    repo: "joanacodes/maison-tarot",
    // The 22 Major Arcana designs are on this work copy and not on main yet; it only adds what main lacks.
    shelves: [
      { ref: "main", label: null },
      { ref: "claude/astrostudy-website-tdhyzt", label: "Work copy" },
    ],
  },
];

export type FileKind = "picture" | "drawing" | "video" | "document" | "text";

const KIND_BY_EXT: Readonly<Record<string, FileKind>> = {
  png: "picture",
  jpg: "picture",
  jpeg: "picture",
  webp: "picture",
  avif: "picture",
  gif: "picture",
  svg: "drawing",
  mp4: "video",
  webm: "video",
  mov: "video",
  pdf: "document",
  md: "text",
  txt: "text",
};

/** Formats in the order versions are shown when nothing else tells them apart. */
const EXT_ORDER = ["png", "jpg", "jpeg", "webp", "avif", "gif", "svg", "mp4", "webm", "mov", "pdf", "md", "txt"];

/** The four versions of the feed designs, in the order the screen shows them. */
const KNOWN_VERSIONS = ["white-on-black", "black-on-white", "white-transparent", "black-transparent"];

const VERSION_LABELS: Readonly<Record<string, string>> = {
  "white-on-black": "White on black",
  "black-on-white": "Black on white",
  "white-transparent": "White ink, transparent",
  "black-transparent": "Black ink, transparent",
};

const EXT_LABELS: Readonly<Record<string, string>> = { svg: "Drawing (SVG)", jpeg: "JPG", webp: "WebP", webm: "WebM", mov: "MOV", md: "Text", txt: "Text" };

/** One entry of GitHub's git trees answer. */
export interface TreeEntry {
  readonly path: string;
  readonly type: string;
  readonly size?: number;
}

export interface FileVersion {
  /** The file's name in its item's folder. */
  readonly file: string;
  readonly label: string;
  readonly kind: FileKind;
  readonly ext: string;
  readonly size: number;
  /** A version whose ground is see-through (the designs' "transparent" versions). */
  readonly transparent: boolean;
}

export interface FileItem {
  /** Basket, copy, folder and name: unique and the same from one listing to the next. */
  readonly id: string;
  readonly basket: BasketKey;
  readonly ref: string;
  /** The folder in the repository, "" for its root. */
  readonly folder: string;
  readonly name: string;
  readonly kinds: readonly FileKind[];
  readonly versions: readonly FileVersion[];
  /** The version a tile shows: the first picture, else the first drawing, else the first version. */
  readonly cover: number;
}

export interface ShelfState {
  readonly ref: string;
  readonly label: string | null;
  /** Files this copy adds to the basket. */
  readonly files: number;
  readonly error: string | null;
  /** GitHub cut the list short (over 100,000 entries or 7 MB). */
  readonly truncated: boolean;
}

export interface BasketView {
  readonly key: BasketKey;
  readonly label: string;
  readonly repo: string;
  readonly items: number;
  readonly shelves: readonly ShelfState[];
  /** When the oldest copy shown was read from GitHub (ISO), null when none was. */
  readonly readAt: string | null;
}

export interface FilesView {
  readonly baskets: readonly BasketView[];
  readonly items: readonly FileItem[];
}

/** A copy as GitHub listed it, or why it couldn't be. */
export type CopyListing =
  | { readonly ok: true; readonly entries: readonly TreeEntry[]; readonly truncated: boolean; readonly readAt: string }
  | { readonly ok: false; readonly error: string };

/* ------------------------------------------------------------------ names */

export function extOf(file: string): string {
  const dot = file.lastIndexOf(".");
  return dot > 0 ? file.slice(dot + 1).toLowerCase() : "";
}

export function kindOf(file: string): FileKind | null {
  return KIND_BY_EXT[extOf(file)] ?? null;
}

/** `aquarius--white-on-black.png` → base `aquarius`, version `white-on-black`; `ar00.jpg` → base `ar00`, no version. */
export function splitName(file: string): { readonly stem: string; readonly base: string; readonly version: string | null; readonly ext: string } {
  const ext = extOf(file);
  const stem = ext ? file.slice(0, file.length - ext.length - 1) : file;
  const cut = stem.indexOf("--");
  if (cut <= 0 || cut + 2 >= stem.length) return { stem, base: stem, version: null, ext };
  return { stem, base: stem.slice(0, cut), version: stem.slice(cut + 2), ext };
}

/** A file or folder name as words: `paper-cut` → "Paper cut", `2026-11-09-new-moon` → "2026-11-09 · new moon". */
export function pretty(slug: string): string {
  const dated = /^(\d{4}-\d{2}-\d{2})-(.+)$/.exec(slug);
  if (dated) return `${dated[1]} · ${pretty(dated[2] ?? "").replace(/^./, (c) => c.toLowerCase())}`;
  const words = slug.replace(/--/g, " · ").replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
  // A leading code (ar00, cu02) stays as written; a word gets a capital.
  if (/^[a-z]+\d/i.test(words) || !/^[a-z]/.test(words)) return words;
  return words.charAt(0).toUpperCase() + words.slice(1);
}

const compare = (a: string, b: string) => a.localeCompare(b, "en", { numeric: true, sensitivity: "variant" });

function versionRank(version: string | null): number {
  if (version === null) return KNOWN_VERSIONS.length + 1;
  const known = KNOWN_VERSIONS.indexOf(version);
  return known >= 0 ? known : KNOWN_VERSIONS.length;
}

function extRank(ext: string): number {
  const i = EXT_ORDER.indexOf(ext);
  return i >= 0 ? i : EXT_ORDER.length;
}

/* ---------------------------------------------------------------- addresses */

export function encodePath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

/** The file itself, for the browser: a branch goes in as refs/heads/…, so a name with slashes reads exactly. */
export function rawUrl(repo: string, ref: string, path: string): string {
  return `https://raw.githubusercontent.com/${repo}/refs/heads/${encodePath(ref)}/${encodePath(path)}`;
}

/** The file's page on GitHub. */
export function githubUrl(repo: string, ref: string, path: string): string {
  return `https://github.com/${repo}/blob/${encodePath(ref)}/${encodePath(path)}`;
}

export function versionPath(item: Pick<FileItem, "folder">, version: Pick<FileVersion, "file">): string {
  return item.folder ? `${item.folder}/${version.file}` : version.file;
}

export function basketOf(key: BasketKey): Basket {
  const basket = BASKETS.find((b) => b.key === key);
  if (!basket) throw new Error(`no basket ${key}`);
  return basket;
}

/* ---------------------------------------------------------------- grouping */

const hidden = (path: string) => path.split("/").some((part) => part.startsWith(".") || part === "node_modules");

function folderOf(path: string): string {
  const slash = path.lastIndexOf("/");
  return slash >= 0 ? path.slice(0, slash) : "";
}

/**
 * A basket's items from its copies' listings, in the basket's shelf order. Pure: the same listings give
 * the same items in the same order.
 */
export function basketItems(basket: Basket, listings: readonly CopyListing[]): { readonly items: FileItem[]; readonly shelves: ShelfState[] } {
  if (listings.length !== basket.shelves.length) throw new Error(`${basket.key}: ${listings.length} listings for ${basket.shelves.length} copies`);
  // Files of every copy, so that a caption shows beside the pictures of its folder whichever copy has them.
  const blobs = listings.map((l) => (l.ok ? l.entries.filter((e) => e.type === "blob" && typeof e.path === "string" && !hidden(e.path)) : []));
  const mediaFolders = new Set<string>();
  for (const list of blobs) for (const e of list) if (kindOf(e.path) !== null && kindOf(e.path) !== "text") mediaFolders.add(folderOf(e.path));

  const taken = new Set<string>();
  const items: FileItem[] = [];
  const shelves: ShelfState[] = [];
  basket.shelves.forEach((shelf, i) => {
    const listing = listings[i]!;
    if (!listing.ok) {
      shelves.push({ ref: shelf.ref, label: shelf.label, files: 0, error: listing.error, truncated: false });
      return;
    }
    const groups = new Map<string, { folder: string; base: string; files: { file: string; version: string | null; ext: string; kind: FileKind; size: number; stem: string }[] }>();
    let files = 0;
    for (const e of blobs[i]!) {
      const kind = kindOf(e.path);
      if (kind === null || taken.has(e.path)) continue;
      const folder = folderOf(e.path);
      if (kind === "text" && !mediaFolders.has(folder)) continue;
      taken.add(e.path);
      files += 1;
      const file = folder ? e.path.slice(folder.length + 1) : e.path;
      const { stem, base, version, ext } = splitName(file);
      const key = `${folder}\u0000${base}`;
      const group = groups.get(key) ?? { folder, base, files: [] };
      group.files.push({ file, version, ext, kind, size: typeof e.size === "number" ? e.size : 0, stem });
      groups.set(key, group);
    }
    for (const g of groups.values()) {
      g.files.sort((a, b) => versionRank(a.version) - versionRank(b.version) || compare(a.version ?? "", b.version ?? "") || extRank(a.ext) - extRank(b.ext) || compare(a.file, b.file));
      const shared = (v: string | null) => g.files.filter((f) => f.version === v).length > 1;
      const versions: FileVersion[] = g.files.map((f) => {
        const said = f.version !== null ? (VERSION_LABELS[f.version] ?? pretty(f.version)) : (EXT_LABELS[f.ext] ?? f.ext.toUpperCase());
        return {
          file: f.file,
          label: f.version !== null && shared(f.version) ? `${said} · ${(EXT_LABELS[f.ext] ?? f.ext.toUpperCase()).replace(" (SVG)", "")}` : said,
          kind: f.kind,
          ext: f.ext,
          size: f.size,
          transparent: f.version !== null && /(?:^|-)transparent$/.test(f.version),
        };
      });
      const only = g.files.length === 1 ? g.files[0]! : null;
      // One file with a version nobody else shares (style--subject) keeps its whole name.
      const name = only && (only.version === null || !KNOWN_VERSIONS.includes(only.version)) ? pretty(only.stem) : pretty(g.base);
      const pictureAt = versions.findIndex((v) => v.kind === "picture");
      const drawingAt = versions.findIndex((v) => v.kind === "drawing");
      items.push({
        id: `${basket.key}:${shelf.ref}:${g.folder ? `${g.folder}/` : ""}${g.base}`,
        basket: basket.key,
        ref: shelf.ref,
        folder: g.folder,
        name,
        kinds: [...new Set(versions.map((v) => v.kind))].sort(),
        versions,
        cover: pictureAt >= 0 ? pictureAt : drawingAt >= 0 ? drawingAt : 0,
      });
    }
    shelves.push({ ref: shelf.ref, label: shelf.label, files, error: null, truncated: listing.truncated });
  });
  const order = new Map(basket.shelves.map((s, i) => [s.ref, i]));
  items.sort((a, b) => compare(a.folder, b.folder) || compare(a.name, b.name) || (order.get(a.ref) ?? 0) - (order.get(b.ref) ?? 0) || compare(a.id, b.id));
  return { items, shelves };
}

/* ----------------------------------------------------------------- reading */

export interface ReadOptions {
  /** A GitHub key, for the API's higher hourly limit; none is needed for a public repository. */
  readonly token?: string | null;
  readonly fetchImpl?: typeof fetch;
  /** Ask GitHub again even if a listing is less than ten minutes old. */
  readonly fresh?: boolean;
  readonly now?: () => number;
}

const KEEP_MS = 10 * 60_000;
const kept = new Map<string, { readonly at: number; readonly listing: CopyListing }>();

/** For tests: forget every listing, as a fresh process would. */
export function forgetListings(): void {
  kept.clear();
}

function parisTime(epochSeconds: number): string {
  return new Date(epochSeconds * 1000).toLocaleTimeString("en-GB", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" });
}

/** Why GitHub refused, in words the screen can show. */
export function refusal(res: Pick<Response, "status" | "headers">, repo: string, ref: string): string {
  const remaining = res.headers.get("x-ratelimit-remaining");
  if ((res.status === 403 || res.status === 429) && remaining === "0") {
    const reset = Number(res.headers.get("x-ratelimit-reset"));
    const when = Number.isFinite(reset) && reset > 0 ? ` until ${parisTime(reset)} (Paris time)` : "";
    return `GitHub's hourly limit is used up${when}. A GitHub key in Settings → Keys raises it.`;
  }
  if (res.status === 404) return `GitHub doesn't know ${repo} at ${ref}: the copy may be gone, or the repository private.`;
  return `GitHub answered ${res.status} for ${repo} at ${ref}.`;
}

export async function listCopy(repo: string, ref: string, opts: ReadOptions = {}): Promise<CopyListing> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const now = opts.now ?? Date.now;
  const url = `https://api.github.com/repos/${repo}/git/trees/${encodeURIComponent(ref)}?recursive=1`;
  const headers: Record<string, string> = { Accept: "application/vnd.github+json", "User-Agent": "the-studio-files", "X-GitHub-Api-Version": "2022-11-28" };
  const token = (opts.token ?? "").trim();
  try {
    let res = await fetchImpl(url, { headers: token ? { ...headers, Authorization: `Bearer ${token}` } : headers });
    // A key that can't read this repository (expired, or for another one) mustn't hide a public repository.
    if (token && (res.status === 401 || res.status === 403 || res.status === 404) && res.headers.get("x-ratelimit-remaining") !== "0") res = await fetchImpl(url, { headers });
    if (!res.ok) return { ok: false, error: refusal(res, repo, ref) };
    const data = (await res.json()) as { tree?: unknown; truncated?: unknown };
    if (!Array.isArray(data.tree)) return { ok: false, error: `GitHub's answer for ${repo} at ${ref} has no file list.` };
    const entries = data.tree.filter((e): e is TreeEntry => typeof e === "object" && e !== null && typeof (e as TreeEntry).path === "string" && typeof (e as TreeEntry).type === "string");
    return { ok: true, entries, truncated: data.truncated === true, readAt: new Date(now()).toISOString() };
  } catch (err) {
    return { ok: false, error: `${repo} at ${ref} could not be read: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/** A copy's listing, kept ten minutes; a refusal is never kept, so the next look asks again. */
async function keptCopy(repo: string, ref: string, opts: ReadOptions): Promise<CopyListing> {
  const now = opts.now ?? Date.now;
  const key = `${repo}@${ref}`;
  const hit = kept.get(key);
  if (hit && !opts.fresh && now() - hit.at < KEEP_MS) return hit.listing;
  const listing = await listCopy(repo, ref, opts);
  if (listing.ok) kept.set(key, { at: now(), listing });
  else kept.delete(key);
  return listing;
}

/** Both baskets, each built from its own copies only. */
export async function readBaskets(opts: ReadOptions = {}): Promise<FilesView> {
  const listed = await Promise.all(BASKETS.map((basket) => Promise.all(basket.shelves.map((shelf) => keptCopy(basket.repo, shelf.ref, opts)))));
  const baskets: BasketView[] = [];
  const items: FileItem[] = [];
  BASKETS.forEach((basket, i) => {
    const listings = listed[i]!;
    const built = basketItems(basket, listings);
    const times = listings.flatMap((l) => (l.ok ? [l.readAt] : [])).sort();
    baskets.push({ key: basket.key, label: basket.label, repo: basket.repo, items: built.items.length, shelves: built.shelves, readAt: times[0] ?? null });
    items.push(...built.items);
  });
  return { baskets, items };
}

/** The key to read with: the sources' own, else the Studio's GitHub key, else the workflow's. */
export function githubTokenFromEnv(env: Readonly<Record<string, string | undefined>> = process.env): string | null {
  for (const name of ["STUDIO_SOURCES_TOKEN", "GITHUB_STUDIO_TOKEN", "GITHUB_TOKEN"]) {
    const value = (env[name] ?? "").trim();
    if (value) return value;
  }
  return null;
}
