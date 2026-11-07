"use client";
/**
 * Pieces the email screens share: the brand switch, the email as it will look (an iframe of the real
 * HTML), the canvas's blocks, a list reordered by dragging (pointer events, so a finger works as well as
 * a mouse), and the picture picker that reads the brand's own basket in Files.
 */
import Link from "next/link";
import { useCallback, useMemo, useRef, useState } from "react";
import { useApi } from "@/components/studio/api";
import { Empty, ErrorNote, Loading, Sheet } from "@/components/studio/ui";
import { basketOf, rawUrl, versionPath, type FileItem, type FilesView } from "@/studio/files/baskets";
import { BRAND_LABELS, BRANDS, FONT_STACKS, type Block, type Brand, type BrandSettings } from "@/studio/email/model";
import { inlineHtml, mix, safeImage } from "@/studio/email/render";

export const BRAND_DOT: Readonly<Record<Brand, string>> = { astrostudy: "bg-sky", "maison-tarot": "bg-gold" };

export function BrandSwitch({ brand, tab }: { brand: Brand; tab?: string }) {
  return (
    <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0">
      {BRANDS.map((b) => (
        <Link key={b} href={`/studio/email/${b}${tab ? `?tab=${tab}` : ""}`} aria-current={b === brand ? "page" : undefined} className={`btn btn-sm shrink-0 ${b === brand ? "btn-primary" : ""}`}>
          <span className={`h-2 w-2 rounded-full ${BRAND_DOT[b]}`} aria-hidden="true" />
          {BRAND_LABELS[b]}
        </Link>
      ))}
    </div>
  );
}

/** The email exactly as it will be sent, in a frame that runs nothing. */
export function EmailFrame({ html, width, height = 640, title }: { html: string; width: number; height?: number; title: string }) {
  return <iframe title={title} srcDoc={html} sandbox="" className="block rounded-xl border border-line bg-white" style={{ width, maxWidth: "100%", height }} />;
}

/** A small, still picture of an email for a list. */
export function EmailThumb({ html, title }: { html: string; title: string }) {
  const scale = 0.42;
  return (
    <span className="relative block aspect-[4/5] overflow-hidden rounded-xl border border-line bg-white" aria-hidden="true">
      <iframe title={title} srcDoc={html} sandbox="" tabIndex={-1} className="pointer-events-none absolute left-0 top-0 origin-top-left border-0" style={{ width: 640, height: 900, transform: `scale(${scale})` }} />
    </span>
  );
}

/* --------------------------------------------------------- the canvas */

