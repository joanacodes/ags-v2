"use client";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { api, useApi } from "@/components/studio/api";
import { PieceRow } from "@/components/studio/pieces";
import { ago, Empty, ErrorNote, Loading, money, paris, Status, Tabs, useAction } from "@/components/studio/ui";
import { ReplyCard } from "../today/today-screen";
import type { CardSummary, LibraryTab, WeekGroup } from "@/studio/views/library";
import type { PieceLine, ReplyLine } from "@/studio/views/shared";
import type { RunRow, ScorecardRow, SkyRow, CalendarRow } from "@/studio/store/rows";
import { HooksTab, PromptsTab, SkyTab, TemplatesTab } from "./library-more";

const TABS: { id: LibraryTab; label: string }[] = [
  { id: "week", label: "The week" },
  { id: "cards", label: "Cards" },
  { id: "pieces", label: "Pieces" },
  { id: "replies", label: "Replies" },
  { id: "media", label: "Media" },
  { id: "templates", label: "Templates" },
  { id: "hooks", label: "Hooks" },
  { id: "prompts", label: "Prompts" },
  { id: "sky", label: "Sky and calendar" },
  { id: "scorecards", label: "Scorecards" },
  { id: "runs", label: "Runs" },
];

const FILTERS: Partial<Record<LibraryTab, { key: string; label: string; options: readonly string[] }[]>> = {
  cards: [
    { key: "pillar", label: "Pillar", options: ["test", "placements", "tested", "sky"] },
    { key: "language", label: "Language", options: ["en", "fr", "both"] },
    { key: "status", label: "Status", options: ["draft", "approved", "used", "killed"] },
  ],
  pieces: [
    { key: "platform", label: "Platform", options: ["instagram", "tiktok", "youtube", "facebook", "threads", "bluesky", "mastodon", "x", "pinterest", "substack", "medium", "site"] },
    { key: "format", label: "Format", options: ["video", "carousel", "text", "pin", "still", "story", "issue", "long_video", "article"] },
    { key: "language", label: "Language", options: ["en", "fr"] },
    { key: "status", label: "Status", options: ["draft", "approved", "rendered", "queued", "posted", "failed", "killed"] },
  ],
  replies: [{ key: "status", label: "Status", options: ["draft", "approved", "sent", "skipped", "all"] }],
  hooks: [
    { key: "pillar", label: "Pillar", options: ["test", "placements", "tested", "sky"] },
    { key: "language", label: "Language", options: ["en", "fr"] },
    { key: "status", label: "Show", options: ["retired", "all"] },
  ],
  runs: [
    { key: "agent", label: "Agent", options: ["strategist", "writer-en", "writer-fr", "community", "analyst", "metrics", "render", "publish", "sky", "sources", "maintenance", "interactive", "tick"] },
    { key: "outcome", label: "Outcome", options: ["ok", "failed", "capped", "skipped", "dry_run"] },
  ],
};
const WEEKLY: ReadonlySet<LibraryTab> = new Set(["week", "cards", "pieces", "media", "runs"]);

export function LibraryScreen() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const tab = (params.get("tab") ?? "week") as LibraryTab;
  const set = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) v === null || v === "" ? next.delete(k) : next.set(k, v);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };
  const query = params.toString() || "tab=week";
  const { data, error, loading, reload } = useApi<{ tab: LibraryTab; rows: unknown[]; weeks: string[] }>(`/api/studio/library?${query.includes("tab=") ? query : `tab=week&${query}`}`);
  const [q, setQ] = useState(params.get("q") ?? "");

  return (
    <div>
      <div className="mb-4">
        <p className="eyebrow">Everything made and held</p>
        <h1 className="text-4xl">Library</h1>
      </div>
      <Tabs tabs={TABS} active={tab} onChange={(id) => set({ tab: id, status: null, platform: null, format: null, pillar: null, language: null, agent: null, outcome: null, failed: null })} />
      <div className="mt-4 flex flex-wrap items-end gap-2">
        {WEEKLY.has(tab) && data && (
          <label className="text-sm">
            <span className="label">Week</span>
            <select className="field w-36" value={params.get("week") ?? (tab === "week" ? (data.weeks[3] ?? "") : "")} onChange={(e) => set({ week: e.target.value })}>
              {tab !== "week" && <option value="">All weeks</option>}
              {data.weeks.map((w) => (
                <option key={w} value={w}>
                  {w}
                </option>
              ))}
            </select>
          </label>
        )}
        {(FILTERS[tab] ?? []).map((f) => (
          <label key={f.key} className="text-sm">
            <span className="label">{f.label}</span>
            <select className="field w-36" value={params.get(f.key) ?? ""} onChange={(e) => set({ [f.key]: e.target.value })}>
              <option value="">Any</option>
              {f.options.map((o) => (
                <option key={o} value={o}>
                  {o.replace("_", " ")}
                </option>
              ))}
            </select>
          </label>
        ))}
        {tab === "pieces" && (
          <label className="flex items-center gap-2 pb-2 text-sm">
            <input type="checkbox" className="accent-[#b5512c]" checked={params.get("failed") === "1"} onChange={(e) => set({ failed: e.target.checked ? "1" : null })} />
            Gate failed
          </label>
        )}
        {(tab === "cards" || tab === "pieces" || tab === "hooks" || tab === "week") && (
          <form
            className="ml-auto flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              set({ q });
            }}
          >
            <input className="field w-48" placeholder="Search the words" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" />
          </form>
        )}
      </div>
      <div className="mt-5">
        {loading && !data ? <Loading /> : error && !data ? <ErrorNote error={error} retry={reload} /> : data && data.tab === tab ? <TabBody tab={tab} rows={data.rows} reload={reload} /> : <Loading />}
      </div>
    </div>
  );
}

