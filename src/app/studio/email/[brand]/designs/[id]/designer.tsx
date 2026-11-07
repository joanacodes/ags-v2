"use client";
/**
 * The email designer: blocks on a canvas in the brand's look. Add a block from the palette (a tap, or a
 * drag onto the canvas on a computer), drag the ⠿ handle to reorder (a finger works too), tap a block to
 * change it. Preview shows the real email, as a phone or a computer shows it. "Write it for me" asks the
 * AI for a draft; "Send me a test" sends what is on screen to the owner only.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, useApi } from "@/components/studio/api";
import { ErrorNote, Loading, Sheet, useAction, useToast } from "@/components/studio/ui";
import { BLOCK_LABELS, BLOCK_TYPES, BRAND_LABELS, newBlock, newBlockId, type Block, type BlockType, type Brand, type DesignContent } from "@/studio/email/model";
import { renderEmail } from "@/studio/email/render";
import type { DesignView, EmailOverview } from "@/studio/email/views";
import type { Language } from "@/studio/types";
import { BlockView, EmailFrame, moved, PicturePicker, useSortable } from "../../../email-ui";

type Mode = "edit" | "phone" | "computer";
const DRAG_TYPE = "application/x-studio-block";

const GLYPH: Readonly<Record<BlockType, string>> = { heading: "T", text: "¶", image: "▣", button: "◉", split: "◧", quote: "❝", divider: "—", spacer: "↕" };

function useNarrow(): boolean {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const m = window.matchMedia("(max-width: 767px)");
    const on = () => setNarrow(m.matches);
    on();
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return narrow;
}

export function Designer({ brand, id }: { brand: Brand; id: string }) {
  const overview = useApi<EmailOverview>(`/api/studio/email/${brand}`);
  const design = useApi<DesignView>(`/api/studio/email/${brand}/designs/${id}`);
  if (overview.error || design.error) return <ErrorNote error={overview.error ?? design.error ?? ""} retry={() => void (overview.error ? overview.reload() : design.reload())} />;
  if (!overview.data || !design.data) return <Loading label="Opening the design" />;
  return <Editor key={design.data.id} brand={brand} overview={overview.data} initial={design.data} />;
}

function Editor({ brand, overview, initial }: { brand: Brand; overview: EmailOverview; initial: DesignView }) {
  const router = useRouter();
  const toast = useToast();
  const narrow = useNarrow();
  const { busy, run } = useAction();
  const [content, setContent] = useState<DesignContent>(initial.content);
  const [saved, setSaved] = useState(JSON.stringify(initial.content));
  const [selected, setSelected] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("edit");
  const [palette, setPalette] = useState(false);
  const [inspector, setInspector] = useState(false);
  const [ai, setAi] = useState(false);
  const [brief, setBrief] = useState("");
  const [undo, setUndo] = useState<DesignContent | null>(null);
  const [picking, setPicking] = useState(false);
  const [insertAt, setInsertAt] = useState<number | null>(null);
  const canvas = useRef<HTMLDivElement | null>(null);
  const settings = overview.settings;
  const dirty = JSON.stringify(content) !== saved;
  const blocks = content.blocks;
  const current = blocks.find((b) => b.id === selected) ?? null;

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const setBlocks = useCallback((next: Block[]) => setContent((c) => ({ ...c, blocks: next })), []);
  const sortable = useSortable(blocks.length, (from, to) => setBlocks(moved(blocks, from, to)));

  const add = (type: BlockType, at?: number) => {
    const block = newBlock(type, content.language);
    const index = at ?? (current ? blocks.findIndex((b) => b.id === current.id) + 1 : blocks.length);
    const next = [...blocks];
    next.splice(index, 0, block);
    setBlocks(next);
    setSelected(block.id);
    setPalette(false);
    if (narrow) setInspector(true);
  };
  const update = (b: Block) => setBlocks(blocks.map((x) => (x.id === b.id ? b : x)));
  const remove = (blockId: string) => {
    setBlocks(blocks.filter((b) => b.id !== blockId));
    if (selected === blockId) setSelected(null);
    setInspector(false);
  };
  const duplicate = (b: Block) => {
    const i = blocks.findIndex((x) => x.id === b.id);
    const copy = { ...b, id: newBlockId() } as Block;
    const next = [...blocks];
    next.splice(i + 1, 0, copy);
    setBlocks(next);
    setSelected(copy.id);
  };
  const step = (i: number, by: -1 | 1) => {
    const to = i + by;
    if (to >= 0 && to < blocks.length) setBlocks(moved(blocks, i, to));
  };

  const html = useMemo(() => (mode === "edit" ? "" : renderEmail(content, brand, settings, { unsubscribeUrl: "#", preview: true, firstName: "Ana" }).html), [mode, content, brand, settings]);

  async function save() {
    const r = await run("save", () => api<DesignView>(`/api/studio/email/${brand}/designs/${initial.id}`, { method: "PUT", body: content }), "Saved");
    if (r) {
      setContent(r.content);
      setSaved(JSON.stringify(r.content));
    }
  }
  async function writeIt() {
    const r = await run("ai", () => api<{ subject: string; preheader: string; blocks: Block[] }>(`/api/studio/email/${brand}/draft`, { method: "POST", body: { brief, language: content.language, current: content } }));
    if (r) {
      setUndo(content);
      setContent((c) => ({ ...c, subject: r.subject, preheader: r.preheader, blocks: r.blocks }));
      setSelected(null);
      setAi(false);
      toast("Written. Read every line, add the pictures, then save.");
    }
  }

  // Dropping a block from the palette onto the canvas (computers): where the pointer is, between blocks.
  const dropIndex = (y: number) => {
    const els = canvas.current ? Array.from(canvas.current.querySelectorAll<HTMLElement>("[data-block]")) : [];
    const i = els.findIndex((el) => {
      const r = el.getBoundingClientRect();
      return y < r.top + r.height / 2;
    });
    return i === -1 ? els.length : i;
  };

  const c = settings.colors;
  return (
    <div>
      {/* the top bar */}
      <div className="flex flex-wrap items-center gap-2">
        <Link href={`/studio/email/${brand}`} className="btn btn-quiet btn-sm">
          ← {BRAND_LABELS[brand]}
        </Link>
        <input className="field max-w-[260px] flex-1 font-serif text-lg" value={content.name} onChange={(e) => setContent({ ...content, name: e.target.value })} aria-label="Design name" maxLength={80} />
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div className="flex rounded-full border border-line-2 p-0.5" role="tablist" aria-label="View">
            {(["edit", "phone", "computer"] as const).map((m) => (
              <button key={m} role="tab" aria-selected={mode === m} onClick={() => setMode(m)} className={`rounded-full px-3 py-1 text-xs ${mode === m ? "bg-ink text-paper" : "text-ink-2"}`}>
                {m === "edit" ? "Edit" : m === "phone" ? "Phone" : "Computer"}
              </button>
            ))}
          </div>
          <button className="btn btn-sm" onClick={() => setAi(true)}>
            ✦ Write it for me
          </button>
          <button className="btn btn-sm" disabled={busy !== null} onClick={() => void run("test", () => api<{ to: string }>(`/api/studio/email/${brand}/test`, { method: "POST", body: content }), (r) => `Test sent to ${r.to}`)}>
            Send me a test
          </button>
          <button className="btn btn-accent btn-sm" disabled={busy !== null || !dirty} onClick={() => void save()}>
            {busy === "save" ? "Saving…" : dirty ? "Save" : "Saved"}
          </button>
        </div>
      </div>
      {undo && (
        <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl bg-sky-soft px-4 py-2 text-sm text-sky">
          <span>The AI wrote this draft. Nothing is saved until you save.</span>
          <button
            className="btn btn-sm"
            onClick={() => {
              setContent(undo);
              setUndo(null);
            }}
          >
            Undo
          </button>
        </div>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
        <div>
          <label className="label" htmlFor="d-subject">
            Subject
          </label>
          <input id="d-subject" className="field" value={content.subject} onChange={(e) => setContent({ ...content, subject: e.target.value })} maxLength={200} placeholder="What the inbox shows first" />
        </div>
        <div>
          <label className="label" htmlFor="d-pre">
            Preview line
          </label>
          <input id="d-pre" className="field" value={content.preheader} onChange={(e) => setContent({ ...content, preheader: e.target.value })} maxLength={200} placeholder="The grey line after the subject" />
        </div>
        <div>
          <label className="label" htmlFor="d-lang">
            Language
          </label>
          <select id="d-lang" className="field" value={content.language} onChange={(e) => setContent({ ...content, language: e.target.value as Language })}>
            <option value="en">English</option>
            <option value="fr">Français</option>
          </select>
        </div>
      </div>

      {mode !== "edit" ? (
        <div className="mt-5 flex justify-center rounded-3xl p-4" style={{ background: c.page }}>
          <EmailFrame html={html} width={mode === "phone" ? 375 : 680} height={mode === "phone" ? 720 : 760} title={`${content.name}, as ${mode === "phone" ? "a phone" : "a computer"} shows it`} />
        </div>
      ) : (
        <div className="mt-5 grid gap-5 md:grid-cols-[176px_minmax(0,1fr)_300px]">
          {/* the palette */}
          <aside className="hidden md:block">
            <p className="eyebrow mb-2">Blocks</p>
            <Palette onAdd={(t) => add(t)} />
            <p className="mt-3 text-[11px] leading-snug text-ink-3">Tap to add below the selected block, or drag onto the email.</p>
          </aside>

          {/* the canvas */}
          <div className="rounded-3xl p-3 sm:p-6" style={{ background: c.page }}>
            <div
              ref={canvas}
              className="mx-auto max-w-[600px] rounded-xl py-6 shadow-soft"
              style={{ background: c.card }}
              onDragOver={(e) => {
                if (!e.dataTransfer.types.includes(DRAG_TYPE)) return;
                e.preventDefault();
                setInsertAt(dropIndex(e.clientY));
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setInsertAt(null);
              }}
              onDrop={(e) => {
                const type = e.dataTransfer.getData(DRAG_TYPE) as BlockType;
                if (!(BLOCK_TYPES as readonly string[]).includes(type)) return;
                e.preventDefault();
                add(type, dropIndex(e.clientY));
                setInsertAt(null);
              }}
            >
              <p className="px-6 pb-2 text-[13px] uppercase tracking-[2px] sm:px-10" style={{ color: c.muted }}>
                {settings.sender_name || BRAND_LABELS[brand]}
              </p>
              {blocks.length === 0 && <p className="px-10 py-10 text-center text-sm" style={{ color: c.muted }}>Add a first block from the palette.</p>}
              {blocks.map((b, i) => {
                const isSel = b.id === selected;
                const d = sortable.drag;
                const lineBefore = (d && d.to === i && d.to < d.from) || insertAt === i;
                const lineAfter = (d && d.to === i && d.to > d.from) || (insertAt === blocks.length && i === blocks.length - 1);
                return (
                  <div
                    key={b.id}
                    data-block
                    ref={sortable.register(i)}
                    className={`group relative ${d?.from === i ? "opacity-40" : ""}`}
                    onClick={() => {
                      setSelected(b.id);
                      if (narrow) setInspector(true);
                    }}
                  >
                    {lineBefore && <span className="absolute inset-x-4 -top-0.5 h-1 rounded-full bg-accent" aria-hidden="true" />}
                    <div className={`mx-2 cursor-pointer rounded-lg px-4 py-2 sm:px-8 ${isSel ? "outline outline-2 outline-accent" : "hover:outline hover:outline-1 hover:outline-line-2"}`}>
                      <BlockView block={b} s={settings} language={content.language} />
                    </div>
                    <div className={`absolute -top-3 right-3 z-10 items-center gap-0.5 rounded-full border border-line bg-paper px-1 py-0.5 shadow-soft ${isSel ? "flex" : "hidden group-hover:flex"}`} onClick={(e) => e.stopPropagation()}>
                      <button type="button" className="rounded-full px-2 py-1 text-xs text-ink-2 hover:bg-ink/5" aria-label={`Drag to move: ${BLOCK_LABELS[b.type].label}`} {...sortable.handle(i)}>
                        ⠿
                      </button>
                      <button type="button" className="rounded-full px-2 py-1 text-xs text-ink-2 hover:bg-ink/5 disabled:opacity-30" disabled={i === 0} onClick={() => step(i, -1)} aria-label="Move up">
                        ↑
                      </button>
                      <button type="button" className="rounded-full px-2 py-1 text-xs text-ink-2 hover:bg-ink/5 disabled:opacity-30" disabled={i === blocks.length - 1} onClick={() => step(i, 1)} aria-label="Move down">
                        ↓
                      </button>
                      <button type="button" className="rounded-full px-2 py-1 text-xs text-ink-2 hover:bg-ink/5" onClick={() => duplicate(b)} aria-label="Duplicate">
                        ⧉
                      </button>
                      <button type="button" className="rounded-full px-2 py-1 text-xs text-rust hover:bg-rust-soft" onClick={() => remove(b.id)} aria-label="Delete">
                        ✕
                      </button>
                    </div>
                    {lineAfter && <span className="absolute inset-x-4 -bottom-0.5 h-1 rounded-full bg-accent" aria-hidden="true" />}
                  </div>
                );
              })}
              <div className="mt-6 border-t px-6 pt-4 text-center text-xs sm:px-10" style={{ color: c.muted, borderColor: c.page }}>
                {settings.sender_name || BRAND_LABELS[brand]}
                {settings.footer_address ? ` · ${settings.footer_address}` : ""}
                <br />
                {settings.footer_note[content.language]}
                <br />
                <span className="underline">{content.language === "fr" ? "Se désinscrire" : "Unsubscribe"}</span>
              </div>
            </div>
          </div>

          {/* the inspector */}
          <aside className="hidden md:block">
            <div className="sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto rounded-2xl border border-line bg-card p-4">
              {current ? <Inspector block={current} onChange={update} onPick={() => setPicking(true)} onRemove={() => remove(current.id)} /> : <DesignHelp />}
            </div>
          </aside>
        </div>
      )}

      {/* phones: add and edit in sheets */}
      {mode === "edit" && narrow && (
        <button className="btn btn-accent fixed bottom-[calc(76px+env(safe-area-inset-bottom))] right-4 z-30 shadow-sheet" onClick={() => setPalette(true)}>
          + Add a block
        </button>
      )}
      <Sheet open={palette} onClose={() => setPalette(false)} title="Add a block">
        <Palette onAdd={(t) => add(t)} />
      </Sheet>
      <Sheet open={inspector && current !== null} onClose={() => setInspector(false)} title={current ? BLOCK_LABELS[current.type].label : ""}>
        {current && <Inspector block={current} onChange={update} onPick={() => setPicking(true)} onRemove={() => remove(current.id)} />}
      </Sheet>

      <Sheet open={ai} onClose={() => setAi(false)} title="Write it for me" wide>
        <p className="text-sm text-ink-2">Say what the email is for. The AI writes it in {BRAND_LABELS[brand]}&apos;s voice, in {content.language === "fr" ? "French" : "English"}, using this design&apos;s blocks as a starting point. Nothing is sent or saved.</p>
        <textarea className="field mt-3 min-h-[140px]" value={brief} onChange={(e) => setBrief(e.target.value)} maxLength={3000} placeholder={brand === "astrostudy" ? "e.g. Invite people who took the test to the live show on 4 December; one button to the tickets." : "e.g. Present the new Major Arcana designs; one button to the shop."} />
        <button className="btn btn-accent mt-3 w-full" disabled={busy !== null || brief.trim().length < 5} onClick={() => void writeIt()}>
          {busy === "ai" ? "Writing… (about a minute)" : "Write it"}
        </button>
        <p className="mt-2 text-xs text-ink-3">Pictures come back as empty frames that say what to choose; pick them from Files.</p>
      </Sheet>

      <PicturePicker
        brand={brand}
        open={picking}
        onClose={() => setPicking(false)}
        onPick={(url, name) => {
          if (current && (current.type === "image" || current.type === "split")) update({ ...current, src: url, alt: current.alt || name });
          setPicking(false);
        }}
      />

      <MoreActions brand={brand} id={initial.id} onGone={() => router.push(`/studio/email/${brand}`)} onCopied={(newId) => router.push(`/studio/email/${brand}/designs/${newId}`)} />
    </div>
  );
}

