"use client";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { api, ApiError, useApi } from "@/components/studio/api";
import { ErrorNote, Loading, money, paris, Status, Toggle, useAction, useToast } from "@/components/studio/ui";

interface KitProblem { path: string; message: string; level: "error" | "warning" }
interface KitData { yaml: string; version: number; inUse: number; versions: { version: number; note: string | null; createdAt: string | null; createdBy: string }[]; problems: KitProblem[] }

export function KitSection() {
  const [version, setVersion] = useState<number | null>(null);
  const { data, error, loading, reload } = useApi<KitData>(`/api/studio/settings/kit${version ? `?version=${version}` : ""}`);
  const [yaml, setYaml] = useState("");
  const [problems, setProblems] = useState<KitProblem[]>([]);
  const [note, setNote] = useState("");
  const { busy, run } = useAction();
  useEffect(() => {
    if (data) {
      setYaml(data.yaml);
      setProblems(data.problems);
    }
  }, [data]);
  useEffect(() => {
    if (!data || yaml === data.yaml) return;
    const id = setTimeout(async () => {
      try {
        setProblems((await api<{ problems: KitProblem[] }>("/api/studio/settings/kit", { method: "PUT", body: { yaml, check: true } })).problems);
      } catch (err) {
        if (err instanceof ApiError) setProblems([{ path: "(file)", message: err.message, level: "error" }]);
      }
    }, 600);
    return () => clearTimeout(id);
  }, [yaml, data]);
  if (loading && !data) return <Loading />;
  if (error && !data) return <ErrorNote error={error} retry={reload} />;
  if (!data) return null;
  const errors = problems.filter((p) => p.level === "error");
  return (
    <div>
      <h2 className="text-2xl">Brand kit</h2>
      <p className="mt-1 text-sm text-ink-2">Everything every agent reads first: positioning, voice, pillars and their shares, hooks, banned extras, examples, disclosure lines, links and their src tags, slots, tags, calls to action, legal lines. Saving makes a new version; each card records the version it was written under. In use: version {data.inUse}.</p>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <select className="field w-72" value={version ?? data.version} onChange={(e) => setVersion(Number(e.target.value))} aria-label="Version">
          {data.versions.map((v) => <option key={v.version} value={v.version}>v{v.version} · {v.note ?? (v.createdAt ? paris(v.createdAt, "date") : "")} · {v.createdBy}</option>)}
        </select>
        <span className={`text-sm ${errors.length ? "text-rust" : "text-moss"}`}>{errors.length ? `${errors.length} errors` : "Valid"}{problems.length - errors.length ? `, ${problems.length - errors.length} warnings` : ""}</span>
      </div>
      <textarea className="field mt-3 min-h-[520px] font-mono text-xs leading-relaxed" spellCheck={false} value={yaml} onChange={(e) => setYaml(e.target.value)} aria-label="The kit, in YAML" />
      {problems.length > 0 && (
        <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto rounded-xl bg-card p-3 text-xs">
          {problems.map((p, i) => <li key={i} className={p.level === "error" ? "text-rust" : "text-[#8a5a12]"}><span className="font-mono">{p.path}</span>: {p.message}</li>)}
        </ul>
      )}
      <form className="mt-3 flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); void run("save", () => api<{ version: number }>("/api/studio/settings/kit", { method: "PUT", body: { yaml, note: note || null } }).then(async (r) => { setVersion(null); setNote(""); await reload(); return r; }), (r) => `Saved as version ${r.version}: the next run uses it`); }}>
        <input className="field max-w-sm" placeholder="What changed (a note for this version)" value={note} onChange={(e) => setNote(e.target.value)} />
        <button className="btn btn-primary" disabled={!!busy || errors.length > 0 || yaml === data.yaml}>Save a new version</button>
      </form>
    </div>
  );
}

interface ModelsData {
  checked: string;
  live: { fetchedAt: string | null; ids: string[] };
  table: { id: string; label: string; note: string; context: number; maxOutput: number; input: number; output: number; cacheRead: number; cacheWrite5m: number; cacheWrite1h: number; batchFactor: number }[];
  uses: { use: string; label: string; value: { model: string; effort: string; max_tokens: number; weekly_cap_usd: number; fallbacks: boolean }; perRun: number | null; perWeek: number }[];
  weeklyCap: number;
}