function TabBody({ tab, rows, reload }: { tab: LibraryTab; rows: unknown[]; reload: () => Promise<void> }) {
  switch (tab) {
    case "week":
      return <WeekTab groups={rows as WeekGroup[]} reload={reload} />;
    case "cards":
      return <CardsTab cards={rows as CardSummary[]} reload={reload} />;
    case "pieces":
      return <PiecesTab pieces={rows as PieceLine[]} reload={reload} />;
    case "replies":
      return (rows as ReplyLine[]).length ? <ul className="space-y-2">{(rows as ReplyLine[]).map((r) => <ReplyCard key={r.id} r={r} onDone={reload} />)}</ul> : <Empty>No replies here.</Empty>;
    case "media":
      return <MediaTab media={rows as MediaItem[]} />;
    case "templates":
      return <TemplatesTab rows={rows} />;
    case "hooks":
      return <HooksTab rows={rows} reload={reload} />;
    case "prompts":
      return <PromptsTab rows={rows} />;
    case "sky":
      return <SkyTab data={rows[0] as { month: string; sky: SkyRow[]; calendar: CalendarRow[] }} reload={reload} />;
    case "scorecards":
      return <ScorecardsTab rows={rows as ScorecardRow[]} />;
    case "runs":
      return <RunsTab runs={rows as RunRow[]} />;
  }
}

function useSelection() {
  const [sel, setSel] = useState<Set<string>>(new Set());
  return {
    sel,
    has: (id: string) => sel.has(id),
    set: (id: string, on: boolean) => setSel((s) => {
      const n = new Set(s);
      if (on) n.add(id);
      else n.delete(id);
      return n;
    }),
    all: (ids: string[], on: boolean) => setSel(on ? new Set(ids) : new Set()),
    clear: () => setSel(new Set()),
  };
}

const PILLAR = { test: "The test", placements: "Placements", tested: "Tested first", sky: "The sky" } as const;

