"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/components/studio/api";
import { Empty, paris, useAction } from "@/components/studio/ui";
import type { CalendarRow, SkyRow } from "@/studio/store/rows";

interface TemplateItem { id: string; kind: string; label: string; blurb?: string; formats?: string[]; width?: number; height?: number; saved: boolean; base?: string; isDefault: boolean; file?: string }

export function TemplatesTab({ rows }: { rows: unknown[] }) {
  const items = rows as TemplateItem[];
  return (
    <ul className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
      {items.map((t) => (
        <li key={t.id} className="panel flex flex-col p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="font-serif text-lg">{t.label}</p>
            <span className="chip">{t.saved ? "preset" : t.kind}</span>
          </div>
          {t.blurb && <p className="mt-1 text-sm text-ink-2">{t.blurb}</p>}
          <p className="mt-2 text-xs text-ink-3">{t.width ? `${t.width}×${t.height}` : ""}{t.formats?.length ? ` · ${t.formats.join(", ")}` : ""}{t.base ? `from ${t.base}` : ""}</p>
          <div className="mt-auto flex gap-2 pt-3">
            {t.kind === "video" || t.saved ? <Link className="btn btn-sm" href={`/studio/video?template=${t.saved ? t.base : t.id}${t.saved ? `&preset=${t.id}` : ""}`}>Open in Video studio</Link> : <span className="text-xs text-ink-3">Pictures render from each piece&apos;s page</span>}
          </div>
        </li>
      ))}
    </ul>
  );
}

interface HookItem { id: string; text: string; pillar: string; language: string; retired: boolean; uses: number; best: number | null; median: number | null; lastUsed: string | null; source: string }

