"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useApi } from "@/components/studio/api";
import { downloadName, exportFile, GROUND_COLOURS, type ExportFormat, type Ground } from "@/components/studio/file-export";
import { ago, CopyButton, Empty, ErrorNote, Loading, Sheet, useAction } from "@/components/studio/ui";
import { saveFile } from "@/export/download";
import { BASKETS, basketOf, githubUrl, pretty, rawUrl, versionPath, type BasketKey, type FileItem, type FileKind, type FilesView, type FileVersion } from "@/studio/files/baskets";

const PAGE = 48;

const KINDS: readonly { readonly id: FileKind | "all"; readonly label: string }[] = [
  { id: "all", label: "All" },
  { id: "picture", label: "Pictures" },
  { id: "drawing", label: "Drawings" },
  { id: "video", label: "Videos" },
  { id: "text", label: "Text" },
];

/** Each basket's own colour, so a file's source shows at a glance. */
const BASKET_DOT: Readonly<Record<BasketKey, string>> = { astrostudy: "bg-sky", "maison-tarot": "bg-gold" };

const SEE_THROUGH = "[background:repeating-conic-gradient(#e4e0d4_0%_25%,#f8f6f0_0%_50%)_50%/18px_18px]";

function fileUrl(item: FileItem, version: FileVersion): string {
  return rawUrl(basketOf(item.basket).repo, item.ref, versionPath(item, version));
}

function size(bytes: number): string {
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1000))} KB`;
}

/* ---------------------------------------------------------------- folders */

interface FolderCard {
  readonly basket: BasketKey;
  readonly path: string;
  readonly label: string;
  readonly count: number;
  readonly cover: FileItem;
}

const inside = (item: FileItem, folder: string) => folder === "" || item.folder === folder || item.folder.startsWith(`${folder}/`);

function subfolderNames(items: readonly FileItem[], folder: string): string[] {
  const prefix = folder ? `${folder}/` : "";
  const names = new Set<string>();
  for (const item of items) {
    if (item.folder === folder || !item.folder.startsWith(prefix)) continue;
    names.add(item.folder.slice(prefix.length).split("/")[0]!);
  }
  return [...names];
}

/**
 * What a folder holds: its subfolders as cards (a chain with nothing else in it is one card) and its own
 * items. At a basket's root (`opened`), a folder that holds only folders shows those instead, so the
 * collections are one tap away (Media › Myths, Media › Posts…), not two.
 */
function folderView(items: readonly FileItem[], basket: BasketKey, folder: string, opened = false): { readonly folders: FolderCard[]; readonly here: FileItem[] } {
  const prefix = folder ? `${folder}/` : "";
  const here = items.filter((i) => i.folder === folder);
  const folders: FolderCard[] = [];
  const holdsItems = (path: string) => items.some((i) => i.folder === path);
  const chain = (start: string) => {
    let path = start;
    for (;;) {
      const below = subfolderNames(items, path);
      if (below.length !== 1 || holdsItems(path)) return path;
      path = `${path}/${below[0]}`;
    }
  };
  const add = (path: string) => {
    const held = items.filter((i) => inside(i, path));
    const cover = held.find((i) => i.versions[i.cover]?.kind === "picture" || i.versions[i.cover]?.kind === "drawing") ?? held[0];
    if (cover) folders.push({ basket, path, label: path.slice(prefix.length).split("/").map(pretty).join(" › "), count: held.length, cover });
  };
  for (const name of subfolderNames(items, folder)) {
    const path = chain(`${prefix}${name}`);
    const below = subfolderNames(items, path);
    if (opened && below.length > 1 && !holdsItems(path)) for (const sub of below) add(chain(`${path}/${sub}`));
    else add(path);
  }
  return { folders, here };
}

/* ------------------------------------------------------------------ tiles */

function Thumb({ item, version, crop = false }: { item: FileItem; version: FileVersion; crop?: boolean }) {
  const url = fileUrl(item, version);
  if (version.kind === "picture" || version.kind === "drawing")
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={url} alt="" loading="lazy" decoding="async" className={`h-full w-full ${crop ? "object-cover" : "object-contain"}`} />
    );
  if (version.kind === "video") return <video src={`${url}#t=0.5`} muted playsInline preload="metadata" className="h-full w-full object-cover" />;
  return <span className="font-serif text-4xl text-ink-3">{version.kind === "text" ? "¶" : "PDF"}</span>;
}

