"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api, useApi } from "@/components/studio/api";
import { History, MediaPreview, MetricsChart } from "@/components/studio/detail-bits";
import { CopyButton, ErrorNote, Loading, paris, Section, Status, useAction } from "@/components/studio/ui";
import type { PieceDetail } from "@/studio/views/detail";

interface Draft { script: string; lines: string; caption: string; title: string; description: string; tags: string; slides: string }

const toDraft = (d: PieceDetail): Draft => ({
  script: d.post.script ?? "",
  lines: (d.post.lines ?? []).join("\n"),
  caption: d.post.caption ?? "",
  title: d.post.title ?? "",
  description: d.post.description ?? "",
  tags: d.post.tags.join(" "),
  slides: (d.post.slides ?? []).map((s) => `${s.heading} | ${s.body}`).join("\n"),
});

export function PiecePage({ id }: { id: string }) {
  const { data, error, loading, reload } = useApi<PieceDetail>(`/api/studio/pieces/${id}`);
  const { busy, run } = useAction();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [instruction, setInstruction] = useState("");
  const [at, setAt] = useState("");
  const [url, setUrl] = useState("");
  useEffect(() => {
    if (data) setDraft(toDraft(data));
  }, [data]);
  if (loading && !data) return <Loading />;
  if (error && !data) return <ErrorNote error={error} retry={reload} />;
  if (!data || !draft) return null;
  const p = data.post;
  const posted = p.status === "posted";
  const act = (action: string, extra: Record<string, unknown> = {}) => run(action, () => api<{ changed: number; skipped: { why: string }[] }>("/api/studio/pieces", { body: { action, ids: [p.id], ...extra } }).then(async (r) => (await reload(), r)), (r) => (r.changed ? "Done" : `Not changed: ${r.skipped[0]?.why ?? ""}`));
  const save = () => {
    const body: Record<string, unknown> = {};
    const orig = toDraft(data);
    if (draft.script !== orig.script) body["script"] = draft.script || null;
    if (draft.lines !== orig.lines) body["lines"] = draft.lines.split("\n").map((l) => l.trim()).filter(Boolean);
    if (draft.caption !== orig.caption) body["caption"] = draft.caption || null;
    if (draft.title !== orig.title) body["title"] = draft.title || null;
    if (draft.description !== orig.description) body["description"] = draft.description || null;
    if (draft.tags !== orig.tags) body["tags"] = draft.tags.split(/\s+/).filter(Boolean);
    if (draft.slides !== orig.slides) body["slides"] = draft.slides.split("\n").filter(Boolean).map((l) => { const [heading, ...rest] = l.split("|"); return { heading: (heading ?? "").trim(), body: rest.join("|").trim() }; });
    return run("save", () => api<{ gateOk: boolean; failures: string[] }>(`/api/studio/pieces/${p.id}`, { method: "PATCH", body }).then(async (r) => (await reload(), r)), (r) => (r.gateOk ? "Saved: it passes the gate" : `Saved, but it fails the gate: ${r.failures[0]}`));
  };
  const field = (key: keyof Draft, label: string, rows = 3, show = true) =>
    show && (
      <label className="block text-sm">
        <span className="label">{label}</span>
        <textarea className="field" rows={rows} value={draft[key]} disabled={posted} onChange={(e) => setDraft({ ...draft, [key]: e.target.value })} />
      </label>
    );
  const isVideo = p.format === "video" || p.format === "long_video";
  return (
    <div>
      <nav className="mb-3 truncate text-sm text-ink-3">
        {data.card ? <Link href={`/studio/library/cards/${data.card.id}`} className="hover:underline">Card · {data.card.hook}</Link> : "Library"}
      </nav>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-ink-3">
            <Status value={p.status} label={data.line.dryRun ? "posted (dry run)" : undefined} />
            {data.line.byHand && <span className="chip">by hand</span>}
            <span>{paris(p.scheduled_at)}</span>
            {p.approved_at && <span>· approved {paris(p.approved_at)}</span>}
            {p.confirmed_at && <span>· confirmed</span>}
          </div>
          <h1 className="mt-1 text-3xl">{data.line.platformLabel} · {data.line.formatLabel} <span className="text-ink-3">{p.language.toUpperCase()}</span></h1>
          {p.error && <p className="mt-2 text-sm text-rust">{p.error}</p>}
          {p.platform_url && <a href={p.platform_url} target="_blank" rel="noreferrer" className="mt-1 inline-block text-sm text-accent hover:underline">Open the post ↗</a>}
        </div>
        <div className="flex flex-wrap gap-2">
          {(p.status === "draft" || p.status === "failed") && <button className="btn btn-primary btn-sm" disabled={!!busy} onClick={() => act("approve")}>Approve</button>}
          {(p.status === "approved" || p.status === "rendered") && !p.confirmed_at && <button className="btn btn-primary btn-sm" disabled={!!busy} onClick={() => act("confirm")}>Confirm</button>}
          {(p.status === "approved" || p.status === "rendered") && !data.line.byHand && <button className="btn btn-sm" disabled={!!busy} onClick={() => confirm("Post it now? Every check still applies (approval, gate, connection, dry run).") && run("now", () => api(`/api/studio/pieces/${p.id}`, { body: { action: "post-now" } }).then(reload), "Dispatched to the outbox")}>Post now</button>}
          {data.media.length > 0 && !posted && <button className="btn btn-sm" disabled={!!busy} onClick={() => act("rerender")}>Re-render</button>}
          {isVideo && <Link className="btn btn-sm" href={`/studio/video?piece=${p.id}`}>Open in Video studio</Link>}
          {!posted && p.status !== "killed" && <button className="btn btn-danger btn-sm" disabled={!!busy} onClick={() => confirm("Kill this piece?") && act("kill")}>Kill</button>}
        </div>
      </div>
      {data.line.gateFailures.length > 0 && (
        <div className="mt-4 rounded-2xl bg-rust-soft p-3 text-sm text-rust">
          <p className="font-medium">The gate stops it:</p>
          <ul className="list-disc pl-5">{data.line.gateFailures.map((f) => <li key={f}>{f}</li>)}</ul>
        </div>
      )}
      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-3">
          {field("title", "Title", 2, p.title !== null || ["youtube", "pinterest", "substack", "medium", "site"].includes(p.platform))}
          {field("script", "Script (what the voice says)", 5, isVideo)}
          {field("lines", "On-screen lines, one per line", 6, isVideo)}
          {field("caption", "Caption", 6)}
          {field("description", "Description", 5, p.description !== null || p.platform === "youtube" || p.platform === "pinterest")}
          {field("slides", "Slides: heading | body, one per line", 7, p.format === "carousel")}
          {field("tags", "Tags", 1)}
          {!posted && (
            <div className="flex flex-wrap gap-2">
              <button className="btn btn-primary" disabled={!!busy} onClick={save}>Save and check</button>
              {(draft.caption || draft.description) && <CopyButton text={draft.caption || draft.description} label="Copy caption" />}
            </div>
          )}
          {!posted && (
            <form className="panel space-y-2 p-3" onSubmit={(e) => { e.preventDefault(); void run("rewrite", () => api<{ ok: boolean; message: string }>(`/api/studio/pieces/${p.id}`, { body: { action: "rewrite", instruction } }).then(async (r) => { await reload(); if (!r.ok) throw new Error(r.message); setInstruction(""); return r; }), (r) => r.message || "Rewritten"); }}>
              <p className="text-sm font-medium">Rewrite with the writer</p>
              <textarea className="field" rows={2} placeholder="What to change: shorter, warmer, lead with the figure…" value={instruction} onChange={(e) => setInstruction(e.target.value)} />
              <button className="btn btn-sm" disabled={instruction.trim().length < 3 || !!busy}>{busy === "rewrite" ? "Rewriting…" : "Rewrite"}</button>
            </form>
          )}
        </div>
        <aside className="space-y-4">
          <MediaPreview media={data.media} />
          {!posted && p.status !== "killed" && (
            <div className="panel space-y-2 p-3">
              <p className="text-sm font-medium">Re-schedule</p>
              <input type="datetime-local" className="field" value={at} onChange={(e) => setAt(e.target.value)} />
              <button className="btn btn-sm" disabled={!at || !!busy} onClick={() => act("reschedule", { at: new Date(at).toISOString() })}>Move it</button>
            </div>
          )}
          {data.line.byHand && !posted && (
            <form className="panel space-y-2 p-3" onSubmit={(e) => { e.preventDefault(); void run("posted", () => api(`/api/studio/pieces/${p.id}`, { body: { action: "posted", url } }).then(reload), "Marked as posted"); }}>
              <p className="text-sm font-medium">Posted it by hand?</p>
              <input className="field" placeholder="The post's address" value={url} onChange={(e) => setUrl(e.target.value)} inputMode="url" />
              <button className="btn btn-primary btn-sm" disabled={!url || !!busy}>Mark as posted</button>
            </form>
          )}
        </aside>
      </div>
      <Section title="Numbers"><MetricsChart rows={data.metrics} /></Section>
      <Section title="History"><History events={data.history} /></Section>
    </div>
  );
}
