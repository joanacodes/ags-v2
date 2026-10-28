"use client";
import Link from "next/link";
import { api, ApiError, useApi } from "./api";
import { SettingsForm } from "./settings-form";
import { paris, Sheet, useAction, Dot } from "./ui";
import type { MapNode } from "@/studio/views/map";

interface NodeInfo {
  node: { id: string; label: string; kind: string; blurb: string; worker?: string };
  settings: Record<string, unknown> | null;
  problems: string[];
  schedule: string | null;
  models: { use: string; value: { model: string; effort: string; max_tokens: number; weekly_cap_usd: number; fallbacks: boolean } }[];
  prompts: { version: number; note: string | null; createdAt: string }[];
  postingMode: string | null;
}

const LIBRARY_LINK: Record<string, string> = {
  strategist: "/studio/library?tab=cards",
  "writer-en": "/studio/library?tab=pieces&language=en",
  "writer-fr": "/studio/library?tab=pieces&language=fr",
  community: "/studio/library?tab=replies",
  analyst: "/studio/library?tab=scorecards",
  gate: "/studio/library?tab=pieces&failed=1",
  "render-pictures": "/studio/library?tab=media",
  "render-video": "/studio/library?tab=media",
  outbox: "/studio/library?tab=pieces&status=queued",
  "input-site": "/studio/library?tab=sky",
  "input-metrics": "/studio/library?tab=runs&agent=metrics",
  library: "/studio/library",
  reminders: "/studio/today#reminders",
  brand: "/studio/settings?section=kit",
};

export function NodeDrawer({ node, onClose, onChanged }: { node: MapNode | null; onClose: () => void; onChanged: () => void }) {
  const { data, error, reload } = useApi<NodeInfo>(node ? `/api/studio/nodes/${node.id}` : null);
  const { busy, run } = useAction();
  if (!node) return null;
  const save = (body: Record<string, unknown>) =>
    run("save", async () => {
      try {
        await api(`/api/studio/nodes/${node.id}`, { method: "PUT", body });
      } catch (err) {
        if (err instanceof ApiError && err.problems.length) throw new Error(err.problems.join("; "));
        throw err;
      }
      await reload();
      onChanged();
    }, "Saved: the next run uses it");
  const platform = node.id.startsWith("platform-") ? node.id.slice(9) : null;
  return (
    <Sheet open={!!node} onClose={onClose} title={<span className="flex items-center gap-2"><Dot status={node.status} />{node.label}</span>}>
      <p className="text-sm text-ink-2">{node.blurb}</p>
      {node.statusNote && <p className={`mt-2 rounded-xl px-3 py-2 text-sm ${node.status === "failed" ? "bg-rust-soft text-rust" : "bg-gold-soft text-[#8a5a12]"}`}>{node.statusNote}</p>}
      <dl className="mt-4 grid grid-cols-3 gap-2 text-sm">
        {node.stats.map((s) => (
          <div key={s.label} className="rounded-xl bg-card p-2">
            <dt className="eyebrow">{s.label}</dt>
            <dd className="mt-0.5 font-medium">{s.value}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-4 flex flex-wrap gap-2">
        {node.worker && (
          <button className="btn btn-primary btn-sm" disabled={!!busy} onClick={() => run("run", () => api("/api/studio/run", { body: { worker: node.worker } }).then(onChanged), "Dispatched: it starts within a minute")}>
            {node.id === "input-site" ? "Read the pages now" : "Run now"}
          </button>
        )}
        {node.id === "input-site" && (
          <button className="btn btn-primary btn-sm" disabled={!!busy} onClick={() => run("sky", () => api("/api/studio/run", { body: { worker: "sky" } }).then(onChanged), "Dispatched: the sky table fills in a few minutes")}>
            Scan the sky now
          </button>
        )}
        {LIBRARY_LINK[node.id] && <Link className="btn btn-sm" href={LIBRARY_LINK[node.id]!}>Open in Library</Link>}
        {platform && <Link className="btn btn-sm" href="/studio/settings?section=connections">Connection</Link>}
        {platform && (
          <button className="btn btn-sm" disabled={!!busy} onClick={() => run("test", () => api<{ ok: boolean; message: string }>(`/api/studio/connections/${platform === "instagram" || platform === "facebook" ? "meta" : platform}`, { body: { action: "test", platform } }), (r) => r.message)}>
            Test in dry run
          </button>
        )}
      </div>
      {node.lastRun && (
        <p className="mt-3 text-xs text-ink-3">
          Last run {paris(node.lastRun.at)} · {node.lastRun.outcome}
          {node.lastRun.url && (
            <>
              {" · "}
              <a href={node.lastRun.url} target="_blank" rel="noreferrer" className="text-accent hover:underline">log ↗</a>
            </>
          )}
          {node.nextRun && <> · next {paris(node.nextRun)}</>}
        </p>
      )}
      {error && <p className="mt-4 text-sm text-rust">{error}</p>}
      {data?.problems.length ? <p className="mt-4 rounded-xl bg-gold-soft p-3 text-xs">Ignored stored values: {data.problems.join("; ")}</p> : null}
      {data?.models.map((m) => (
        <div key={m.use} className="mt-6">
          <p className="eyebrow mb-2">Model · {m.use}</p>
          <SettingsForm key={`${m.use}-${JSON.stringify(m.value)}`} values={m.value} busy={busy === "save"} onSave={(changed) => save({ models: { [m.use]: changed } })} />
        </div>
      ))}
      {data?.prompts && (node.kind === "agent") && (
        <div className="mt-6">
          <p className="eyebrow mb-2">Prompt</p>
          <p className="text-sm text-ink-2">{data.prompts.length ? `Version ${data.prompts[0]!.version}, saved ${paris(data.prompts[0]!.createdAt)}` : "Version 1, from the repository"}</p>
          <Link className="btn btn-sm mt-2" href={`/studio/settings?section=prompts&agent=${node.id === "community" ? "community-draft" : node.id}`}>Edit, compare, test</Link>
        </div>
      )}
      {data?.settings && (
        <div className="mt-6">
          <p className="eyebrow mb-2">Settings{data.schedule ? ` · ${data.schedule}` : ""}</p>
          <SettingsForm key={JSON.stringify(data.settings)} values={data.settings} busy={busy === "save"} hide={["paused", "paused_reason", "feed_token"]} onSave={(changed) => save({ settings: changed })} />
        </div>
      )}
    </Sheet>
  );
}