function WeekTab({ groups, reload }: { groups: WeekGroup[]; reload: () => Promise<void> }) {
  const { busy, run } = useAction();
  const sel = useSelection();
  const drafts = groups.filter((g) => g.card.status === "draft");
  const pieces = (action: string, ids: string[]) => run(action, () => api<{ changed: number; skipped: { why: string }[] }>("/api/studio/pieces", { body: { action, ids } }).then(async (r) => (await reload(), sel.clear(), r)), (r) => `${r.changed} ${action === "approve" ? "approved" : "killed"}${r.skipped.length ? `, ${r.skipped.length} skipped (${r.skipped[0]!.why})` : ""}`);
  const cards = (action: string, ids: string[]) => run(action, () => api<{ changed: number; skipped: { why: string }[] }>("/api/studio/cards", { body: { action, ids } }).then(async (r) => (await reload(), r)), (r) => `${r.changed} changed${r.skipped.length ? `, ${r.skipped.length} pieces skipped: ${r.skipped[0]!.why}` : ""}`);
  if (!groups.length) return <Empty>No cards for this week yet. The strategist writes them on Sunday at 06:00.</Empty>;
  return (
    <div>
      <div className="sticky top-14 z-20 -mx-4 mb-3 flex flex-wrap items-center gap-2 border-b border-line bg-paper/95 px-4 py-2 backdrop-blur md:mx-0 md:rounded-2xl md:border md:px-3">
        <span className="text-sm text-ink-2">{groups.length} cards · {groups.reduce((n, g) => n + g.pieces.length, 0)} pieces · {drafts.length} cards to review</span>
        <div className="ml-auto flex flex-wrap gap-2">
          {sel.sel.size > 0 && (
            <>
              <button className="btn btn-primary btn-sm" disabled={!!busy} onClick={() => pieces("approve", [...sel.sel])}>Approve {sel.sel.size}</button>
              <button className="btn btn-danger btn-sm" disabled={!!busy} onClick={() => pieces("kill", [...sel.sel])}>Kill {sel.sel.size}</button>
            </>
          )}
          {drafts.length > 0 && <button className="btn btn-accent btn-sm" disabled={!!busy} onClick={() => confirm(`Approve all ${drafts.length} cards and every piece that passed the gate?`) && cards("approve", drafts.map((g) => g.card.id))}>Approve the week</button>}
        </div>
      </div>
      <ul className="space-y-4">
        {groups.map(({ card, pieces: list }) => (
          <li key={card.id} className="panel p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5 text-xs text-ink-3">
                  <span className="chip">{PILLAR[card.pillar]}</span>
                  <span className="chip">{card.language === "both" ? "EN + FR" : card.language.toUpperCase()}</span>
                  {card.anchor && <span className="chip">{card.anchor}</span>}
                  {card.skyDate && <span className="chip">sky · {card.skyDate}</span>}
                  <Status value={card.status} />
                </div>
                <Link href={`/studio/library/cards/${card.id}`} className="mt-1 block font-serif text-xl hover:underline">{card.hook}</Link>
                {card.reason && <p className="mt-1 text-xs text-ink-3">Why: {card.reason}</p>}
              </div>
              <div className="flex gap-2">
                {card.status === "draft" && <button className="btn btn-primary btn-sm" disabled={!!busy} onClick={() => cards("approve", [card.id])}>Approve card</button>}
                {card.status !== "killed" && <button className="btn btn-danger btn-sm" disabled={!!busy} onClick={() => cards("kill", [card.id])}>Kill</button>}
              </div>
            </div>
            <ul className="mt-3 space-y-2">
              {list.map((p) => (
                <PieceRow key={p.id} p={p} showDay selectable={p.status === "draft" || p.status === "failed"} selected={sel.has(p.id)} onSelect={(on) => sel.set(p.id, on)} />
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CardsTab({ cards, reload }: { cards: CardSummary[]; reload: () => Promise<void> }) {
  const { busy, run } = useAction();
  const sel = useSelection();
  const act = (action: "approve" | "kill" | "rerun") => run(action, () => api<{ changed?: number; pieces?: number }>("/api/studio/cards", { body: { action, ids: [...sel.sel] } }).then(async (r) => (await reload(), sel.clear(), r)), (r) => (action === "rerun" ? `${r.pieces ?? 0} pieces rewritten` : `${r.changed ?? 0} changed`));
  if (!cards.length) return <Empty>No cards match.</Empty>;
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
        <label className="flex items-center gap-2"><input type="checkbox" className="accent-[#b5512c]" checked={sel.sel.size === cards.length} onChange={(e) => sel.all(cards.map((c) => c.id), e.target.checked)} />All</label>
        {sel.sel.size > 0 && (
          <>
            <button className="btn btn-primary btn-sm" disabled={!!busy} onClick={() => act("approve")}>Approve {sel.sel.size}</button>
            <button className="btn btn-danger btn-sm" disabled={!!busy} onClick={() => act("kill")}>Kill</button>
            <button className="btn btn-sm" disabled={!!busy || sel.sel.size > 10} title="Up to ten at a time" onClick={() => act("rerun")}>Re-run writers</button>
          </>
        )}
      </div>
      <div className="overflow-x-auto rounded-2xl border border-line bg-card">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="text-left text-xs uppercase tracking-wider text-ink-3">
            <tr className="border-b border-line">
              <th className="w-8 p-2" />
              <th className="p-2">Week</th>
              <th className="p-2">Hook</th>
              <th className="p-2">Pillar</th>
              <th className="p-2">Lang</th>
              <th className="p-2">Status</th>
              <th className="p-2">Pieces</th>
              <th className="p-2 text-right">Views</th>
              <th className="p-2 text-right">Engaged</th>
            </tr>
          </thead>
          <tbody>
            {cards.map((c) => (
              <tr key={c.id} className="border-b border-line/60 last:border-0 hover:bg-white">
                <td className="p-2"><input type="checkbox" className="accent-[#b5512c]" checked={sel.has(c.id)} onChange={(e) => sel.set(c.id, e.target.checked)} aria-label="Select" /></td>
                <td className="whitespace-nowrap p-2 text-ink-3">{c.week}</td>
                <td className="p-2"><Link href={`/studio/library/cards/${c.id}`} className="hover:underline">{c.hook}</Link>{c.parent && <span className="ml-1 text-xs text-ink-3">(variant)</span>}</td>
                <td className="p-2 text-ink-2">{PILLAR[c.pillar]}</td>
                <td className="p-2 uppercase text-ink-2">{c.language}</td>
                <td className="p-2"><Status value={c.status} /></td>
                <td className="p-2 text-xs text-ink-2">{Object.entries(c.pieces).map(([k, n]) => `${n} ${k}`).join(", ") || "—"}</td>
                <td className="p-2 text-right tabular-nums">{c.views || "—"}</td>
                <td className="p-2 text-right tabular-nums">{c.engagements || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PiecesTab({ pieces, reload }: { pieces: PieceLine[]; reload: () => Promise<void> }) {
  const { busy, run } = useAction();
  const sel = useSelection();
  const [at, setAt] = useState("");
  const act = (action: string, extra: Record<string, unknown> = {}) => run(action, () => api<{ changed: number; skipped: { why: string }[] }>("/api/studio/pieces", { body: { action, ids: [...sel.sel], ...extra } }).then(async (r) => (await reload(), sel.clear(), r)), (r) => `${r.changed} changed${r.skipped.length ? `; ${r.skipped.length} skipped: ${r.skipped[0]!.why}` : ""}`);
  if (!pieces.length) return <Empty>No pieces match.</Empty>;
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
        <label className="flex items-center gap-2"><input type="checkbox" className="accent-[#b5512c]" checked={sel.sel.size === pieces.length} onChange={(e) => sel.all(pieces.map((p) => p.id), e.target.checked)} />All {pieces.length}</label>
        {sel.sel.size > 0 && (
          <>
            <button className="btn btn-primary btn-sm" disabled={!!busy} onClick={() => act("approve")}>Approve</button>
            <button className="btn btn-sm" disabled={!!busy} onClick={() => act("rerender")}>Re-render</button>
            <button className="btn btn-danger btn-sm" disabled={!!busy} onClick={() => act("kill")}>Kill</button>
            <input type="datetime-local" className="field w-56" value={at} onChange={(e) => setAt(e.target.value)} aria-label="New time" />
            <button className="btn btn-sm" disabled={!at || !!busy} onClick={() => act("reschedule", { at: new Date(at).toISOString() })}>Re-schedule</button>
          </>
        )}
      </div>
      <ul className="space-y-2">
        {pieces.map((p) => (
          <PieceRow key={p.id} p={p} showDay selectable selected={sel.has(p.id)} onSelect={(on) => sel.set(p.id, on)} />
        ))}
      </ul>
    </div>
  );
}

interface MediaItem { id: string; kind: string; path: string; bytes: number; durationMs: number | null; width: number | null; height: number | null; pieceId: string | null; platform: string | null; format: string | null; status: string | null; createdAt: string }

function MediaTab({ media }: { media: MediaItem[] }) {
  // A video shows its rendered thumbnail until it plays: phones often don't preload a frame.
  const thumbs = new Map(media.filter((m) => m.kind === "thumbnail" && m.pieceId).map((m) => [m.pieceId, m.id]));
  const shown = media.filter((m) => m.kind === "video" || m.kind === "image");
  if (!shown.length) return <Empty>No rendered media for this filter yet.</Empty>;
  return (
    <ul className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-5">
      {shown.map((m) => (
        <li key={m.id} className="panel overflow-hidden">
          <div className="aspect-[9/16] bg-ink/5">
            {m.kind === "video" ? <video src={`/api/studio/media/${m.id}`} poster={thumbs.has(m.pieceId) ? `/api/studio/media/${thumbs.get(m.pieceId)}` : undefined} className="h-full w-full object-cover" muted playsInline preload="metadata" controls /> : (
              // Signed, short-lived Storage addresses: next/image would proxy and cache what must stay private.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`/api/studio/media/${m.id}`} alt="" loading="lazy" className="h-full w-full object-cover" />
            )}
          </div>
          <div className="p-2 text-xs">
            <div className="flex items-center justify-between gap-1">
              <span className="truncate font-medium">{m.platform ?? "—"} · {m.format ?? m.kind}</span>
              {m.status && <Status value={m.status} />}
            </div>
            <div className="mt-1 text-ink-3">{m.width}×{m.height}{m.durationMs ? ` · ${(m.durationMs / 1000).toFixed(0)} s` : ""} · {(m.bytes / 1_000_000).toFixed(1)} MB</div>
            <div className="mt-2 flex gap-1">
              <a className="btn btn-sm" href={`/api/studio/media/${m.id}?download=1`}>Download</a>
              {m.pieceId && <Link className="btn btn-quiet btn-sm" href={`/studio/library/pieces/${m.pieceId}`}>Piece</Link>}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

function ScorecardsTab({ rows }: { rows: ScorecardRow[] }) {
  const [open, setOpen] = useState<string | null>(rows[0]?.week ?? null);
  if (!rows.length) return <Empty>The analyst writes the first scorecard on Friday at 07:00.</Empty>;
  return (
    <div>
      <div className="mb-3 flex justify-end"><a className="btn btn-sm" href="/api/studio/export?what=scorecards">Export CSV</a></div>
      <ul className="space-y-3">
        {rows.map((s) => {
          const figures = s.figures as { rows?: { measure: string; value: string; target: string | null; where: string }[] };
          return (
            <li key={s.week} className="panel p-4">
              <button className="flex w-full items-center justify-between text-left" onClick={() => setOpen(open === s.week ? null : s.week)}>
                <span className="font-serif text-xl">{s.week}</span>
                <span className="text-sm text-ink-3">{money(s.cost_usd)} · {open === s.week ? "Hide" : "Open"}</span>
              </button>
              {open === s.week && (
                <div className="mt-3 grid gap-4 md:grid-cols-2">
                  <div>
                    <p className="eyebrow mb-2">The numbers</p>
                    <table className="w-full text-sm">
                      <tbody>
                        {(figures.rows ?? []).map((r) => (
                          <tr key={r.measure} className="border-b border-line/60 last:border-0">
                            <td className="py-1 pr-2 text-ink-2">{r.measure}</td>
                            <td className="py-1 pr-2 text-right font-medium tabular-nums">{r.value}</td>
                            <td className="py-1 text-right text-xs text-ink-3">{r.target ?? ""}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div>
                    <p className="eyebrow mb-2">For you</p>
                    <ul className="list-disc space-y-1 pl-5 text-sm">{(s.for_owner as string[]).map((l, i) => <li key={i}>{l}</li>)}</ul>
                    <p className="eyebrow mb-2 mt-4">Keep or kill</p>
                    <ul className="space-y-1 text-sm">
                      {(s.verdicts as { rule: string; triggered: boolean; number: string; action: string }[]).map((v, i) => (
                        <li key={i} className={v.triggered ? "text-rust" : "text-ink-2"}>{v.rule}: {v.number} → {v.action}</li>
                      ))}
                    </ul>
                    <p className="eyebrow mb-2 mt-4">Ideas for next week</p>
                    <ul className="list-disc space-y-1 pl-5 text-sm text-ink-2">{(s.suggestions as { idea: string; reason: string }[]).slice(0, 10).map((x, i) => <li key={i}>{x.idea} <span className="text-ink-3">— {x.reason}</span></li>)}</ul>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function RunsTab({ runs }: { runs: RunRow[] }) {
  const total = useMemo(() => runs.reduce((n, r) => n + r.cost_usd, 0), [runs]);
  if (!runs.length) return <Empty>No runs in this window.</Empty>;
  return (
    <div>
      <p className="mb-2 text-sm text-ink-2">{runs.length} runs · {money(total)}</p>
      <div className="overflow-x-auto rounded-2xl border border-line bg-card">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="text-left text-xs uppercase tracking-wider text-ink-3">
            <tr className="border-b border-line">
              <th className="p-2">Agent</th>
              <th className="p-2">Started</th>
              <th className="p-2">Outcome</th>
              <th className="p-2 text-right">Tokens in / out</th>
              <th className="p-2 text-right">Cost</th>
              <th className="p-2">Note</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((r) => (
              <tr key={r.id} className="border-b border-line/60 align-top last:border-0">
                <td className="p-2 font-medium">{r.agent}<div className="text-xs font-normal text-ink-3">{r.trigger}{r.model ? ` · ${r.model}` : ""}</div></td>
                <td className="whitespace-nowrap p-2 text-ink-2">{paris(r.started_at)}<div className="text-xs text-ink-3">{ago(r.started_at)}</div></td>
                <td className="p-2"><Status value={r.outcome} /></td>
                <td className="p-2 text-right tabular-nums text-ink-2">{r.input_tokens.toLocaleString()} / {r.output_tokens.toLocaleString()}</td>
                <td className="p-2 text-right tabular-nums">{money(r.cost_usd)}</td>
                <td className="max-w-xs p-2 text-xs text-ink-2">{r.error ?? ""}{r.log_url && <a href={r.log_url} target="_blank" rel="noreferrer" className="ml-1 text-accent hover:underline">log ↗</a>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
