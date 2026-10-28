"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, useApi } from "@/components/studio/api";
import { ErrorNote, Loading, Status, Toggle, useAction } from "@/components/studio/ui";
import type { VideoState } from "@/studio/views/video";
import type { VideoSpec } from "@/studio/video/spec";
import type { Timeline } from "@/studio/video/timeline";
import type { PieceDetail } from "@/studio/views/detail";

const SCALE = 0.26;

/** Lines of six words at most, broken at sentence and clause ends first (the engine's own rule, previewed). */
function resplit(script: string, max = 6): string[] {
  const out: string[] = [];
  for (const sentence of script.split(/(?<=[.!?;:])\s+/)) {
    const words = sentence.split(/\s+/).filter(Boolean);
    for (let i = 0; i < words.length; i += max) out.push(words.slice(i, i + max).join(" "));
  }
  return out.filter(Boolean);
}

export function VideoStudio() {
  const params = useSearchParams();
  const router = useRouter();
  const pieceId = params.get("piece");
  const { data, error, loading, reload } = useApi<VideoState>(`/api/studio/video${pieceId ? `?piece=${pieceId}` : ""}`);
  const [spec, setSpec] = useState<VideoSpec | null>(null);
  const [timeline, setTimeline] = useState<Timeline | null>(null);
  const [estimated, setEstimated] = useState(true);
  const [audio, setAudio] = useState<string | null>(null);
  const [states, setStates] = useState<{ start: number; end: number }[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [gate, setGate] = useState<{ ok: boolean; checks: { name: string; ok: boolean; detail: string }[] } | null>(null);
  const [load, setLoad] = useState(pieceId ?? "");
  const [targets, setTargets] = useState<string[]>([]);
  const frame = useRef<HTMLIFrameElement>(null);
  const player = useRef<HTMLAudioElement>(null);
  const { busy, run } = useAction();
  const piece = useApi<PieceDetail>(pieceId ? `/api/studio/pieces/${pieceId}` : null);

  useEffect(() => {
    if (!data) return;
    const preset = params.get("template");
    setSpec(preset ? { ...data.spec, template: preset } : data.spec);
    setTimeline(data.timeline);
    setEstimated(true);
    setAudio(null);
  }, [data, params]);

  const template = useMemo(() => data?.templates.find((x) => x.id === spec?.template), [data, spec?.template]);

  // The preview frame gets the spec and the timeline whenever either changes.
  const send = useCallback(() => {
    if (!spec || !timeline || !frame.current?.contentWindow) return;
    frame.current.contentWindow.postMessage({ type: "studio:load", spec, timeline }, window.location.origin);
  }, [spec, timeline]);
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.data?.type !== "studio:loaded") return;
      setStates(e.data.states ?? []);
      setWarnings(e.data.warnings ?? []);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);
  useEffect(() => {
    const id = setTimeout(send, 250);
    return () => clearTimeout(id);
  }, [send]);
  useEffect(() => {
    frame.current?.contentWindow?.postMessage({ type: "studio:seek", t }, window.location.origin);
  }, [t]);

  // The estimate and the gate follow the words, a moment after the typing stops.
  useEffect(() => {
    if (!spec) return;
    const id = setTimeout(async () => {
      try {
        if (estimated) setTimeline((await api<{ timeline: Timeline }>("/api/studio/video", { body: { action: "estimate", spec } })).timeline);
        setGate(await api("/api/studio/video", { body: { action: "check", pieceId, spec } }));
      } catch {
        // the form shows what is wrong; the preview keeps its last good state
      }
    }, 500);
    return () => clearTimeout(id);
  }, [spec, pieceId, estimated]);

  // Play: the voice when there is one, the clock otherwise; the scrubber follows either.
  useEffect(() => {
    if (!playing || !timeline) return;
    const started = performance.now() - t * 1000;
    const el = audio ? player.current : null;
    if (el) {
      el.currentTime = t;
      void el.play();
    }
    let raf = 0;
    const tick = () => {
      const now = el ? el.currentTime : (performance.now() - started) / 1000;
      if (now >= timeline.duration) {
        setPlaying(false);
        setT(0);
        return;
      }
      setT(now);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      el?.pause();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the loop starts and stops with `playing` alone
  }, [playing]);

  if (loading && !data) return <Loading label="Opening the Video studio" />;
  if (error && !data) return <ErrorNote error={error} retry={reload} />;
  if (!data || !spec || !timeline) return null;
  const set = (patch: Partial<VideoSpec>) => setSpec({ ...spec, ...patch });
  const duration = timeline.duration;
  const media = piece.data?.media.find((m) => m.kind === "video");
  const thumb = piece.data?.media.find((m) => m.kind === "thumbnail");

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Template, script, voice, meadow</p>
          <h1 className="text-4xl">Video studio</h1>
        </div>
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); router.push(load ? `/studio/video?piece=${encodeURIComponent(load.trim())}` : "/studio/video"); }}>
          <input className="field w-72" placeholder="Load from piece (its id)" value={load} onChange={(e) => setLoad(e.target.value)} aria-label="Piece id" />
          <button className="btn">Load</button>
        </form>
      </div>
      {data.pieceId && (
        <p className="mb-4 text-sm text-ink-2">
          Editing <Link className="text-accent hover:underline" href={`/studio/library/pieces/${data.pieceId}`}>this piece</Link> <Status value={data.status ?? "draft"} />
          {!data.approved && <span className="ml-2 text-[#8a5a12]">Approve it before rendering.</span>}
        </p>
      )}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto_300px]">
        <div className="space-y-3">
          <div>
            <span className="label">Template</span>
            <div className="grid grid-cols-2 gap-2">
              {data.templates.map((x) => (
                <button key={x.id} type="button" onClick={() => set({ template: x.id })} className={`rounded-xl border p-2 text-left text-xs ${x.id === spec.template ? "border-accent bg-accent-soft" : "border-line bg-card hover:bg-white"}`}>
                  <span className="block font-medium text-ink">{x.label}</span>
                  <span className="text-ink-3">{x.blurb}</span>
                </button>
              ))}
            </div>
          </div>
          <label className="block text-sm">
            <span className="label">Script: the first sentence is the hook</span>
            <textarea className="field" rows={6} value={spec.script} onChange={(e) => set({ script: e.target.value })} />
            <span className="mt-1 block text-xs text-ink-3">{spec.script.split(/\s+/).filter(Boolean).length} words · about {Math.round((spec.script.split(/\s+/).filter(Boolean).length / 150) * 60)} s at 150 a minute</span>
          </label>
          <label className="block text-sm">
            <span className="label flex items-center justify-between">On-screen lines <button type="button" className="btn btn-quiet btn-sm normal-case tracking-normal" onClick={() => set({ lines: resplit(spec.script) })}>Re-split from the script</button></span>
            <textarea className="field" rows={6} value={spec.lines.join("\n")} onChange={(e) => set({ lines: e.target.value.split("\n") })} />
          </label>
          {template?.needs.includes("statements") && (
            <div>
              <span className="label">The three statements (A, B, C)</span>
              {[0, 1, 2].map((i) => (
                <textarea key={i} className="field mb-2" rows={2} value={spec.statements?.[i] ?? ""} onChange={(e) => { const next = [...(spec.statements ?? ["", "", ""])]; next[i] = e.target.value; set({ statements: next }); }} />
              ))}
            </div>
          )}
          {spec.template === "figure-card" && (
            <div className="grid grid-cols-2 gap-2">
              <input className="field" placeholder="The figure (1 in 3)" value={spec.figure?.value ?? ""} onChange={(e) => set({ figure: { value: e.target.value, label: spec.figure?.label ?? "", source: spec.figure?.source ?? "" } })} />
              <input className="field" placeholder="What it counts" value={spec.figure?.label ?? ""} onChange={(e) => set({ figure: { value: spec.figure?.value ?? "", label: e.target.value, source: spec.figure?.source ?? "" } })} />
              <input className="field col-span-2" placeholder="Its source" value={spec.figure?.source ?? ""} onChange={(e) => set({ figure: { value: spec.figure?.value ?? "", label: spec.figure?.label ?? "", source: e.target.value } })} />
            </div>
          )}
          {spec.template === "sky-this-week" && (
            <div className="grid grid-cols-2 gap-2">
              <input className="field" placeholder="When" value={spec.sky?.when ?? ""} onChange={(e) => set({ sky: { when: e.target.value, event: spec.sky?.event ?? "", house: spec.sky?.house ?? "" } })} />
              <input className="field" placeholder="The event" value={spec.sky?.event ?? ""} onChange={(e) => set({ sky: { when: spec.sky?.when ?? "", event: e.target.value, house: spec.sky?.house ?? "" } })} />
              <input className="field col-span-2" placeholder="The house line" value={spec.sky?.house ?? ""} onChange={(e) => set({ sky: { when: spec.sky?.when ?? "", event: spec.sky?.event ?? "", house: e.target.value } })} />
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <label className="text-sm"><span className="label">Language</span><select className="field" value={spec.language} onChange={(e) => set({ language: e.target.value as "en" | "fr" })}><option value="en">English</option><option value="fr">French</option></select></label>
            <label className="text-sm"><span className="label">Meadow speed</span><input className="field" type="number" min={0.25} max={2} step={0.05} value={spec.background.speed} onChange={(e) => set({ background: { ...spec.background, speed: Number(e.target.value) } })} /></label>
          </div>
          <Toggle label="The AI-voice frame at the end" checked={spec.overlays.disclosure} onChange={(v) => set({ overlays: { disclosure: v } })} />
          <div className="rounded-xl bg-card p-3 text-sm">
            <p className="font-medium">Voice</p>
            <p className="text-ink-2">{spec.voice.voice_id ? `${spec.voice.voice_id} · ${spec.voice.model_id}` : "No voice yet: set the voice id in Settings → the Video renderer."}</p>
            <button
              className="btn btn-sm mt-2"
              disabled={!!busy || !spec.voice.voice_id}
              onClick={() =>
                run("voice", async () => {
                  const r = await api<{ audioUrl: string | null; timeline: Timeline; cached: boolean; message: string | null }>("/api/studio/video", { body: { action: "voice", spec } });
                  setTimeline(r.timeline);
                  if (r.audioUrl) {
                    setAudio(r.audioUrl);
                    setEstimated(false);
                  }
                  if (r.message) throw new Error(r.message);
                  return r;
                }, (r) => (r.cached ? "The voice, from the cache" : "The voice is ready: the scrubber is exact now"))
              }
            >
              {busy === "voice" ? "Speaking…" : "Preview the voice"}
            </button>
          </div>
        </div>

        <div className="flex flex-col items-center">
          <div className="relative overflow-hidden rounded-[22px] border border-line bg-ink shadow-soft" style={{ width: 1080 * SCALE, height: 1920 * SCALE }}>
            {template && <iframe ref={frame} title="Preview" src={`/studio/templates/${template.file}?preview=1`} onLoad={send} style={{ width: 1080, height: 1920, transform: `scale(${SCALE})`, transformOrigin: "0 0", border: 0 }} />}
          </div>
          <div className="mt-3 w-full max-w-[300px]">
            <div className="flex items-center gap-2">
              <button className="btn btn-sm" onClick={() => setPlaying((p) => !p)}>{playing ? "Pause" : "Play"}</button>
              <input type="range" min={0} max={duration} step={0.05} value={t} onChange={(e) => { setPlaying(false); setT(Number(e.target.value)); }} className="flex-1 accent-[#b5512c]" aria-label="Time" />
              <span className="w-12 text-right text-xs tabular-nums text-ink-3">{t.toFixed(1)} s</span>
            </div>
            <p className="mt-1 text-center text-xs text-ink-3">{duration.toFixed(1)} s {estimated ? "estimated (150 words a minute)" : "with the voice"} · {states.length} states</p>
            <div className="mt-2 flex flex-wrap gap-1">
              {states.map((s, i) => (
                <button key={i} className={`h-6 min-w-[24px] rounded-md px-1 text-[10px] ${t >= s.start && t < s.end ? "bg-accent text-white" : "bg-card text-ink-2"}`} onClick={() => { setPlaying(false); setT(s.start + 0.01); }}>
                  {i + 1}
                </button>
              ))}
            </div>
            {audio && <audio ref={player} src={audio} preload="auto" />}
          </div>
        </div>

        <aside className="space-y-4">
          <div className="panel p-3">
            <p className="eyebrow mb-2">The gate, live</p>
            {gate ? (
              <ul className="space-y-1.5 text-sm">
                {gate.checks.map((c) => (
                  <li key={c.name} className="flex gap-2"><span className={c.ok ? "text-moss" : "text-rust"}>{c.ok ? "✓" : "✕"}</span><span><span className="font-medium">{c.name}</span> <span className="text-ink-2">{c.detail}</span></span></li>
                ))}
                {warnings.map((w) => <li key={w} className="text-xs text-[#8a5a12]">{w}</li>)}
              </ul>
            ) : <p className="text-sm text-ink-3">Checking…</p>}
          </div>
          <div className="panel space-y-2 p-3">
            {data.pieceId ? (
              <>
                <button className="btn w-full" disabled={!!busy} onClick={() => run("save", () => api<{ gateOk: boolean; failures: string[] }>("/api/studio/video", { body: { action: "save", pieceId: data.pieceId, spec } }).then(async (r) => (await reload(), r)), (r) => (r.gateOk ? "Saved to the piece" : `Saved, but the gate stops it: ${r.failures[0]}`))}>Save to the piece</button>
                <button className="btn btn-primary w-full" disabled={!!busy || !data.approved} title={data.approved ? "" : "Approve the piece first"} onClick={() => run("render", () => api("/api/studio/video", { body: { action: "save", pieceId: data.pieceId, spec } }).then(() => api("/api/studio/video", { body: { action: "render", pieceId: data.pieceId } })), "Rendering: it takes two or three minutes")}>Render</button>
              </>
            ) : (
              <NewVideo spec={spec} onMade={(id) => router.push(`/studio/video?piece=${id}`)} />
            )}
            <button className="btn btn-quiet w-full" disabled={!!busy} onClick={() => { const name = prompt("Name the preset"); if (name) void run("preset", () => api("/api/studio/video", { body: { action: "preset", name, spec } }), "Saved as a preset"); }}>Save as preset</button>
          </div>
          {media && (
            <div className="panel space-y-2 p-3">
              <p className="eyebrow">The last render</p>
              <video src={`/api/studio/media/${media.id}`} poster={thumb ? `/api/studio/media/${thumb.id}` : undefined} controls playsInline className="w-full rounded-xl" />
              <p className="text-sm font-medium">Send to the outbox as a draft for…</p>
              <div className="flex flex-wrap gap-2 text-sm">
                {["instagram", "tiktok", "youtube", "facebook", "threads"].filter((p) => p !== piece.data?.post.platform).map((p) => (
                  <label key={p} className="flex items-center gap-1"><input type="checkbox" className="accent-[#b5512c]" checked={targets.includes(p)} onChange={(e) => setTargets(e.target.checked ? [...targets, p] : targets.filter((x) => x !== p))} />{p}</label>
                ))}
              </div>
              <button className="btn btn-sm" disabled={!targets.length || !!busy} onClick={() => run("send", () => api<{ made: number }>("/api/studio/video", { body: { action: "send", pieceId: data.pieceId, platforms: targets } }), (r) => `${r.made} drafts made: approve them in the Library`)}>Send</button>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function NewVideo({ spec, onMade }: { spec: VideoSpec; onMade: (pieceId: string) => void }) {
  const [platform, setPlatform] = useState("instagram");
  const [pillar, setPillar] = useState("test");
  const { busy, run } = useAction();
  const hook = spec.script.split(/(?<=[.!?])\s+/)[0] ?? "";
  return (
    <div className="space-y-2">
      <p className="text-sm text-ink-2">A video made by hand becomes a draft card and piece, approved like any other.</p>
      <div className="grid grid-cols-2 gap-2">
        <select className="field" value={platform} onChange={(e) => setPlatform(e.target.value)} aria-label="Network">{["instagram", "tiktok", "youtube", "facebook", "threads"].map((p) => <option key={p}>{p}</option>)}</select>
        <select className="field" value={pillar} onChange={(e) => setPillar(e.target.value)} aria-label="Pillar">{["test", "placements", "tested", "sky"].map((p) => <option key={p}>{p}</option>)}</select>
      </div>
      <button className="btn btn-primary w-full" disabled={!!busy || spec.script.trim().length < 10} onClick={() => run("new", () => api<{ pieceId: string }>("/api/studio/video", { body: { action: "new", platform, language: spec.language, pillar, hook: hook.slice(0, 300) || "A video", script: spec.script, template: spec.template } }).then((r) => (onMade(r.pieceId), r)), "Made: approve it, then render")}>Make it a piece</button>
    </div>
  );
}
