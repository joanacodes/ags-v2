"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { api, ApiError, useApi } from "@/components/studio/api";
import { SettingsForm } from "@/components/studio/settings-form";
import { ago, CopyButton, Empty, ErrorNote, Loading, paris, Status, Toggle, useAction } from "@/components/studio/ui";
import type { EventRow, RunRow } from "@/studio/store/rows";

function useNode(id: string) {
  return useApi<{ settings: Record<string, unknown> | null; stored: Record<string, unknown> }>(`/api/studio/nodes/${id}`);
}

function NodeForm({ id, hide, title, note }: { id: string; hide?: string[]; title?: string; note?: string }) {
  const { data, error, reload } = useNode(id);
  const { busy, run } = useAction();
  if (error) return <ErrorNote error={error} retry={reload} />;
  if (!data?.settings) return <Loading />;
  return (
    <div className="panel p-4">
      {title && <p className="font-serif text-lg">{title}</p>}
      {note && <p className="mb-2 text-sm text-ink-2">{note}</p>}
      <SettingsForm key={JSON.stringify(data.settings)} values={data.settings} hide={hide} busy={busy === "save"} onSave={(changed) => run("save", async () => {
        try {
          await api(`/api/studio/nodes/${id}`, { method: "PUT", body: { settings: changed } });
        } catch (err) {
          throw err instanceof ApiError && err.problems.length ? new Error(err.problems.join("; ")) : err;
        }
        await reload();
      }, "Saved: the next run uses it")} />
    </div>
  );
}

interface Schedules {
  paused: boolean;
  lastTick: string | null;
  schedules: { node: string; field: string; label: string; cron: string; enabled: boolean; reading: string; next: string | null }[];
  platforms: { id: string; label: string; enabled: boolean; mode: string; slots: string[] | null; maxPerDay: number | null; kitSlots: string[] }[];
}