function tileGround(version: FileVersion | undefined): string {
  return version && (version.transparent || version.kind === "drawing") ? SEE_THROUGH : "bg-ink/5";
}

function BasketTag({ basket }: { basket: BasketKey }) {
  return (
    <span className="inline-flex items-center gap-1 text-[11px] text-ink-3">
      <span className={`h-1.5 w-1.5 rounded-full ${BASKET_DOT[basket]}`} aria-hidden="true" />
      {basketOf(basket).label}
    </span>
  );
}

function FolderTile({ card, onOpen }: { card: FolderCard; onOpen: () => void }) {
  const version = card.cover.versions[card.cover.cover];
  return (
    <button type="button" onClick={onOpen} className="group text-left" aria-label={`${card.label}: folder, ${card.count} ${card.count === 1 ? "item" : "items"}`}>
      <span className={`relative flex aspect-square items-center justify-center overflow-hidden rounded-2xl border border-line ${tileGround(version)}`}>
        {version && <Thumb item={card.cover} version={version} crop />}
        <span className="absolute bottom-2 right-2 rounded-full bg-paper/90 px-2 py-0.5 text-[11px] font-medium text-ink-2 shadow-soft">{card.count}</span>
      </span>
      <span className="mt-1.5 flex items-center gap-1.5 text-sm font-medium leading-tight group-hover:text-accent">
        <span aria-hidden="true" className="text-ink-3">
          ▸
        </span>
        <span className="truncate">{card.label}</span>
      </span>
    </button>
  );
}

function ItemTile({ item, showBasket, showFolder, onOpen }: { item: FileItem; showBasket: boolean; showFolder: boolean; onOpen: () => void }) {
  const version = item.versions[item.cover];
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group text-left"
      aria-label={`${item.name}${item.versions.length > 1 ? `, ${item.versions.length} versions` : ""}${showBasket ? `, ${basketOf(item.basket).label}` : ""}`}
    >
      <span className={`relative flex aspect-square items-center justify-center overflow-hidden rounded-2xl border border-line ${tileGround(version)}`}>
        {version && <Thumb item={item} version={version} />}
        {item.versions.length > 1 && <span className="absolute bottom-2 right-2 rounded-full bg-paper/90 px-2 py-0.5 text-[11px] text-ink-2 shadow-soft">{item.versions.length}</span>}
      </span>
      <span className="mt-1.5 block truncate text-sm leading-tight group-hover:text-accent">{item.name}</span>
      {showFolder && <span className="block truncate text-[11px] text-ink-3">{item.folder.split("/").map(pretty).join(" › ")}</span>}
      {showBasket && <BasketTag basket={item.basket} />}
    </button>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">{children}</div>;
}

function More({ shown, total, onMore }: { shown: number; total: number; onMore: () => void }) {
  if (shown >= total) return null;
  return (
    <div className="mt-4 flex justify-center">
      <button className="btn" onClick={onMore}>
        Show {Math.min(PAGE, total - shown)} more <span className="text-ink-3">of {total - shown}</span>
      </button>
    </div>
  );
}

/* ----------------------------------------------------------------- viewer */

const FORMAT_LABEL: Readonly<Record<ExportFormat, string>> = { png: "PNG", jpg: "JPG", pdf: "PDF", svg: "SVG", original: "Original" };

function formatsFor(v: FileVersion): ExportFormat[] {
  if (v.kind === "drawing") return ["svg", "png", "jpg", "pdf"];
  if (v.kind === "picture") return ["png", "jpg", "jpeg"].includes(v.ext) ? ["png", "jpg", "pdf"] : ["png", "jpg", "pdf", "original"];
  return ["original"];
}

/** The same file when nothing would change: a PNG kept see-through, a JPG asked as JPG. */
function asIs(v: FileVersion, format: ExportFormat, ground: Ground): boolean {
  if (format === "jpg") return v.ext === "jpg" || v.ext === "jpeg";
  if (format === "png") return v.ext === "png" && ground === "none";
  return false;
}