export function HooksTab({ rows, reload }: { rows: unknown[]; reload: () => Promise<void> }) {
  const hooks = rows as HookItem[];
  const router = useRouter();
  const { busy, run } = useAction();
  const [edit, setEdit] = useState<{ id: string; text: string } | null>(null);
  const [add, setAdd] = useState({ text: "", pillar: "test", language: "en" });
  return (
    <div>
      <form
        className="panel mb-4 flex flex-wrap items-end gap-2 p-3"
        onSubmit={(e) => {
          e.preventDefault();
          void run("add", () => api("/api/studio/hooks", { body: { action: "add", ...add } }).then(async () => (await reload(), setAdd({ ...add, text: "" }))), "Added to the bank");
        }}
      >
        <label className="min-w-[240px] flex-1 text-sm"><span className="label">A new hook</span><input className="field" value={add.text} onChange={(e) => setAdd({ ...add, text: e.target.value })} /></label>
        <select className="field w-36" value={add.pillar} onChange={(e) => setAdd({ ...add, pillar: e.target.value })} aria-label="Pillar">{["test", "placements", "tested", "sky"].map((p) => <option key={p}>{p}</option>)}</select>
        <select className="field w-20" value={add.language} onChange={(e) => setAdd({ ...add, language: e.target.value })} aria-label="Language"><option>en</option><option>fr</option></select>
        <button className="btn btn-primary" disabled={add.text.trim().length < 3 || !!busy}>Add</button>
      </form>
      {!hooks.length ? (
        <Empty>No hooks match.</Empty>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-line bg-card">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="text-left text-xs uppercase tracking-wider text-ink-3">
              <tr className="border-b border-line"><th className="p-2">Hook</th><th className="p-2">Pillar</th><th className="p-2">Lang</th><th className="p-2 text-right">Used</th><th className="p-2 text-right">Best</th><th className="p-2 text-right">Median</th><th className="p-2">Last</th><th className="p-2" /></tr>
            </thead>
            <tbody>
              {hooks.map((h) => (
                <tr key={h.id} className={`border-b border-line/60 last:border-0 ${h.retired ? "opacity-50" : ""}`}>
                  <td className="p-2">
                    {edit?.id === h.id ? (
                      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void run("edit", () => api("/api/studio/hooks", { method: "PATCH", body: { id: h.id, text: edit.text } }).then(async () => (await reload(), setEdit(null))), "Saved"); }}>
                        <input className="field" value={edit.text} onChange={(e) => setEdit({ id: h.id, text: e.target.value })} autoFocus />
                        <button className="btn btn-primary btn-sm">Save</button>
                      </form>
                    ) : (
                      h.text
                    )}
                  </td>
                  <td className="p-2 text-ink-2">{h.pillar}</td>
                  <td className="p-2 uppercase text-ink-2">{h.language}</td>
                  <td className="p-2 text-right tabular-nums">{h.uses}</td>
                  <td className="p-2 text-right tabular-nums">{h.best ?? "—"}</td>
                  <td className="p-2 text-right tabular-nums">{h.median ?? "—"}</td>
                  <td className="p-2 text-ink-3">{h.lastUsed ?? "—"}</td>
                  <td className="whitespace-nowrap p-2 text-right">
                    <button className="btn btn-quiet btn-sm" onClick={() => setEdit({ id: h.id, text: h.text })}>Edit</button>
                    <button className="btn btn-quiet btn-sm" disabled={!!busy} onClick={() => run("retire", () => api("/api/studio/hooks", { method: "PATCH", body: { id: h.id, retired: !h.retired } }).then(reload), h.retired ? "Back in the bank" : "Retired")}>{h.retired ? "Restore" : "Retire"}</button>
                    <button className="btn btn-sm" disabled={!!busy} onClick={() => run("card", () => api<{ id: string | null }>("/api/studio/hooks", { body: { action: "card", id: h.id } }).then((r) => r.id && router.push(`/studio/library/cards/${r.id}`)), "A draft card for next week")}>Make a card</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

interface PromptItem { agent: string; version: number; note: string | null; createdAt: string; createdBy: string; length: number }

export function PromptsTab({ rows }: { rows: unknown[] }) {
  const items = rows as PromptItem[];
  const agents = ["strategist", "writer-en", "writer-fr", "community-classify", "community-draft", "analyst"];
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {agents.map((a) => {
        const mine = items.filter((p) => p.agent === a);
        return (
          <div key={a} className="panel p-4">
            <div className="flex items-center justify-between">
              <p className="font-serif text-lg">{a}</p>
              <Link className="btn btn-sm" href={`/studio/settings?section=prompts&agent=${a}`}>Edit, compare, test</Link>
            </div>
            <ul className="mt-2 space-y-1 text-sm">
              {mine.map((p) => (
                <li key={p.version} className="flex justify-between gap-2"><span>v{p.version}{p.note ? ` · ${p.note}` : ""}</span><span className="text-ink-3">{paris(p.createdAt, "date")} · {p.createdBy}</span></li>
              ))}
              <li className="flex justify-between gap-2 text-ink-3"><span>v1 · the repository&apos;s</span><span>builder</span></li>
            </ul>
          </div>
        );
      })}
    </div>
  );
}

export function SkyTab({ data, reload }: { data: { month: string; sky: SkyRow[]; calendar: CalendarRow[] }; reload: () => Promise<void> }) {
  const router = useRouter();
  const { busy, run } = useAction();
  const [cal, setCal] = useState({ date: "", event: "", note: "" });
  const [ics, setIcs] = useState("");
  const move = (n: number) => {
    const [y, m] = data.month.split("-").map(Number);
    const d = new Date(Date.UTC(y!, m! - 1 + n, 1));
    router.replace(`/studio/library?tab=sky&month=${d.toISOString().slice(0, 7)}`, { scroll: false });
  };
  const remind = (title: string, dueDate: string, table: string, id: string) =>
    run("remind", () => api("/api/studio/reminders", { body: { title, due_at: new Date(`${dueDate}T08:00:00`).toISOString(), linked_table: table, linked_id: id, link: "/studio/library?tab=sky" } }), "Reminder set for that morning");
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div>
        <div className="mb-3 flex items-center gap-2">
          <button className="btn btn-sm" onClick={() => move(-1)}>←</button>
          <p className="font-serif text-xl">{new Date(`${data.month}-01T12:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric" })}</p>
          <button className="btn btn-sm" onClick={() => move(1)}>→</button>
        </div>
        <p className="eyebrow mb-2">The sky (Paris time)</p>
        {!data.sky.length ? (
          <Empty>No events this month yet: the sky worker fills 120 days ahead.</Empty>
        ) : (
          <ul className="space-y-2">
            {data.sky.map((s) => (
              <li key={s.id} className="panel p-3 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">{s.event}</p>
                    <p className="text-xs text-ink-3">{s.date}{s.time_paris ? ` · ${s.time_paris.slice(0, 5)}` : ""} · {s.kind}</p>
                    <p className="mt-1 text-xs text-ink-2">1: {s.source1 ?? "—"}<br />2: {s.source2 ?? <span className="text-[#8a5a12]">no second source yet</span>}</p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button className="btn btn-quiet btn-sm" disabled={!!busy} onClick={() => remind(s.event, s.date, "studio_sky", s.id)}>Remind me</button>
                    <button className="btn btn-quiet btn-sm" disabled={!!busy} onClick={() => confirm("Delete this sky event?") && run("del", () => api(`/api/studio/sky?id=${s.id}`, { method: "DELETE" }).then(reload), "Deleted")}>Delete</button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div>
        <p className="eyebrow mb-2 mt-12">The calendar</p>
        {!data.calendar.length ? <Empty>No dates this month.</Empty> : (
          <ul className="space-y-2">
            {data.calendar.map((c) => (
              <li key={c.id} className="panel flex items-start justify-between gap-2 p-3 text-sm">
                <div>
                  <p className="font-medium">{c.event}</p>
                  <p className="text-xs text-ink-3">{c.date} · {c.source}{c.remind ? " · reminded" : ""}</p>
                  {c.note && <p className="mt-1 text-xs text-ink-2">{c.note}</p>}
                </div>
                <button className="btn btn-quiet btn-sm" disabled={!!busy} onClick={() => run("del", () => api(`/api/studio/sky?kind=calendar&id=${c.id}`, { method: "DELETE" }).then(reload), "Deleted")}>Delete</button>
              </li>
            ))}
          </ul>
        )}
        <form className="panel mt-4 space-y-2 p-3" onSubmit={(e) => { e.preventDefault(); void run("cal", () => api("/api/studio/sky", { body: { action: "calendar", date: cal.date, event: cal.event, note: cal.note || null, remind: true } }).then(async () => (await reload(), setCal({ date: "", event: "", note: "" }))), "Added"); }}>
          <p className="text-sm font-medium">Add a date</p>
          <div className="flex gap-2"><input type="date" className="field w-44" value={cal.date} onChange={(e) => setCal({ ...cal, date: e.target.value })} required /><input className="field" placeholder="What happens" value={cal.event} onChange={(e) => setCal({ ...cal, event: e.target.value })} required /></div>
          <input className="field" placeholder="A note (what to do that day)" value={cal.note} onChange={(e) => setCal({ ...cal, note: e.target.value })} />
          <button className="btn btn-primary btn-sm" disabled={!!busy}>Add</button>
        </form>
        <form className="panel mt-4 space-y-2 p-3" onSubmit={(e) => { e.preventDefault(); void run("ics", () => api<{ imported: number }>("/api/studio/sky", { body: { action: "import", ics } }).then(async (r) => (await reload(), setIcs(""), r)), (r) => `${r.imported} dates imported`); }}>
          <p className="text-sm font-medium">Import a calendar (.ics)</p>
          <input type="file" accept=".ics,text/calendar" className="text-sm" onChange={async (e) => setIcs((await e.target.files?.[0]?.text()) ?? "")} />
          <button className="btn btn-sm" disabled={ics.length < 20 || !!busy}>Import</button>
        </form>
      </div>
    </div>
  );
}

