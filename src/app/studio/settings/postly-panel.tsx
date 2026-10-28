"use client";
import { useEffect, useState } from "react";
import { api, useApi } from "@/components/studio/api";
import { ErrorNote, Loading, useAction } from "@/components/studio/ui";

interface PostlyData {
  keySet: boolean;
  saved: { workspace_id: string | null; workspace_name: string | null; channels: Record<string, { id: string; name: string }> };
  modes: Record<string, string>;
  platforms: { id: string; label: string }[];
  workspaces: { id: string; name: string }[];
  channels: { id: string; name: string; platform: string }[];
  error: string | null;
}

/**
 * Postly in Settings → Connections: the workspace and, per network, the channel the Studio posts to. A
 * network posts through Postly once its own row below says "Through Postly".
 */
export function PostlyPanel({ onChange }: { onChange: () => void }) {
  const { data, error, loading, reload } = useApi<PostlyData>("/api/studio/postly");
  const { busy, run } = useAction();
  const [picks, setPicks] = useState<Record<string, { id: string; name: string }>>({});
  useEffect(() => {
    if (!data) return;
    // What was saved, and for a network with exactly one channel in the workspace, that one.
    const next: Record<string, { id: string; name: string }> = { ...data.saved.channels };
    for (const p of data.platforms) {
      const options = data.channels.filter((c) => c.platform === p.id);
      if (!next[p.id] && options.length === 1) next[p.id] = { id: options[0]!.id, name: options[0]!.name };
    }
    setPicks(next);
  }, [data]);
  if (loading && !data) return <Loading label="Postly" />;
  if (error && !data) return <ErrorNote error={error} retry={reload} />;
  if (!data) return null;

  const pickWorkspace = (id: string) =>
    run(
      "workspace",
      async () => {
        const w = data.workspaces.find((x) => x.id === id) ?? null;
        await api("/api/studio/postly", { method: "PUT", body: { workspace_id: w?.id ?? null, workspace_name: w?.name ?? null, channels: {} } });
        await reload();
      },
      "Workspace saved",
    );
  const save = () =>
    run(
      "channels",
      async () => {
        const channels = Object.fromEntries(Object.entries(picks).filter(([, v]) => v.id));
        await api("/api/studio/postly", { method: "PUT", body: { workspace_id: data.saved.workspace_id, workspace_name: data.saved.workspace_name, channels } });
        await reload();
        onChange();
      },
      "Saved",
    );
  const changed = JSON.stringify(picks) !== JSON.stringify(data.saved.channels);

  return (
    <div className="panel p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-serif text-lg">Postly</p>
          <p className="text-sm text-ink-2">One key posts to TikTok, YouTube and Pinterest publicly, without their app reviews. Choose &ldquo;Through Postly&rdquo; on a network below to use it there; comments and numbers still come from a network&rsquo;s own connection.</p>
        </div>
        <span className={`chip shrink-0 ${data.keySet && data.saved.workspace_id ? "border-moss/40 text-moss" : ""}`}>{!data.keySet ? "no key" : (data.saved.workspace_name ?? "key set")}</span>
      </div>
      {!data.keySet && (
        <p className="mt-2 rounded-xl bg-gold-soft p-2 text-xs">
          Paste your Postly API key in <a className="underline" href="/studio/settings?section=keys">Keys</a> first.
        </p>
      )}
      {data.error && <p className="mt-2 rounded-xl bg-rust-soft p-2 text-xs text-rust">{data.error}</p>}
      {data.keySet && !data.error && (
        <div className="mt-3 space-y-3">
          <label className="block text-sm">
            <span className="label">Workspace</span>
            <select className="field" value={data.saved.workspace_id ?? ""} disabled={!!busy} onChange={(e) => pickWorkspace(e.target.value)}>
              <option value="">Pick a workspace</option>
              {data.workspaces.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </label>
          {data.saved.workspace_id && (
            <ul className="space-y-2 border-t border-line pt-3">
              {data.platforms.map((p) => {
                const options = data.channels.filter((c) => c.platform === p.id);
                const through = data.modes[p.id] === "postly";
                return (
                  <li key={p.id} className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="w-24 font-medium">{p.label}</span>
                    {options.length === 0 ? (
                      <span className="text-xs text-ink-3">no {p.label} channel in this workspace</span>
                    ) : (
                      <select className="field w-56" value={picks[p.id]?.id ?? ""} onChange={(e) => setPicks({ ...picks, [p.id]: { id: e.target.value, name: options.find((o) => o.id === e.target.value)?.name ?? "" } })} aria-label={`${p.label} channel`}>
                        <option value="">Not through Postly</option>
                        {options.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.name}
                          </option>
                        ))}
                      </select>
                    )}
                    {through && <span className="chip border-moss/40 text-moss">posting through Postly</span>}
                    {through && data.saved.channels[p.id] && (
                      <button className="btn btn-sm" disabled={!!busy} onClick={() => run("test", () => api<{ ok: boolean; message: string }>("/api/studio/postly", { body: { action: "test", platform: p.id } }).then((r) => { if (!r.ok) throw new Error(r.message); return r; }), (r) => r.message)}>
                        Test in dry run
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {data.saved.workspace_id && (
            <button className="btn btn-primary btn-sm" disabled={!!busy || !changed} onClick={save}>
              Save the channels
            </button>
          )}
        </div>
      )}
    </div>
  );
}