function useText(url: string | null): { text: string | null; error: string | null } {
  const [state, setState] = useState<{ text: string | null; error: string | null }>({ text: null, error: null });
  useEffect(() => {
    if (!url) return;
    let live = true;
    setState({ text: null, error: null });
    fetch(url)
      .then(async (res) => {
        if (!res.ok) throw new Error(`GitHub answered ${res.status}`);
        const text = await res.text();
        if (live) setState({ text, error: null });
      })
      .catch((err: unknown) => live && setState({ text: null, error: err instanceof Error ? err.message : String(err) }));
    return () => {
      live = false;
    };
  }, [url]);
  return state;
}

function TextBlock({ url, title }: { url: string; title: string }) {
  const { text, error } = useText(url);
  return (
    <div className="mt-5">
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="eyebrow">{title}</p>
        {text !== null && <CopyButton text={text} label="Copy text" />}
      </div>
      {error && <ErrorNote error={`The text couldn't be read: ${error}`} />}
      {text === null && !error && <Loading label="Reading" />}
      {text !== null && <pre className="max-h-72 overflow-y-auto whitespace-pre-wrap rounded-2xl border border-line bg-card p-4 font-sans text-sm text-ink-2">{text}</pre>}
    </div>
  );
}

function Viewer({ item, all }: { item: FileItem; all: readonly FileItem[] }) {
  const basket = basketOf(item.basket);
  const [at, setAt] = useState(item.cover);
  const [ground, setGround] = useState<Ground>("none");
  const [drawingSize, setDrawingSize] = useState(2000);
  // The picture's size as the browser read it, for the file it was read from.
  const [pixels, setPixels] = useState<{ readonly url: string; readonly text: string } | null>(null);
  const { busy, run } = useAction();
  const version = item.versions[at] ?? item.versions[0]!;
  const path = versionPath(item, version);
  const url = fileUrl(item, version);
  const shelf = basket.shelves.find((s) => s.ref === item.ref);
  const seeThrough = version.transparent || version.kind === "drawing";
  const caption = item.kinds.includes("text") ? null : all.find((i) => i.basket === item.basket && i.folder === item.folder && i.ref === item.ref && i.kinds.includes("text"));

  async function download(format: ExportFormat) {
    const plain = asIs(version, format, ground) ? "original" : format;
    const name = downloadName(item.basket, item.folder, version.file, format);
    await run(
      format,
      async () => {
        const out = await exportFile({ url, ext: version.ext, kind: version.kind }, { format: plain, ground, drawingSize, title: `${item.name} · ${basket.label}` });
        await saveFile(out.blob, name);
        return out.note;
      },
      (note) => (note ? `${name} — ${note}` : `Saved ${name}`),
    );
  }

  const preview = ground !== "none" ? "" : seeThrough ? SEE_THROUGH : "bg-ink/5";
  return (
    <div>
      <div className={`flex items-center justify-center overflow-hidden rounded-2xl border border-line ${preview}`} style={ground !== "none" ? { background: GROUND_COLOURS[ground] } : undefined}>
        {version.kind === "picture" || version.kind === "drawing" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={url} src={url} alt={item.name} className="max-h-[52vh] w-full object-contain" onLoad={(e) => setPixels({ url, text: `${e.currentTarget.naturalWidth} × ${e.currentTarget.naturalHeight} px` })} />
        ) : version.kind === "video" ? (
          <video key={url} src={url} controls playsInline className="max-h-[52vh] w-full bg-black" />
        ) : (
          <span className="py-16 font-serif text-6xl text-ink-3">{version.kind === "text" ? "¶" : "PDF"}</span>
        )}
      </div>

      {item.versions.length > 1 && (
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Versions">
          {item.versions.map((v, i) => (
            <button key={v.file} role="tab" aria-selected={i === at} onClick={() => setAt(i)} className={`w-20 shrink-0 text-left ${i === at ? "" : "opacity-70 hover:opacity-100"}`}>
              <span className={`flex aspect-square items-center justify-center overflow-hidden rounded-xl border-2 ${i === at ? "border-accent" : "border-line"} ${tileGround(v)}`}>
                <Thumb item={item} version={v} />
              </span>
              <span className="mt-1 block text-[11px] leading-tight text-ink-2">{v.label}</span>
            </button>
          ))}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-3">
        <BasketTag basket={item.basket} />
        <a className="underline decoration-line-2 underline-offset-2 hover:text-ink" href={`https://github.com/${basket.repo}`} target="_blank" rel="noreferrer">
          {basket.repo}
        </a>
        {shelf?.label && (
          <span className="chip" title={`Branch ${shelf.ref}`}>
            {shelf.label}
          </span>
        )}
        <span>{size(version.size)}</span>
        {pixels?.url === url && version.kind === "picture" && <span>{pixels.text}</span>}
      </div>
      <p className="mt-1 break-all font-mono text-[11px] text-ink-3">{path}</p>

      {version.kind !== "text" && (
        <div className="mt-5 rounded-2xl border border-line bg-card p-4">
          <p className="eyebrow">Download a copy</p>
          {seeThrough && (version.kind === "picture" || version.kind === "drawing") && (
            <div className="mt-3">
              <p className="mb-1.5 text-xs text-ink-2">Background</p>
              <div className="flex gap-2">
                {(["none", "white", "black", "paper"] as const).map((g) => (
                  <button key={g} onClick={() => setGround(g)} aria-pressed={ground === g} title={g === "none" ? "None: see-through" : g} className={`flex flex-col items-center gap-1 text-[11px] ${ground === g ? "text-ink" : "text-ink-3"}`}>
                    <span className={`h-9 w-9 rounded-full border-2 ${ground === g ? "border-accent" : "border-line-2"} ${g === "none" ? SEE_THROUGH : ""}`} style={g !== "none" ? { background: GROUND_COLOURS[g] } : undefined} />
                    {g === "none" ? "None" : g.charAt(0).toUpperCase() + g.slice(1)}
                  </button>
                ))}
              </div>
            </div>
          )}
          {version.kind === "drawing" && (
            <div className="mt-3">
              <p className="mb-1.5 text-xs text-ink-2">Size for PNG, JPG and PDF</p>
              <div className="flex gap-2">
                {[1080, 2000, 4000].map((s) => (
                  <button key={s} onClick={() => setDrawingSize(s)} aria-pressed={drawingSize === s} className={`btn btn-sm ${drawingSize === s ? "btn-primary" : ""}`}>
                    {s} px
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            {formatsFor(version).map((f) => (
              <button key={f} className="btn btn-accent min-w-[76px]" disabled={busy !== null} onClick={() => void download(f)}>
                {busy === f ? "…" : f === "original" ? `${FORMAT_LABEL[f]} .${version.ext}` : FORMAT_LABEL[f]}
              </button>
            ))}
          </div>
        </div>
      )}

      {version.kind === "text" && (
        <>
          <TextBlock url={url} title="Text" />
          <button className="btn btn-sm mt-3" disabled={busy !== null} onClick={() => void download("original")}>
            Download .{version.ext}
          </button>
        </>
      )}
      {caption && <TextBlock url={fileUrl(caption, caption.versions[0]!)} title={`${caption.name} in this folder`} />}

      <div className="mt-5 flex flex-wrap gap-2">
        <a className="btn btn-sm" href={githubUrl(basket.repo, item.ref, path)} target="_blank" rel="noreferrer">
          Open on GitHub ↗
        </a>
        <CopyButton text={url} label="Copy the file's link" />
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- screen */

export function FilesScreen() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [fresh, setFresh] = useState(0);
  const { data, error, loading, reload } = useApi<FilesView>(fresh > 0 ? `/api/studio/files?fresh=1&n=${fresh}` : "/api/studio/files");
  const [open, setOpen] = useState<FileItem | null>(null);
  const [limit, setLimit] = useState(PAGE);

  const basket = (BASKETS.some((b) => b.key === params.get("b")) ? params.get("b") : null) as BasketKey | null;
  const folder = basket ? (params.get("f") ?? "") : "";
  const kind = (KINDS.some((k) => k.id === params.get("k")) ? params.get("k") : "all") as FileKind | "all";
  const [q, setQ] = useState(params.get("q") ?? "");
  const query = q.trim().toLowerCase();

  useEffect(() => setLimit(PAGE), [basket, folder, kind, query]);

  function go(next: { b?: BasketKey | null; f?: string; k?: FileKind | "all" }, replace = false) {
    const p = new URLSearchParams(params.toString());
    const set = (key: string, value: string | null | undefined) => (value ? p.set(key, value) : p.delete(key));
    if ("b" in next) {
      set("b", next.b ?? null);
      set("f", next.f ?? null);
    } else if ("f" in next) set("f", next.f ?? null);
    if ("k" in next) set("k", next.k === "all" ? null : next.k);
    const s = p.toString();
    const to = s ? `${pathname}?${s}` : pathname;
    if (replace) router.replace(to, { scroll: false });
    else router.push(to, { scroll: false });
  }

  const shown = useMemo(() => {
    const items = data?.items ?? [];
    return items.filter((i) => (basket === null || i.basket === basket) && (kind === "all" || i.kinds.includes(kind)));
  }, [data, basket, kind]);

  const found = useMemo(() => {
    if (!query) return null;
    return shown.filter((i) => i.name.toLowerCase().includes(query) || i.folder.toLowerCase().includes(query) || i.versions.some((v) => v.file.toLowerCase().includes(query)));
  }, [shown, query]);

  const counts = useMemo(() => new Map(BASKETS.map((b) => [b.key, (data?.items ?? []).filter((i) => i.basket === b.key).length])), [data]);
  const readAt = data?.baskets.map((b) => b.readAt).filter((t): t is string => t !== null).sort()[0] ?? null;
  const problems = (data?.baskets ?? []).flatMap((b) => b.shelves.flatMap((s) => [...(s.error ? [`${b.label}${s.label ? ` (${s.label})` : ""}: ${s.error}`] : []), ...(s.truncated ? [`${b.label}${s.label ? ` (${s.label})` : ""}: GitHub cut the list short, so some files are missing.`] : [])]));

  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl">Files</h1>
          <p className="mt-1 text-sm text-ink-3">Straight from each repository on GitHub. Nothing moves; a download is a copy.</p>
        </div>
        <button className="btn btn-sm shrink-0" disabled={loading} onClick={() => setFresh((n) => n + 1)}>
          ↻ Refresh
        </button>
      </div>

      <div className="-mx-4 mt-5 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0">
        <button onClick={() => go({ b: null })} aria-pressed={basket === null} className={`btn btn-sm shrink-0 ${basket === null ? "btn-primary" : ""}`}>
          Both
        </button>
        {BASKETS.map((b) => (
          <button key={b.key} onClick={() => go({ b: b.key, f: "" })} aria-pressed={basket === b.key} className={`btn btn-sm shrink-0 ${basket === b.key ? "btn-primary" : ""}`}>
            <span className={`h-2 w-2 rounded-full ${BASKET_DOT[b.key]}`} aria-hidden="true" />
            {b.label}
            {data && <span className={basket === b.key ? "text-paper/70" : "text-ink-3"}>{counts.get(b.key)}</span>}
          </button>
        ))}
      </div>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a name: aries, the fool, mosaic…" className="field sm:max-w-sm" aria-label="Search the files" />
        <div className="-mx-4 flex gap-1 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          {KINDS.map((k) => (
            <button key={k.id} onClick={() => go({ k: k.id }, true)} aria-pressed={kind === k.id} className={`shrink-0 rounded-full px-3 py-1.5 text-xs ${kind === k.id ? "bg-ink text-paper" : "text-ink-2 hover:bg-ink/5"}`}>
              {k.label}
            </button>
          ))}
        </div>
      </div>

      {data && <p className="mt-2 text-[11px] text-ink-3">Read from GitHub {ago(readAt)}.</p>}
      {problems.map((p) => (
        <div key={p} className="mt-3">
          <ErrorNote error={p} retry={() => void reload()} />
        </div>
      ))}
      {error && (
        <div className="mt-4">
          <ErrorNote error={error} retry={() => void reload()} />
        </div>
      )}
      {loading && !data && <Loading label="Reading both repositories" />}

      {data && found && (
        <section className="mt-6">
          <p className="mb-3 text-sm text-ink-2">
            {found.length} {found.length === 1 ? "item" : "items"} for “{q.trim()}”
          </p>
          {found.length === 0 ? (
            <Empty>Nothing by that name{basket ? ` in ${basketOf(basket).label}` : ""}.</Empty>
          ) : (
            <>
              <Grid>
                {found.slice(0, limit).map((i) => (
                  <ItemTile key={i.id} item={i} showBasket={basket === null} showFolder onOpen={() => setOpen(i)} />
                ))}
              </Grid>
              <More shown={limit} total={found.length} onMore={() => setLimit((n) => n + PAGE)} />
            </>
          )}
        </section>
      )}

      {data && !found && basket === null &&
        BASKETS.map((b) => {
          const own = shown.filter((i) => i.basket === b.key);
          const view = folderView(own, b.key, "", true);
          return (
            <section key={b.key} className="mt-8">
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="flex items-center gap-2 text-2xl">
                  <span className={`h-2.5 w-2.5 rounded-full ${BASKET_DOT[b.key]}`} aria-hidden="true" />
                  {b.label}
                </h2>
                <a className="text-xs text-ink-3 underline decoration-line-2 underline-offset-2 hover:text-ink" href={`https://github.com/${b.repo}`} target="_blank" rel="noreferrer">
                  {b.repo}
                </a>
              </div>
              {own.length === 0 ? (
                <Empty>Nothing here{kind !== "all" ? " of that kind" : ""}.</Empty>
              ) : (
                <Grid>
                  {view.folders.map((card) => (
                    <FolderTile key={card.path} card={card} onOpen={() => go({ b: b.key, f: card.path })} />
                  ))}
                  {view.here.map((i) => (
                    <ItemTile key={i.id} item={i} showBasket={false} showFolder={false} onOpen={() => setOpen(i)} />
                  ))}
                </Grid>
              )}
            </section>
          );
        })}

      {data && !found && basket !== null && (
        <FolderSection items={shown} basket={basket} folder={folder} limit={limit} onMore={() => setLimit((n) => n + PAGE)} onFolder={(f) => go({ f })} onBasket={(b) => go({ b, f: "" })} onOpen={setOpen} />
      )}

      <Sheet open={open !== null} onClose={() => setOpen(null)} title={open?.name ?? ""} wide>
        {open && <Viewer key={open.id} item={open} all={data?.items ?? []} />}
      </Sheet>
    </div>
  );
}

function FolderSection({
  items,
  basket,
  folder,
  limit,
  onMore,
  onFolder,
  onBasket,
  onOpen,
}: {
  items: readonly FileItem[];
  basket: BasketKey;
  folder: string;
  limit: number;
  onMore: () => void;
  onFolder: (folder: string) => void;
  onBasket: (basket: BasketKey | null) => void;
  onOpen: (item: FileItem) => void;
}) {
  const view = folderView(items, basket, folder, folder === "");
  const parts = folder ? folder.split("/") : [];
  return (
    <section className="mt-6">
      <nav aria-label="Folders" className="mb-4 flex flex-wrap items-center gap-1 text-sm">
        <button className="text-ink-3 hover:text-ink" onClick={() => onBasket(null)}>
          Files
        </button>
        <span className="text-ink-3">›</span>
        <button className={`flex items-center gap-1.5 ${parts.length ? "text-ink-3 hover:text-ink" : "font-medium"}`} onClick={() => onFolder("")}>
          <span className={`h-2 w-2 rounded-full ${BASKET_DOT[basket]}`} aria-hidden="true" />
          {basketOf(basket).label}
        </button>
        {parts.map((part, i) => (
          <span key={i} className="flex items-center gap-1">
            <span className="text-ink-3">›</span>
            <button className={i === parts.length - 1 ? "font-medium" : "text-ink-3 hover:text-ink"} onClick={() => onFolder(parts.slice(0, i + 1).join("/"))}>
              {pretty(part)}
            </button>
          </span>
        ))}
      </nav>
      {view.folders.length === 0 && view.here.length === 0 && <Empty>This folder is empty{items.length ? " for this kind" : ""}.</Empty>}
      {view.folders.length > 0 && (
        <div className={view.here.length ? "mb-6" : ""}>
          <Grid>
            {view.folders.map((card) => (
              <FolderTile key={card.path} card={card} onOpen={() => onFolder(card.path)} />
            ))}
          </Grid>
        </div>
      )}
      {view.here.length > 0 && (
        <>
          <Grid>
            {view.here.slice(0, limit).map((i) => (
              <ItemTile key={i.id} item={i} showBasket={false} showFolder={false} onOpen={() => onOpen(i)} />
            ))}
          </Grid>
          <More shown={limit} total={view.here.length} onMore={onMore} />
        </>
      )}
    </section>
  );
}
