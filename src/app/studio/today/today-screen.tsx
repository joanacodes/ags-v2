"use client";
import Link from "next/link";
import { useState } from "react";
import { api, useApi } from "@/components/studio/api";
import { HealthStrip } from "@/components/studio/health";
import { PieceRow } from "@/components/studio/pieces";
import { CopyButton, Empty, ErrorNote, Loading, paris, Section, Status, useAction } from "@/components/studio/ui";
import type { TodayView } from "@/studio/views/today";
import type { PieceLine, ReplyLine } from "@/studio/views/shared";

export function TodayScreen() {
  const { data, error, loading, reload } = useApi<TodayView>("/api/studio/today", 60_000);
  const { busy, run } = useAction();
  if (loading && !data) return <Loading label="Reading today" />;
  if (error && !data) return <ErrorNote error={error} retry={reload} />;
  if (!data) return null;
  const pieces = (action: string, ids: string[], extra: Record<string, unknown> = {}) => run(`${action}:${ids.join(",")}`, () => api("/api/studio/pieces", { body: { action, ids, ...extra } }).then(reload), action === "confirm" ? "Confirmed" : action === "kill" ? "Killed" : "Done");
  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">{paris(data.now, "day")}</p>
          <h1 className="text-4xl">Today</h1>
        </div>
        {data.week.cards > 0 && (
          <Link href={`/studio/library?tab=week&week=${data.week.week}`} className="btn btn-accent">
            Next week waits: {data.week.cards} cards, {data.week.pieces} pieces →
          </Link>
        )}
      </div>
      <HealthStrip h={data.health} />

      {data.toConfirm.length > 0 && (
        <Section title="Confirm what goes out" count={data.toConfirm.length} action={<button className="btn btn-primary btn-sm" disabled={!!busy} onClick={() => pieces("confirm", data.toConfirm.map((p) => p.id))}>Confirm all</button>}>
          <p className="mb-3 text-sm text-ink-2">Approved on Sunday; in confirm mode each piece waits for this second tap before its slot.</p>
          <ul className="space-y-2">
            {data.toConfirm.map((p) => (
              <PieceRow key={p.id} p={p} showDay>
                <button className="btn btn-primary btn-sm" disabled={!!busy} onClick={() => pieces("confirm", [p.id])}>Confirm</button>
                <button className="btn btn-danger btn-sm" disabled={!!busy} onClick={() => confirm("Kill this piece? It won't be posted.") && pieces("kill", [p.id])}>Kill</button>
              </PieceRow>
            ))}
          </ul>
        </Section>
      )}

      <Section title="Post by hand" count={data.byHand.length}>
        {data.byHand.length === 0 ? <Empty>Nothing to post by hand right now.</Empty> : <ul className="space-y-2">{data.byHand.map((p) => <ByHand key={p.id} p={p} onDone={reload} />)}</ul>}
      </Section>

      <Section title="Replies" count={data.replies.length} action={<Link href="/studio/library?tab=replies" className="text-sm text-accent hover:underline">All replies</Link>}>
        {data.replies.length === 0 ? <Empty>No reply drafts wait for you.</Empty> : <ul className="space-y-2">{data.replies.slice(0, 8).map((r) => <ReplyCard key={r.id} r={r} onDone={reload} />)}</ul>}
      </Section>

      <Section title="Reminders" count={data.reminders.length} id="reminders">
        {data.reminders.length === 0 ? (
          <Empty>Nothing is due.</Empty>
        ) : (
          <ul className="space-y-2">
            {data.reminders.map((r) => (
              <li key={r.id} className={`panel p-3 ${r.urgent ? "border-rust/40" : ""}`}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{r.urgent && <span className="mr-1 text-rust">●</span>}{r.title}</p>
                    {r.body && <p className="mt-1 whitespace-pre-line text-sm text-ink-2">{r.body}</p>}
                    <p className="mt-1 text-xs text-ink-3">{paris(r.dueAt)} · {r.createdBy}</p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {r.link && <Link href={r.link} className="btn btn-sm">Open</Link>}
                    {(["hour", "evening", "tomorrow"] as const).map((s) => (
                      <button key={s} className="btn btn-quiet btn-sm" disabled={!!busy} onClick={() => run(`snooze:${r.id}`, () => api(`/api/studio/reminders/${r.id}`, { body: { action: "snooze", snooze: s } }).then(reload), "Snoozed")}>
                        {s === "hour" ? "1 h" : s === "evening" ? "Tonight" : "Tomorrow 09:00"}
                      </button>
                    ))}
                    <button className="btn btn-primary btn-sm" disabled={!!busy} onClick={() => run(`done:${r.id}`, () => api(`/api/studio/reminders/${r.id}`, { body: { action: "done" } }).then(reload), "Done")}>Done</button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {data.failed.length > 0 && (
        <Section title="Failed" count={data.failed.length}>
          <ul className="space-y-2">
            {data.failed.map((p) => (
              <PieceRow key={p.id} p={p} showDay>
                <button className="btn btn-sm" disabled={!!busy} onClick={() => pieces("reschedule", [p.id], { at: new Date(Date.now() + 10 * 60_000).toISOString() })}>Retry in 10 min</button>
                <button className="btn btn-danger btn-sm" disabled={!!busy} onClick={() => pieces("kill", [p.id])}>Kill</button>
              </PieceRow>
            ))}
          </ul>
        </Section>
      )}

      <Section title="Today's queue" count={data.timeline.length}>
        {data.timeline.length === 0 ? <Empty>Nothing is scheduled today.</Empty> : <ul className="space-y-2">{data.timeline.map((p) => <PieceRow key={p.id} p={p} />)}</ul>}
      </Section>
    </div>
  );
}

function ByHand({ p, onDone }: { p: PieceLine; onDone: () => Promise<void> }) {
  const [url, setUrl] = useState("");
  const { busy, run } = useAction();
  const media = p.media.find((m) => m.kind === "video") ?? p.media.find((m) => m.kind === "image");
  return (
    <PieceRow p={p} showDay>
      <div className="flex w-full flex-col gap-2 md:w-[420px]">
        <div className="flex flex-wrap gap-2">
          {media && <a className="btn btn-sm" href={`/api/studio/media/${media.id}?download=1`}>Download</a>}
          {p.caption && <CopyButton text={p.caption} label="Copy caption" />}
        </div>
        {p.platform === "tiktok" && <p className="text-xs text-ink-2">In TikTok, switch on “AI-generated content” before posting: the voice is a clone.</p>}
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void run(`posted:${p.id}`, () => api(`/api/studio/pieces/${p.id}`, { body: { action: "posted", url } }).then(onDone), "Marked as posted");
          }}
        >
          <input className="field" placeholder="Paste the post's address" value={url} onChange={(e) => setUrl(e.target.value)} inputMode="url" />
          <button className="btn btn-primary btn-sm shrink-0" disabled={!url || !!busy}>Posted</button>
        </form>
      </div>
    </PieceRow>
  );
}

export function ReplyCard({ r, onDone }: { r: ReplyLine; onDone: () => Promise<void> }) {
  const [text, setText] = useState(r.draft ?? "");
  const { busy, run } = useAction();
  const act = (action: "send" | "approve" | "skip") =>
    run(`${action}:${r.id}`, () => api<{ ok: boolean; dryRun?: boolean; error?: string }>(`/api/studio/replies/${r.id}`, { body: { action, text } }).then(async (res) => {
      await onDone();
      if (res && res.ok === false) throw new Error(res.error ?? "not sent");
      return res;
    }), (res) => (action === "send" ? (res?.dryRun ? "Sent (dry run: logged, not posted)" : "Sent") : action === "skip" ? "Skipped" : "Approved"));
  return (
    <li className={`panel p-3 ${r.flag !== "none" ? "border-rust/40" : ""}`}>
      <div className="flex flex-wrap items-center gap-1.5 text-xs text-ink-3">
        <span className="font-medium text-ink-2">{r.platform}</span> · {r.author ?? "someone"} · {paris(r.receivedAt)}
        {r.klass && <span className="chip">{r.klass}</span>}
        {r.flag !== "none" && <Status value="failed" label={`flag: ${r.flag}`} />}
        {r.status === "approved" && <Status value="approved" />}
      </div>
      <p className="mt-2 rounded-xl bg-ink/5 px-3 py-2 text-sm">“{r.theirText}”</p>
      {r.flagReason && <p className="mt-1 text-xs text-rust">{r.flagReason}</p>}
      <textarea className="field mt-2 min-h-[72px]" value={text} onChange={(e) => setText(e.target.value)} aria-label="Your reply" />
      <div className="mt-2 flex flex-wrap gap-2">
        <button className="btn btn-primary btn-sm" disabled={!text.trim() || !!busy} onClick={() => act("send")}>Send</button>
        <button className="btn btn-sm" disabled={!text.trim() || !!busy} onClick={() => act("approve")}>Approve for later</button>
        <button className="btn btn-quiet btn-sm" disabled={!!busy} onClick={() => act("skip")}>Skip</button>
        {r.pieceId && <Link className="btn btn-quiet btn-sm" href={`/studio/library/pieces/${r.pieceId}`}>The piece</Link>}
      </div>
    </li>
  );
}