function Palette({ onAdd }: { onAdd: (type: BlockType) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-1">
      {BLOCK_TYPES.map((t) => (
        <button
          key={t}
          type="button"
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData(DRAG_TYPE, t);
            e.dataTransfer.effectAllowed = "copy";
          }}
          onClick={() => onAdd(t)}
          className="flex items-center gap-2 rounded-xl border border-line bg-card px-3 py-2 text-left text-sm hover:border-accent"
        >
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent-soft font-serif text-accent-ink" aria-hidden="true">
            {GLYPH[t]}
          </span>
          <span className="min-w-0">
            <span className="block font-medium leading-tight">{BLOCK_LABELS[t].label}</span>
            <span className="hidden truncate text-[11px] text-ink-3 md:block">{BLOCK_LABELS[t].hint}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

function DesignHelp() {
  return (
    <div className="space-y-3 text-sm text-ink-2">
      <p className="eyebrow">Tips</p>
      <p>Tap a block to change it. Drag the ⠿ handle to move it.</p>
      <p>
        In text: <code className="rounded bg-ink/5 px-1">**bold**</code>, <code className="rounded bg-ink/5 px-1">*italic*</code>, <code className="rounded bg-ink/5 px-1">[words](https://…)</code> for a link, and <code className="rounded bg-ink/5 px-1">{"{{first_name}}"}</code> for the reader&apos;s first name.
      </p>
      <p>The footer, with the unsubscribe link, is added to every email.</p>
    </div>
  );
}

const ALIGNS = [
  { id: "left", label: "Left" },
  { id: "center", label: "Centre" },
  { id: "right", label: "Right" },
] as const;

function Choice<T extends string>({ value, options, onChange, label }: { value: T; options: readonly { id: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div>
      <p className="label">{label}</p>
      <div className="flex flex-wrap gap-1">
        {options.map((o) => (
          <button key={o.id} type="button" onClick={() => onChange(o.id)} aria-pressed={value === o.id} className={`btn btn-sm ${value === o.id ? "btn-primary" : ""}`}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function TextField({ label, value, onChange, rows, placeholder, max }: { label: string; value: string; onChange: (v: string) => void; rows?: number; placeholder?: string; max: number }) {
  const id = `f-${label.toLowerCase().replace(/[^a-z]+/g, "-")}`;
  return (
    <div>
      <label className="label" htmlFor={id}>
        {label}
      </label>
      {rows ? (
        <textarea id={id} className="field" rows={rows} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} maxLength={max} />
      ) : (
        <input id={id} className="field" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} maxLength={max} />
      )}
    </div>
  );
}

function Inspector({ block, onChange, onPick, onRemove }: { block: Block; onChange: (b: Block) => void; onPick: () => void; onRemove: () => void }) {
  const body = (() => {
    switch (block.type) {
      case "heading":
        return (
          <>
            <TextField label="Title" value={block.text} onChange={(text) => onChange({ ...block, text })} rows={2} max={300} />
            <Choice label="Size" value={String(block.level) as "1" | "2"} options={[{ id: "1", label: "Large" }, { id: "2", label: "Medium" }]} onChange={(v) => onChange({ ...block, level: v === "1" ? 1 : 2 })} />
            <Choice label="Align" value={block.align} options={ALIGNS} onChange={(align) => onChange({ ...block, align })} />
          </>
        );
      case "text":
        return (
          <>
            <TextField label="Text" value={block.text} onChange={(text) => onChange({ ...block, text })} rows={8} max={5000} placeholder="A blank line starts a new paragraph." />
            <p className="text-[11px] text-ink-3">**bold** · *italic* · [words](https://…) · {"{{first_name}}"}</p>
            <Choice label="Align" value={block.align} options={ALIGNS} onChange={(align) => onChange({ ...block, align })} />
          </>
        );
      case "image":
        return (
          <>
            <button type="button" className="btn btn-sm w-full" onClick={onPick}>
              Pick from Files
            </button>
            <TextField label="Picture address" value={block.src} onChange={(src) => onChange({ ...block, src })} placeholder="https://…" max={2000} />
            <TextField label="Description (for readers who can't see it)" value={block.alt} onChange={(alt) => onChange({ ...block, alt })} max={300} />
            <TextField label="Link when tapped (optional)" value={block.href} onChange={(href) => onChange({ ...block, href })} placeholder="https://…" max={2000} />
            <div>
              <label className="label" htmlFor="f-width">
                Width: {block.width}%
              </label>
              <input id="f-width" type="range" min={20} max={100} step={5} value={block.width} onChange={(e) => onChange({ ...block, width: Number(e.target.value) })} className="w-full accent-[#b5512c]" />
            </div>
            <Choice label="Align" value={block.align} options={ALIGNS} onChange={(align) => onChange({ ...block, align })} />
          </>
        );
      case "button":
        return (
          <>
            <TextField label="Label" value={block.label} onChange={(label) => onChange({ ...block, label })} max={80} />
            <TextField label="Link" value={block.href} onChange={(href) => onChange({ ...block, href })} placeholder="https://…" max={2000} />
            <Choice label="Style" value={block.style} options={[{ id: "solid", label: "Filled" }, { id: "outline", label: "Outline" }]} onChange={(style) => onChange({ ...block, style })} />
            <Choice label="Align" value={block.align} options={ALIGNS} onChange={(align) => onChange({ ...block, align })} />
          </>
        );
      case "split":
        return (
          <>
            <button type="button" className="btn btn-sm w-full" onClick={onPick}>
              Pick the picture from Files
            </button>
            <TextField label="Picture address" value={block.src} onChange={(src) => onChange({ ...block, src })} placeholder="https://…" max={2000} />
            <TextField label="Description" value={block.alt} onChange={(alt) => onChange({ ...block, alt })} max={300} />
            <TextField label="Text" value={block.text} onChange={(text) => onChange({ ...block, text })} rows={5} max={3000} />
            <Choice label="Picture on the" value={block.side} options={[{ id: "left", label: "Left" }, { id: "right", label: "Right" }]} onChange={(side) => onChange({ ...block, side })} />
          </>
        );
      case "quote":
        return (
          <>
            <TextField label="Quote" value={block.text} onChange={(text) => onChange({ ...block, text })} rows={3} max={1000} />
            <TextField label="Who said it" value={block.cite} onChange={(cite) => onChange({ ...block, cite })} max={200} />
          </>
        );
      case "spacer":
        return (
          <div>
            <label className="label" htmlFor="f-size">
              Height: {block.size} px
            </label>
            <input id="f-size" type="range" min={8} max={96} step={4} value={block.size} onChange={(e) => onChange({ ...block, size: Number(e.target.value) })} className="w-full accent-[#b5512c]" />
          </div>
        );
      case "divider":
        return <p className="text-sm text-ink-3">A thin line in a quiet colour. Nothing to set.</p>;
    }
  })();
  return (
    <div className="space-y-4">
      <p className="eyebrow">{BLOCK_LABELS[block.type].label}</p>
      {body}
      <button type="button" className="btn btn-danger btn-sm w-full" onClick={onRemove}>
        Delete this block
      </button>
    </div>
  );
}

function MoreActions({ brand, id, onGone, onCopied }: { brand: Brand; id: string; onGone: () => void; onCopied: (id: string) => void }) {
  const { busy, run } = useAction();
  return (
    <div className="mt-8 flex flex-wrap gap-2 border-t border-line pt-4">
      <button className="btn btn-sm" disabled={busy !== null} onClick={() => void run("copy", () => api<DesignView>(`/api/studio/email/${brand}/designs/${id}`, { method: "POST", body: { action: "duplicate" } }), "Copied").then((r) => r && onCopied(r.id))}>
        Duplicate the design
      </button>
      <button
        className="btn btn-danger btn-sm"
        disabled={busy !== null}
        onClick={() => {
          if (window.confirm("Delete this design?")) void run("delete", () => api(`/api/studio/email/${brand}/designs/${id}`, { method: "DELETE" }), "Deleted").then((r) => r && onGone());
        }}
      >
        Delete the design
      </button>
    </div>
  );
}