/** One block on the canvas, drawn with the brand's colours and fonts, close to how the email shows it. */
export function BlockView({ block, s, language }: { block: Block; s: BrandSettings; language: "en" | "fr" }) {
  const c = s.colors;
  const head = FONT_STACKS[s.fonts.heading].stack;
  const body = FONT_STACKS[s.fonts.body].stack;
  const link = `color:${c.accent};text-decoration:underline`;
  const missing = language === "fr" ? "Choisir une image" : "Choose a picture";
  const paragraphs = (text: string, size = 16) =>
    text
      .split(/\n\s*\n/)
      .filter((p) => p.trim())
      .map((p, i) => <p key={i} style={{ margin: "0 0 12px", fontFamily: body, fontSize: size, lineHeight: 1.6, color: c.text }} dangerouslySetInnerHTML={{ __html: p.split("\n").map((l) => inlineHtml(l, link)).join("<br>") }} />);
  const picture = (src: string, alt: string, height = 140) => {
    const safe = safeImage(src);
    // eslint-disable-next-line @next/next/no-img-element
    if (safe) return <img src={safe} alt={alt} className="block h-auto w-full" />;
    return (
      <span className="flex items-center justify-center border border-dashed text-xs" style={{ height, borderColor: c.muted, color: c.muted, fontFamily: body }}>
        {missing}
        {alt ? ` · ${alt}` : ""}
      </span>
    );
  };
  switch (block.type) {
    case "heading":
      return <div style={{ fontFamily: head, fontSize: block.level === 1 ? 28 : 22, lineHeight: 1.25, fontWeight: 600, color: c.text, textAlign: block.align }} dangerouslySetInnerHTML={{ __html: inlineHtml(block.text || "…", link) }} />;
    case "text":
      return <div style={{ textAlign: block.align }}>{block.text.trim() ? paragraphs(block.text) : <p style={{ color: c.muted, fontFamily: body }}>…</p>}</div>;
    case "image":
      return (
        <div style={{ display: "flex", justifyContent: block.align === "center" ? "center" : block.align === "right" ? "flex-end" : "flex-start" }}>
          <div style={{ width: `${block.width}%` }}>{picture(block.src, block.alt, 160)}</div>
        </div>
      );
    case "button":
      return (
        <div style={{ textAlign: block.align }}>
          <span
            style={{
              display: "inline-block",
              padding: block.style === "solid" ? "14px 28px" : "12px 26px",
              borderRadius: 999,
              background: block.style === "solid" ? c.accent : "transparent",
              border: block.style === "solid" ? "none" : `2px solid ${c.accent}`,
              color: block.style === "solid" ? c.button_text : c.accent,
              fontFamily: body,
              fontSize: 16,
              fontWeight: 600,
            }}
          >
            {block.label || "…"}
          </span>
        </div>
      );
    case "split":
      return (
        <div className={`flex gap-4 ${block.side === "right" ? "flex-row-reverse" : ""}`}>
          <div className="w-[45%] shrink-0">{picture(block.src, block.alt, 120)}</div>
          <div className="min-w-0 flex-1">{paragraphs(block.text, 15)}</div>
        </div>
      );
    case "quote":
      return (
        <div style={{ borderLeft: `3px solid ${c.accent}`, padding: "4px 0 4px 16px" }}>
          <p style={{ margin: 0, fontFamily: head, fontSize: 20, lineHeight: 1.45, fontStyle: "italic", color: c.text }} dangerouslySetInnerHTML={{ __html: inlineHtml(block.text || "…", link) }} />
          {block.cite && <p style={{ margin: "8px 0 0", fontFamily: body, fontSize: 13, color: c.muted }}>— {block.cite}</p>}
        </div>
      );
    case "divider":
      return <div style={{ height: 1, background: mix(c.muted, c.card, 0.7), margin: "8px 0" }} />;
    case "spacer":
      return <div style={{ height: block.size }} className="bg-[repeating-linear-gradient(45deg,transparent_0_6px,rgba(0,0,0,.04)_6px_12px)]" />;
  }
}

/* ------------------------------------------------- dragging to reorder */

export interface Sortable {
  /** Where the dragged item would land, while dragging. */
  readonly drag: { readonly from: number; readonly to: number } | null;
  readonly register: (index: number) => (el: HTMLElement | null) => void;
  readonly handle: (index: number) => {
    onPointerDown: (e: React.PointerEvent<HTMLElement>) => void;
    onPointerMove: (e: React.PointerEvent<HTMLElement>) => void;
    onPointerUp: (e: React.PointerEvent<HTMLElement>) => void;
    onPointerCancel: () => void;
    style: React.CSSProperties;
  };
}

/** A vertical list reordered by dragging a handle: mouse, pen or finger; the page scrolls near its edges. */
export function useSortable(count: number, move: (from: number, to: number) => void): Sortable {
  const [drag, setDrag] = useState<{ from: number; to: number } | null>(null);
  const live = useRef<{ from: number; to: number } | null>(null);
  const items = useRef<(HTMLElement | null)[]>([]);
  const register = useCallback((index: number) => (el: HTMLElement | null) => {
    items.current[index] = el;
  }, []);
  const targetAt = (y: number, from: number) => {
    let to = count - 1;
    for (let i = 0; i < count; i += 1) {
      const el = items.current[i];
      if (!el || i === from) continue;
      const r = el.getBoundingClientRect();
      if (y < r.top + r.height / 2) {
        to = i > from ? i - 1 : i;
        break;
      }
    }
    return to;
  };
  const handle = (index: number) => ({
    onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      live.current = { from: index, to: index };
      setDrag(live.current);
    },
    onPointerMove: (e: React.PointerEvent<HTMLElement>) => {
      if (!live.current) return;
      if (e.clientY < 72) window.scrollBy(0, -14);
      else if (e.clientY > window.innerHeight - 72) window.scrollBy(0, 14);
      const to = targetAt(e.clientY, live.current.from);
      if (to !== live.current.to) {
        live.current = { ...live.current, to };
        setDrag(live.current);
      }
    },
    onPointerUp: () => {
      const d = live.current;
      live.current = null;
      setDrag(null);
      if (d && d.to !== d.from) move(d.from, d.to);
    },
    onPointerCancel: () => {
      live.current = null;
      setDrag(null);
    },
    style: { touchAction: "none", cursor: "grab" } as React.CSSProperties,
  });
  return { drag, register, handle };
}