export function SchedulesSection() {
  const { data, error, loading, reload } = useApi<Schedules>("/api/studio/settings/schedules");
  const { busy, run } = useAction();
  const [crons, setCrons] = useState<Record<string, string>>({});
  const [slots, setSlots] = useState<Record<string, string>>({});
  if (loading && !data) return <Loading />;
  if (error && !data) return <ErrorNote error={error} retry={reload} />;
  if (!data) return null;
  const save = (node: string, settings: Record<string, unknown>) => run("save", async () => {
    try {
      await api(`/api/studio/nodes/${node}`, { method: "PUT", body: { settings } });
    } catch (err) {
      throw err instanceof ApiError && err.problems.length ? new Error(err.problems.join("; ")) : err;
    }
    await reload();
  }, "Saved");
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl">Schedules and slots</h2>
        <p className="mt-1 text-sm text-ink-2">Every schedule is in Paris time and read by the tick every 15 minutes, so a change here is obeyed at the next tick. To stop everything at once, use the <Link href="/studio/settings?section=kill" className="text-accent hover:underline">kill switch</Link>{data.paused ? " (it is on now)" : ""}.</p>
      </div>
      <div className="panel p-4">
        <p className="font-serif text-lg">The clock</p>
        <p className="mt-1 text-sm text-ink-2">
          Supabase calls the Studio every 15 minutes, and each call runs what is due. {data.lastTick ? `The last call was ${ago(data.lastTick)}.` : "It hasn't called yet."} Start it from the Studio&rsquo;s own address, not a preview: the clock calls the address it was started from, with a secret only it and Vault know.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button className="btn btn-primary btn-sm" disabled={!!busy} onClick={() => run("clock", () => api<{ url: string }>("/api/studio/control", { body: { action: "clock-start" } }).then(async (r) => (await reload(), r)), (r) => `The clock calls ${r.url} every 15 minutes`)}>
            {data.lastTick ? "Restart the clock" : "Start the clock"}
          </button>
          <button className="btn btn-sm" disabled={!!busy} onClick={() => confirm("Stop the clock? Nothing runs by itself until it is started again.") && run("clock", () => api("/api/studio/control", { body: { action: "clock-stop" } }).then(reload), "The clock is stopped")}>
            Stop the clock
          </button>
        </div>
      </div>
      <NodeForm id="global" title="The Studio" note="Confirm mode keeps a second tap on Today before each slot (weeks 1–2); direct posts what was approved on Sunday. The warm-up keeps one video a day and no replies pulled before its date." hide={["paused", "paused_reason", "owner_email"]} />
      <div className="overflow-x-auto rounded-2xl border border-line bg-card">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="text-left text-xs uppercase tracking-wider text-ink-3"><tr className="border-b border-line"><th className="p-2">Worker</th><th className="p-2">On</th><th className="p-2">Cron (Paris)</th><th className="p-2">Reads as</th><th className="p-2">Next</th><th className="p-2" /></tr></thead>
          <tbody>
            {data.schedules.map((s) => {
              const key = `${s.node}.${s.field}`;
              return (
                <tr key={key} className="border-b border-line/60 last:border-0">
                  <td className="p-2 font-medium">{s.label}</td>
                  <td className="p-2"><Toggle label="" checked={s.enabled} disabled={!!busy || s.node === "maintenance"} onChange={(v) => save(s.node, { enabled: v })} /></td>
                  <td className="p-2"><input className="field w-36 font-mono" value={crons[key] ?? s.cron} onChange={(e) => setCrons({ ...crons, [key]: e.target.value })} /></td>
                  <td className="p-2 text-ink-2">{s.reading}</td>
                  <td className="p-2 text-ink-3">{paris(s.next)}</td>
                  <td className="p-2">{crons[key] !== undefined && crons[key] !== s.cron && <button className="btn btn-primary btn-sm" disabled={!!busy} onClick={() => save(s.node, { [s.field]: crons[key] }).then(() => setCrons((c) => { const n = { ...c }; delete n[key]; return n; }))}>Save</button>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <NodeForm id="outbox" title="The outbox" note="The window it looks ahead, the retry after a failure, and the gap between two videos on one network." />
      <div>
        <h3 className="text-xl">Slots per platform</h3>
        <p className="mt-1 text-sm text-ink-2">Empty means the kit&apos;s slots. Times are Paris time, separated by commas.</p>
        <ul className="mt-3 space-y-2">
          {data.platforms.map((p) => (
            <li key={p.id} className="panel flex flex-wrap items-center gap-2 p-3 text-sm">
              <span className="w-24 font-medium">{p.label}</span>
              <span className="chip">{p.mode.replace("_", " ")}</span>
              <input className="field w-72" placeholder={p.kitSlots.join(", ") || "(none)"} value={slots[p.id] ?? (p.slots ?? []).join(", ")} onChange={(e) => setSlots({ ...slots, [p.id]: e.target.value })} aria-label={`${p.label} slots`} />
              {slots[p.id] !== undefined && <button className="btn btn-primary btn-sm" disabled={!!busy} onClick={() => save(`platform-${p.id}`, { slots: slots[p.id]!.trim() ? slots[p.id]!.split(",").map((x) => x.trim()).filter(Boolean) : null })}>Save</button>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** A line diff (longest common subsequence), enough to compare two prompt versions. */
function diff(a: string, b: string): { kind: "same" | "add" | "del"; text: string }[] {
  const x = a.split("\n");
  const y = b.split("\n");
  const m = x.length;
  const n = y.length;
  const lcs = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) for (let j = n - 1; j >= 0; j--) lcs[i]![j] = x[i] === y[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
  const out: { kind: "same" | "add" | "del"; text: string }[] = [];
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (x[i] === y[j]) (out.push({ kind: "same", text: x[i]! }), i++, j++);
    else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) out.push({ kind: "del", text: x[i++]! });
    else out.push({ kind: "add", text: y[j++]! });
  }
  while (i < m) out.push({ kind: "del", text: x[i++]! });
  while (j < n) out.push({ kind: "add", text: y[j++]! });
  return out;
}

const AGENTS = ["strategist", "writer-en", "writer-fr", "community-classify", "community-draft", "analyst"];

export function PromptsSection({ agent: initial }: { agent: string | null }) {
  const [agent, setAgent] = useState(initial && AGENTS.includes(initial) ? initial : "writer-en");
  const { data, error, loading, reload } = useApi<{ versions: { version: number; text: string; note: string | null; createdAt: string | null; createdBy: string }[] }>(`/api/studio/prompts?agent=${agent}`);
  const [text, setText] = useState("");
  const [against, setAgainst] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [cardId, setCardId] = useState("");
  const [result, setResult] = useState<{ pieces?: { platform: string; format: string; text: string; gateOk: boolean; failures: string[] }[]; costUsd?: number; tokens?: { input: number; output: number } } | null>(null);
  const { busy, run } = useAction();
  const latest = data?.versions[0];
  useEffect(() => {
    if (latest) setText(latest.text);
    setResult(null);
  }, [latest]);
  const compare = useMemo(() => (against !== null && data ? diff(data.versions.find((v) => v.version === against)?.text ?? "", text) : null), [against, data, text]);
  if (loading && !data) return <Loading />;
  if (error && !data) return <ErrorNote error={error} retry={reload} />;
  if (!data || !latest) return null;
  return (
    <div>
      <h2 className="text-2xl">Prompts</h2>
      <p className="mt-1 text-sm text-ink-2">Every save is a version; each run records the version it used. A writer&apos;s prompt can be tried on one card first: nothing is saved but the run&apos;s cost.</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <select className="field w-56" value={agent} onChange={(e) => setAgent(e.target.value)} aria-label="Agent">{AGENTS.map((a) => <option key={a}>{a}</option>)}</select>
        <select className="field w-72" value={against ?? ""} onChange={(e) => setAgainst(e.target.value ? Number(e.target.value) : null)} aria-label="Compare with">
          <option value="">Compare with a version…</option>
          {data.versions.map((v) => <option key={v.version} value={v.version}>v{v.version} · {v.note ?? ""} · {v.createdBy}</option>)}
        </select>
        <button className="btn btn-sm" onClick={() => setText(data.versions.find((v) => v.version === against)?.text ?? text)} disabled={against === null}>Restore that version</button>
      </div>
      <textarea className="field mt-3 min-h-[420px] font-mono text-xs leading-relaxed" spellCheck={false} value={text} onChange={(e) => setText(e.target.value)} aria-label="The prompt" />
      {compare && (
        <pre className="mt-3 max-h-72 overflow-auto rounded-xl bg-card p-3 text-xs">
          {compare.filter((d, i, all) => d.kind !== "same" || all[i - 1]?.kind !== "same" || all[i + 1]?.kind !== "same").map((d, i) => <div key={i} className={d.kind === "add" ? "bg-moss-soft text-moss" : d.kind === "del" ? "bg-rust-soft text-rust line-through" : "text-ink-3"}>{d.kind === "add" ? "+ " : d.kind === "del" ? "− " : "  "}{d.text || " "}</div>)}
        </pre>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <input className="field max-w-xs" placeholder="What changed" value={note} onChange={(e) => setNote(e.target.value)} />
        <button className="btn btn-primary" disabled={!!busy || text === latest.text || text.length < 50} onClick={() => run("save", () => api<{ version: number }>("/api/studio/prompts", { body: { action: "save", agent, text, note: note || null } }).then(async (r) => (setNote(""), await reload(), r)), (r) => `Saved as version ${r.version}`)}>Save a new version</button>
      </div>
      {(agent === "writer-en" || agent === "writer-fr") && (
        <div className="panel mt-6 space-y-2 p-4">
          <p className="font-medium">Test on one card</p>
          <div className="flex flex-wrap gap-2">
            <input className="field w-80" placeholder="A card's id (from its page's address)" value={cardId} onChange={(e) => setCardId(e.target.value)} />
            <button className="btn" disabled={!cardId || !!busy} onClick={() => run("test", () => api<typeof result>("/api/studio/prompts", { body: { action: "test", agent, text, cardId: cardId.trim() } }).then((r) => (setResult(r), r)), "Tested: nothing was saved")}>{busy === "test" ? "Writing…" : "Run once, dry"}</button>
          </div>
          {result?.pieces && (
            <div className="space-y-2">
              <p className="text-xs text-ink-3">${(result.costUsd ?? 0).toFixed(3)} · {result.tokens?.input ?? 0} tokens in, {result.tokens?.output ?? 0} out</p>
              {result.pieces.map((p, i) => (
                <div key={i} className="rounded-xl bg-white p-3 text-sm">
                  <p className="text-xs text-ink-3">{p.platform} · {p.format} {p.gateOk ? <Status value="ok" label="passes" /> : <Status value="failed" label="gate" />}</p>
                  <p className="mt-1 whitespace-pre-line">{p.text}</p>
                  {p.failures.length > 0 && <ul className="mt-1 list-disc pl-5 text-xs text-rust">{p.failures.map((f) => <li key={f}>{f}</li>)}</ul>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function RemindersSection() {
  const feed = useApi<{ url: string | null }>("/api/studio/feed");
  const { busy, run } = useAction();
  return (
    <div className="space-y-4">
      <h2 className="text-2xl">Reminders</h2>
      <div className="panel p-4">
        <p className="font-medium">Your phone&apos;s calendar</p>
        <p className="mt-1 text-sm text-ink-2">Subscribe to this address in your calendar app (iPhone: Settings → Calendar → Accounts → Add a subscribed calendar). Anyone with the address sees the reminders, so a new address cuts the old one off.</p>
        {feed.data?.url ? <div className="mt-2 flex flex-wrap items-center gap-2"><code className="max-w-full truncate rounded-lg bg-white px-2 py-1 text-xs">{feed.data.url}</code><CopyButton text={feed.data.url} /></div> : <p className="mt-2 text-sm text-ink-3">No address yet.</p>}
        <button className="btn btn-sm mt-2" disabled={!!busy} onClick={() => run("feed", () => api("/api/studio/feed", { method: "POST" }).then(feed.reload), "A new address: the old one stops working")}>{feed.data?.url ? "Make a new address" : "Make the address"}</button>
      </div>
      <NodeForm id="reminders" title="Kinds, channels and quiet hours" note="Between the quiet hours only urgent reminders go out (a cap, a flagged reply); the rest wait for the morning." hide={["feed_token", "email"]} />
    </div>
  );
}

export function NotificationsSection() {
  return (
    <div className="space-y-4">
      <h2 className="text-2xl">Notifications</h2>
      <p className="text-sm text-ink-2">Email goes through Resend from the address in STUDIO_EMAIL_FROM. Push notifications are not built: the calendar feed and email cover the phone.</p>
      <NodeForm id="reminders" title="Where the Studio writes to you" hide={["quiet_start", "quiet_end", "kinds", "feed_token"]} />
      <NodeForm id="global" title="The owner's address (a fallback)" hide={["paused", "paused_reason", "scheduling_mode", "weekly_cap_usd", "warmup_until", "keyword_from", "branch"]} />
    </div>
  );
}

export function WeeklySection() {
  const { data, error, reload } = useApi<{ week: string; inputs: { owner_hours: number | null; dm_count: number | null; manual: Record<string, unknown>; note: string | null } | null }>("/api/studio/weekly");
  const [form, setForm] = useState<{ hours: string; dms: string; spend: string; note: string } | null>(null);
  const { busy, run } = useAction();
  useEffect(() => {
    if (data) setForm({ hours: String(data.inputs?.owner_hours ?? ""), dms: String(data.inputs?.dm_count ?? ""), spend: String((data.inputs?.manual?.["ad_spend_gbp"] as number | undefined) ?? ""), note: data.inputs?.note ?? "" });
  }, [data]);
  if (error) return <ErrorNote error={error} retry={reload} />;
  if (!data || !form) return <Loading />;
  const num = (s: string) => (s.trim() === "" ? null : Number(s));
  return (
    <div>
      <h2 className="text-2xl">Friday&apos;s numbers</h2>
      <p className="mt-1 text-sm text-ink-2">What only you know, for the scorecard of {data.week}: your hours on the Studio, the DMs answered, any ad spend. The analyst reads them on Friday at 07:00.</p>
      <form className="panel mt-4 grid gap-3 p-4 md:grid-cols-3" onSubmit={(e) => { e.preventDefault(); void run("save", () => api("/api/studio/weekly", { method: "PUT", body: { week: data.week, owner_hours: num(form.hours), dm_count: num(form.dms) === null ? null : Math.round(num(form.dms)!), ad_spend_gbp: num(form.spend), note: form.note || null } }).then(reload), "Saved for Friday"); }}>
        <label className="text-sm"><span className="label">Your hours</span><input className="field" type="number" step="0.25" min="0" value={form.hours} onChange={(e) => setForm({ ...form, hours: e.target.value })} /></label>
        <label className="text-sm"><span className="label">DMs answered</span><input className="field" type="number" min="0" value={form.dms} onChange={(e) => setForm({ ...form, dms: e.target.value })} /></label>
        <label className="text-sm"><span className="label">Ad spend (£)</span><input className="field" type="number" step="0.01" min="0" value={form.spend} onChange={(e) => setForm({ ...form, spend: e.target.value })} /></label>
        <label className="text-sm md:col-span-3"><span className="label">A note for the analyst</span><textarea className="field" rows={2} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></label>
        <div><button className="btn btn-primary" disabled={!!busy}>Save</button></div>
      </form>
    </div>
  );
}

export function KillSection() {
  const { data, reload } = useApi<{ paused: boolean }>("/api/studio/settings/schedules");
  const [reason, setReason] = useState("");
  const { busy, run } = useAction();
  return (
    <div>
      <h2 className="text-2xl text-rust">Kill switch</h2>
      <p className="mt-1 max-w-2xl text-sm text-ink-2">One button stops everything: every queued piece is killed, every worker is paused (the tick dispatches nothing, the outbox posts nothing), the GitHub workflows are disabled and what runs is cancelled, and you get an email saying what stopped. Approved pieces stay approved; slots that pass while stopped are not posted late.</p>
      {data?.paused ? (
        <div className="panel mt-4 border-rust/40 p-4">
          <p className="font-medium text-rust">The Studio is stopped.</p>
          <button className="btn btn-primary mt-3" disabled={!!busy} onClick={() => run("restart", () => api<{ notes: string[] }>("/api/studio/control", { body: { action: "restart" } }).then(async (r) => (await reload(), r)), (r) => (r.notes.length ? `Restarted (${r.notes.join("; ")})` : "Restarted: the next tick runs as usual"))}>Restart</button>
        </div>
      ) : (
        <div className="panel mt-4 border-rust/40 p-4">
          <input className="field max-w-md" placeholder="Why (goes in the audit log and the email)" value={reason} onChange={(e) => setReason(e.target.value)} />
          <button className="btn btn-danger mt-3" disabled={!!busy} onClick={() => confirm("Stop the whole Studio now?") && run("kill", () => api<{ killed: number; cancelled: number; notes: string[] }>("/api/studio/control", { body: { action: "kill", reason } }).then(async (r) => (await reload(), r)), (r) => `Stopped: ${r.killed} queued pieces killed, ${r.cancelled} runs cancelled${r.notes.length ? ` (${r.notes.join("; ")})` : ""}`)}>Stop everything</button>
        </div>
      )}
    </div>
  );
}

export function AuditSection() {
  const [days, setDays] = useState(7);
  const [table, setTable] = useState("");
  const { data, error, loading, reload } = useApi<{ events: EventRow[]; runs: RunRow[] }>(`/api/studio/audit?days=${days}${table ? `&table=${table}` : ""}`);
  return (
    <div>
      <h2 className="text-2xl">Audit log</h2>
      <div className="mt-3 flex flex-wrap gap-2">
        <select className="field w-36" value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="Window">{[1, 7, 30, 90].map((d) => <option key={d} value={d}>Last {d} days</option>)}</select>
        <select className="field w-48" value={table} onChange={(e) => setTable(e.target.value)} aria-label="What">
          <option value="">Everything</option>
          {["studio_posts", "studio_cards", "studio_replies", "studio_reminders", "outbox", "studio_settings", "studio_connections", "studio_runs"].map((t) => <option key={t} value={t}>{t.replace("studio_", "")}</option>)}
        </select>
        <a className="btn" href="/api/studio/export?what=pieces">Export pieces</a>
      </div>
      {loading && !data ? <Loading /> : error && !data ? <ErrorNote error={error} retry={reload} /> : !data?.events.length ? <Empty>Nothing in this window.</Empty> : (
        <div className="mt-3 overflow-x-auto rounded-2xl border border-line bg-card">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="text-left text-xs uppercase tracking-wider text-ink-3"><tr className="border-b border-line"><th className="p-2">When</th><th className="p-2">Who</th><th className="p-2">What</th><th className="p-2">Change</th><th className="p-2">Note</th></tr></thead>
            <tbody>
              {data.events.slice(0, 500).map((e) => (
                <tr key={e.id} className="border-b border-line/60 align-top last:border-0">
                  <td className="whitespace-nowrap p-2 text-ink-3">{paris(e.at)}</td>
                  <td className="p-2 font-medium">{e.actor}</td>
                  <td className="p-2 text-ink-2">{e.table_name.replace("studio_", "")}</td>
                  <td className="whitespace-nowrap p-2">{e.from_status || e.to_status ? `${e.from_status ?? "—"} → ${e.to_status ?? "—"}` : ""}</td>
                  <td className="max-w-md break-words p-2 text-xs text-ink-2">{e.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function ExportSection() {
  const items = [
    ["cards", "Cards", "every card with its hook, points, figures and status"],
    ["pieces", "Pieces", "every piece with its text, status, slot and address"],
    ["metrics", "Metrics", "the numbers by piece and day"],
    ["scorecards", "Scorecards", "Friday's figures and verdicts"],
    ["settings", "Settings and kit (JSON)", "every setting, the kit in use and every prompt version: enough to restore the Studio"],
  ] as const;
  return (
    <div>
      <h2 className="text-2xl">Export</h2>
      <ul className="mt-4 space-y-2">
        {items.map(([what, label, blurb]) => (
          <li key={what} className="panel flex flex-wrap items-center justify-between gap-2 p-3">
            <div><p className="font-medium">{label}</p><p className="text-sm text-ink-2">{blurb}</p></div>
            <a className="btn" href={`/api/studio/export?what=${what}`}>Download</a>
          </li>
        ))}
      </ul>
    </div>
  );
}