export function ModelsSection() {
  const { data, error, loading, reload } = useApi<ModelsData>("/api/studio/settings/models");
  const { busy, run } = useAction();
  const [edits, setEdits] = useState<Record<string, Record<string, unknown>>>({});
  const [prices, setPrices] = useState<Record<string, Record<string, number>>>({});
  if (loading && !data) return <Loading />;
  if (error && !data) return <ErrorNote error={error} retry={reload} />;
  if (!data) return null;
  const val = (use: string, k: string, fallback: unknown) => (edits[use]?.[k] ?? fallback) as never;
  const edit = (use: string, k: string, v: unknown) => setEdits((e) => ({ ...e, [use]: { ...(e[use] ?? {}), [k]: v } }));
  return (
    <div>
      <h2 className="text-2xl">Models</h2>
      <p className="mt-1 text-sm text-ink-2">One row per agent and interactive use. A change takes effect on the next run. The weekly cap for everything together is {money(data.weeklyCap)}; change it under Schedules and slots. Live model list {data.live.fetchedAt ? `read ${paris(data.live.fetchedAt)}` : "not read yet (needs the API key)"}.</p>
      <div className="mt-4 overflow-x-auto rounded-2xl border border-line bg-card">
        <table className="w-full min-w-[860px] text-sm">
          <thead className="text-left text-xs uppercase tracking-wider text-ink-3">
            <tr className="border-b border-line"><th className="p-2">Use</th><th className="p-2">Model</th><th className="p-2">Effort</th><th className="p-2">Max tokens</th><th className="p-2">Cap $/week</th><th className="p-2">Fallbacks</th><th className="p-2 text-right">Cost: run, week</th></tr>
          </thead>
          <tbody>
            {data.uses.map((u) => (
              <tr key={u.use} className="border-b border-line/60 last:border-0">
                <td className="max-w-[10rem] p-2 font-medium">{u.label}</td>
                <td className="p-2"><select className="field min-w-[11rem]" value={val(u.use, "model", u.value.model)} onChange={(e) => edit(u.use, "model", e.target.value)}>{[...new Set([...data.table.map((m) => m.id), ...data.live.ids.filter((id) => id.startsWith("claude-"))])].map((id) => <option key={id} value={id}>{id}</option>)}</select></td>
                <td className="p-2"><select className="field min-w-[6.5rem]" value={val(u.use, "effort", u.value.effort)} onChange={(e) => edit(u.use, "effort", e.target.value)}>{["low", "medium", "high", "xhigh", "max"].map((x) => <option key={x}>{x}</option>)}</select></td>
                <td className="p-2"><input className="field w-24" type="number" value={val(u.use, "max_tokens", u.value.max_tokens)} onChange={(e) => edit(u.use, "max_tokens", Number(e.target.value))} /></td>
                <td className="p-2"><input className="field w-20" type="number" step="0.5" value={val(u.use, "weekly_cap_usd", u.value.weekly_cap_usd)} onChange={(e) => edit(u.use, "weekly_cap_usd", Number(e.target.value))} /></td>
                <td className="p-2"><input type="checkbox" className="accent-[#b5512c]" checked={val(u.use, "fallbacks", u.value.fallbacks)} onChange={(e) => edit(u.use, "fallbacks", e.target.checked)} /></td>
                <td className="p-2 text-right tabular-nums">{u.perRun === null ? "—" : money(u.perRun)}<div className="text-xs text-ink-3">{money(u.perWeek)} a week</div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button className="btn btn-primary mt-3" disabled={!!busy || !Object.keys(edits).length} onClick={() => run("save", async () => {
        try {
          await api("/api/studio/nodes/strategist", { method: "PUT", body: { models: edits } });
        } catch (err) {
          throw err instanceof ApiError && err.problems.length ? new Error(err.problems.join("; ")) : err;
        }
        setEdits({});
        await reload();
      }, "Saved")}>Save the models</button>

      <h3 className="mt-8 text-xl">Prices <span className="font-sans text-sm text-ink-3">dollars per million tokens, checked {data.checked}</span></h3>
      <div className="mt-2 overflow-x-auto rounded-2xl border border-line bg-card">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="text-left text-xs uppercase tracking-wider text-ink-3"><tr className="border-b border-line"><th className="p-2">Model</th>{["input", "output", "cacheRead", "cacheWrite5m", "cacheWrite1h", "batchFactor"].map((k) => <th key={k} className="p-2">{k}</th>)}<th className="p-2">Context / max out</th></tr></thead>
          <tbody>
            {data.table.map((m) => (
              <tr key={m.id} className="border-b border-line/60 last:border-0">
                <td className="p-2"><span className="font-medium">{m.label}</span><div className="text-xs text-ink-3">{m.note}</div></td>
                {(["input", "output", "cacheRead", "cacheWrite5m", "cacheWrite1h", "batchFactor"] as const).map((k) => (
                  <td key={k} className="p-2"><input className="field w-20" type="number" step="0.01" value={prices[m.id]?.[k] ?? m[k]} onChange={(e) => setPrices((p) => ({ ...p, [m.id]: { ...(p[m.id] ?? {}), [k]: Number(e.target.value) } }))} /></td>
                ))}
                <td className="p-2 text-xs text-ink-2">{(m.context / 1000).toFixed(0)}k / {(m.maxOutput / 1000).toFixed(0)}k</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button className="btn mt-3" disabled={!!busy || !Object.keys(prices).length} onClick={() => run("prices", () => api("/api/studio/settings/models", { method: "PUT", body: { prices } }).then(async () => (setPrices({}), await reload())), "Prices saved: costs use them from the next run")}>Save the prices</button>
    </div>
  );
}

interface Connection { key: string; label: string; kind: "oauth" | "form"; platforms: { id: string; label: string; mode: string; enabled: boolean }[]; status: string; account: string | null; scopes: string[]; expiresAt: string | null; updatedAt: string | null; missingEnv: string[] }

export function ConnectionsSection() {
  const params = useSearchParams();
  const toast = useToast();
  const { data, error, loading, reload } = useApi<{ connections: Connection[]; byHand: { id: string; label: string }[] }>("/api/studio/connections");
  const { busy, run } = useAction();
  useEffect(() => {
    const connected = params.get("connected");
    const err = params.get("error");
    if (connected) toast(`${connected} is connected`);
    if (err) toast(`The connection failed: ${err}`, "error");
  }, [params, toast]);
  if (loading && !data) return <Loading />;
  if (error && !data) return <ErrorNote error={error} retry={reload} />;
  if (!data) return null;
  const mode = (platform: string, value: string) => run("mode", () => api(`/api/studio/nodes/platform-${platform}`, { method: "PUT", body: { settings: { mode: value === "default" ? null : value } } }).then(reload), "Saved");
  const enabled = (platform: string, on: boolean) => run("enabled", () => api(`/api/studio/nodes/platform-${platform}`, { method: "PUT", body: { settings: { enabled: on } } }).then(reload), on ? "On" : "Off");
  return (
    <div>
      <h2 className="text-2xl">Connections</h2>
      <p className="mt-1 text-sm text-ink-2">Tokens are kept in Supabase Vault and never shown. Test in dry run builds a real post and logs the exact request it would send, without sending it.</p>
      <ul className="mt-4 grid gap-3 lg:grid-cols-2">
        {data.connections.map((c) => (
          <li key={c.key} className="panel p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-serif text-lg">{c.label}</p>
                <p className="text-sm text-ink-2">{c.account ?? "Not connected"}</p>
              </div>
              <Status value={c.status} />
            </div>
            {c.expiresAt && <p className="mt-1 text-xs text-ink-3">Reconnect by {paris(c.expiresAt, "date")}</p>}
            {c.scopes.length > 0 && <p className="mt-1 text-xs text-ink-3">{c.scopes.join(", ")}</p>}
            {c.missingEnv.length > 0 && <p className="mt-2 rounded-xl bg-gold-soft p-2 text-xs">Paste {c.missingEnv.join(" and ")} in <a className="underline" href="/studio/settings?section=keys">Keys</a> first.</p>}
            <div className="mt-3 flex flex-wrap gap-2">
              {c.kind === "oauth" && (c.missingEnv.length ? <button className="btn btn-primary btn-sm" disabled>{c.status === "disconnected" ? "Connect" : "Reconnect"}</button> : <a className="btn btn-primary btn-sm" href={`/api/studio/oauth/${c.key}/start`}>{c.status === "disconnected" ? "Connect" : "Reconnect"}</a>)}
              {c.status !== "disconnected" && <button className="btn btn-danger btn-sm" disabled={!!busy} onClick={() => confirm(`Disconnect ${c.label}? Its token is deleted.`) && run("disc", () => api(`/api/studio/connections/${c.key}`, { body: { action: "disconnect" } }).then(reload), "Disconnected")}>Disconnect</button>}
            </div>
            {c.key === "bluesky" && <BlueskyForm onDone={reload} />}
            {c.key === "mastodon" && <MastodonForm onDone={reload} />}
            <ul className="mt-3 space-y-2 border-t border-line pt-3">
              {c.platforms.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="w-24 font-medium">{p.label}</span>
                  <Toggle label="" checked={p.enabled} onChange={(v) => enabled(p.id, v)} disabled={!!busy} />
                  <select className="field w-40" value={p.mode} onChange={(e) => mode(p.id, e.target.value)} aria-label={`${p.label}: how it posts`}>
                    <option value="api">Through its API</option>
                    <option value="by_hand">By hand on Today</option>
                    {p.id === "tiktok" && <option value="inbox">To the TikTok inbox</option>}
                  </select>
                  {c.status !== "disconnected" && <button className="btn btn-sm" disabled={!!busy} onClick={() => run("test", () => api<{ ok: boolean; message: string }>(`/api/studio/connections/${c.key}`, { body: { action: "test", platform: p.id } }).then((r) => { if (!r.ok) throw new Error(r.message); return r; }), (r) => r.message)}>Test in dry run</button>}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-sm text-ink-2">By hand, always: {data.byHand.map((p) => p.label).join(", ")}. Their pieces wait on Today with the file and the caption to copy.</p>
    </div>
  );
}

function BlueskyForm({ onDone }: { onDone: () => Promise<void> }) {
  const [handle, setHandle] = useState("");
  const [password, setPassword] = useState("");
  const { busy, run } = useAction();
  return (
    <form className="mt-3 space-y-2" onSubmit={(e) => { e.preventDefault(); void run("bsky", () => api<{ account: string }>("/api/studio/connections/bluesky", { body: { action: "bluesky", handle, password } }).then(async (r) => (setPassword(""), await onDone(), r)), (r) => `Connected as ${r.account}`); }}>
      <p className="text-xs text-ink-2">Bluesky: your handle and an app password (bsky.app → Settings → Privacy and security → App passwords).</p>
      <div className="flex flex-wrap gap-2">
        <input className="field w-48" placeholder="theastrostudy.bsky.social" value={handle} onChange={(e) => setHandle(e.target.value)} autoComplete="off" />
        <input className="field w-44" type="password" placeholder="xxxx-xxxx-xxxx-xxxx" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="off" />
        <button className="btn btn-sm" disabled={!handle || password.length < 8 || !!busy}>Connect</button>
      </div>
    </form>
  );
}

function MastodonForm({ onDone }: { onDone: () => Promise<void> }) {
  const [instance, setInstance] = useState("mastodon.social");
  const [token, setToken] = useState("");
  const { busy, run } = useAction();
  return (
    <form className="mt-3 space-y-2" onSubmit={(e) => { e.preventDefault(); void run("masto", () => api<{ account: string }>("/api/studio/connections/mastodon", { body: { action: "mastodon", instance, token } }).then(async (r) => (setToken(""), await onDone(), r)), (r) => `Connected as ${r.account}`); }}>
      <p className="text-xs text-ink-2">Mastodon: your server, and a token from Preferences → Development → New application (scopes read and write).</p>
      <div className="flex flex-wrap gap-2">
        <input className="field w-44" value={instance} onChange={(e) => setInstance(e.target.value)} />
        <input className="field w-56" type="password" placeholder="Your access token" value={token} onChange={(e) => setToken(e.target.value)} autoComplete="off" />
        <button className="btn btn-sm" disabled={!instance || token.length < 10 || !!busy}>Connect</button>
      </div>
    </form>
  );
}