export function moved<T>(list: readonly T[], from: number, to: number): T[] {
  const next = [...list];
  const [item] = next.splice(from, 1);
  if (item !== undefined) next.splice(Math.max(0, Math.min(to, next.length)), 0, item);
  return next;
}

/* ------------------------------------------------ pictures from Files */

/** The brand's own basket in Files: pick a picture, get its address. Never the other brand's. */
export function PicturePicker({ brand, open, onClose, onPick }: { brand: Brand; open: boolean; onClose: () => void; onPick: (url: string, alt: string) => void }) {
  const { data, error, loading, reload } = useApi<FilesView>(open ? "/api/studio/files" : null);
  const [q, setQ] = useState("");
  const [item, setItem] = useState<FileItem | null>(null);
  const [limit, setLimit] = useState(36);
  const items = useMemo(() => {
    const query = q.trim().toLowerCase();
    return (data?.items ?? []).filter((i) => i.basket === brand && i.kinds.includes("picture") && (!query || i.name.toLowerCase().includes(query) || i.folder.toLowerCase().includes(query)));
  }, [data, brand, q]);
  const repo = basketOf(brand).repo;
  const url = (i: FileItem, v: number) => rawUrl(repo, i.ref, versionPath(i, i.versions[v]!));
  return (
    <Sheet open={open} onClose={onClose} title={`Pictures · ${BRAND_LABELS[brand]}`} wide>
      {loading && !data && <Loading label="Reading the repository" />}
      {error && <ErrorNote error={error} retry={() => void reload()} />}
      {data && !item && (
        <>
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search: aries, the fool, woodcut…" className="field" aria-label="Search the pictures" />
          <p className="mt-2 text-xs text-ink-3">{items.length} pictures in {repo}</p>
          {items.length === 0 ? (
            <Empty>No picture by that name.</Empty>
          ) : (
            <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
              {items.slice(0, limit).map((i) => {
                const v = i.versions[i.cover];
                if (!v) return null;
                // Many pictures share a name (Aries in eight styles): the folder tells them apart.
                const where = i.folder.split("/").pop() ?? "";
                return (
                  <button key={i.id} type="button" onClick={() => (i.versions.filter((x) => x.kind === "picture").length > 1 ? setItem(i) : onPick(url(i, i.cover), i.name))} className="text-left" aria-label={where ? `${i.name}, ${where}` : i.name} title={`${i.folder}${i.ref === "main" ? "" : ` · ${i.ref}`}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url(i, i.cover)} alt="" loading="lazy" className="aspect-square w-full rounded-lg border border-line bg-ink/5 object-contain" />
                    <span className="mt-1 block truncate text-[11px] text-ink-2">{i.name}</span>
                    {where && <span className="block truncate text-[10px] text-ink-3">{where}</span>}
                  </button>
                );
              })}
            </div>
          )}
          {items.length > limit && (
            <button className="btn btn-sm mt-3 w-full" onClick={() => setLimit((n) => n + 36)}>
              Show more
            </button>
          )}
        </>
      )}
      {item && (
        <>
          <button className="btn btn-quiet btn-sm" onClick={() => setItem(null)}>
            ← All pictures
          </button>
          <p className="mt-2 text-sm font-medium">{item.name}: choose a version</p>
          <div className="mt-3 grid grid-cols-2 gap-3">
            {item.versions.map((v, n) =>
              v.kind !== "picture" ? null : (
                <button key={v.file} type="button" onClick={() => onPick(url(item, n), item.name)} className="text-left">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url(item, n)} alt="" loading="lazy" className="aspect-square w-full rounded-lg border border-line bg-ink/5 object-contain" />
                  <span className="mt-1 block text-xs text-ink-2">{v.label}</span>
                </button>
              ),
            )}
          </div>
        </>
      )}
    </Sheet>
  );
}
