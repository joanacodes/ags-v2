"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, useApi } from "@/components/studio/api";
import { History, MediaPreview, MetricsChart } from "@/components/studio/detail-bits";
import { CopyButton, ErrorNote, Loading, Section, Status, useAction } from "@/components/studio/ui";
import type { CardDetail } from "@/studio/views/detail";

export function CardPage({ id }: { id: string }) {
  const router = useRouter();
  const { data, error, loading, reload } = useApi<CardDetail>(`/api/studio/cards/${id}`);
  const { busy, run } = useAction();
  const [editing, setEditing] = useState(false);
  const [hook, setHook] = useState("");
  const [idea, setIdea] = useState("");
  if (loading && !data) return <Loading />;
  if (error && !data) return <ErrorNote error={error} retry={reload} />;
  if (!data) return null;
  const c = data.card;
  const act = (action: "approve" | "kill" | "rerun") => run(action, () => api<{ changed?: number; pieces?: number }>("/api/studio/cards", { body: { action, ids: [c.id] } }).then(async (r) => (await reload(), r)), (r) => (action === "rerun" ? `${r.pieces ?? 0} pieces rewritten` : "Done"));
  return (
    <div>
      <nav className="mb-3 text-sm text-ink-3"><Link href={`/studio/library?tab=week&week=${c.week}`} className="hover:underline">Library · {c.week}</Link></nav>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 max-w-3xl">
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-ink-3">
            <span className="chip">{c.pillar}</span>
            <span className="chip">{c.language === "both" ? "EN + FR" : c.language.toUpperCase()}</span>
            <Status value={c.status} />
            <span>kit v{c.kit_version ?? 1} · prompt v{c.prompt_version ?? 1}</span>
          </div>
          {editing ? (
            <form className="mt-2 space-y-2" onSubmit={(e) => { e.preventDefault(); void run("edit", () => api(`/api/studio/cards/${c.id}`, { method: "PATCH", body: { hook, idea } }).then(async () => (await reload(), setEditing(false))), "Saved: re-run the writers to rewrite its pieces"); }}>
              <input className="field font-serif text-xl" value={hook} onChange={(e) => setHook(e.target.value)} />
              <textarea className="field min-h-[80px]" value={idea} onChange={(e) => setIdea(e.target.value)} />
              <div className="flex gap-2"><button className="btn btn-primary btn-sm" disabled={!!busy}>Save</button><button type="button" className="btn btn-quiet btn-sm" onClick={() => setEditing(false)}>Cancel</button></div>
            </form>
          ) : (
            <>
              <h1 className="mt-2 text-3xl">{c.hook}</h1>
              <p className="mt-2 text-ink-2">{c.idea}</p>
            </>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {c.status === "draft" && <button className="btn btn-primary btn-sm" disabled={!!busy} onClick={() => act("approve")}>Approve</button>}
          <button className="btn btn-sm" disabled={!!busy} onClick={() => { setHook(c.hook); setIdea(c.idea); setEditing(true); }}>Edit</button>
          <button className="btn btn-sm" disabled={!!busy} onClick={() => confirm("Re-run the writers? Its unposted pieces are replaced.") && act("rerun")}>Re-run writers</button>
          <button className="btn btn-sm" disabled={!!busy} onClick={() => { const h = prompt("The variant's hook", c.hook); if (h) void run("variant", () => api<{ id: string | null }>(`/api/studio/cards/${c.id}`, { body: { action: "variant", hook: h, week: c.week } }).then((r) => r.id && router.push(`/studio/library/cards/${r.id}`)), "Variant made"); }}>Duplicate as variant</button>
          <button className="btn btn-sm" disabled={!!busy} onClick={() => run("remind", () => api("/api/studio/reminders", { body: { title: `Look at: ${c.hook.length > 80 ? `${c.hook.slice(0, 79)}…` : c.hook}`, due_at: new Date(Date.now() + 86400_000).toISOString(), linked_table: "studio_cards", linked_id: c.id, link: `/studio/library/cards/${c.id}` } }), "Reminder for tomorrow")}>Remind me</button>
          {c.status !== "killed" && <button className="btn btn-danger btn-sm" disabled={!!busy} onClick={() => confirm("Kill this card and its unposted pieces?") && act("kill")}>Kill</button>}
        </div>
      </div>
      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <div className="panel p-4 md:col-span-2">
          <p className="eyebrow mb-2">The points</p>
          <ul className="list-disc space-y-1 pl-5 text-sm">{c.points.map((p, i) => <li key={i}>{p}</li>)}</ul>
          <p className="eyebrow mb-2 mt-4">Figures</p>
          {c.figures.length === 0 ? <p className="text-sm text-ink-3">None: a figure without a source is not a figure.</p> : (
            <ul className="space-y-1 text-sm">{c.figures.map((f, i) => <li key={i}><span className="font-medium">{f.value}</span> {f.label} <span className="text-ink-3">— {f.source}{f.url ? <a href={f.url} target="_blank" rel="noreferrer" className="ml-1 text-accent">↗</a> : null}</span> {f.verified ? <Status value="ok" label="verified" /> : <Status value="failed" label="unverified" />}</li>)}</ul>
          )}
        </div>
        <div className="panel space-y-2 p-4 text-sm">
          <p><span className="eyebrow">Call to action</span><br />{c.cta}</p>
          <p><span className="eyebrow">Anchor</span><br />{c.anchor ?? "—"}</p>
          <p><span className="eyebrow">Sky date</span><br />{c.sky_date ?? "—"}</p>
          <p><span className="eyebrow">Formats</span><br />{c.formats.join(", ")}</p>
          {c.reason && <p><span className="eyebrow">Why it exists</span><br />{c.reason}</p>}
          {c.parent && <p><span className="eyebrow">Variant of</span><br /><Link className="text-accent hover:underline" href={`/studio/library/cards/${c.parent}`}>its parent</Link></p>}
          {data.variants.length > 0 && <p><span className="eyebrow">Variants</span><br />{data.variants.map((v) => <Link key={v.id} className="block text-accent hover:underline" href={`/studio/library/cards/${v.id}`}>{v.hook}</Link>)}</p>}
        </div>
      </div>
      <Section title="Pieces" count={data.pieces.length}>
        <ul className="space-y-3">
          {data.pieces.map((d) => (
            <li key={d.post.id} className="panel p-4">
              <div className="flex flex-wrap items-center gap-1.5 text-xs text-ink-3">
                <span className="font-medium text-ink-2">{d.line.platformLabel}</span> · {d.line.formatLabel} · {d.post.language.toUpperCase()}
                <Status value={d.post.status} label={d.line.dryRun ? "posted (dry run)" : undefined} />
                {d.line.gateOk === false && <Status value="failed" label="gate" />}
                <Link href={`/studio/library/pieces/${d.post.id}`} className="ml-auto text-accent hover:underline">Open the piece</Link>
              </div>
              {d.line.gateFailures.length > 0 && <ul className="mt-2 list-disc pl-5 text-xs text-rust">{d.line.gateFailures.map((f) => <li key={f}>{f}</li>)}</ul>}
              <div className="mt-2 grid gap-3 md:grid-cols-[1fr_auto]">
                <p className="whitespace-pre-line text-sm">{d.post.title ? <strong className="block">{d.post.title}</strong> : null}{d.post.script ?? d.post.caption ?? d.post.description ?? ""}</p>
                {(d.post.caption ?? d.post.description) && <CopyButton text={d.post.caption ?? d.post.description ?? ""} label="Copy caption" />}
              </div>
              <div className="mt-3"><MediaPreview media={d.media} /></div>
              {d.metrics.length > 0 && <div className="mt-3"><MetricsChart rows={d.metrics} /></div>}
            </li>
          ))}
        </ul>
      </Section>
      <Section title="History"><History events={data.history} /></Section>
    </div>
  );
}
