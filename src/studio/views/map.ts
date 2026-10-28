/**
 * The Map's state, computed on the server from the tables: every node's status dot, its three numbers,
 * its last and next run; every edge's live count. The screen polls this every 30 seconds.
 */
import type { AgentContext } from "../agents/context";
import { NODES, type NodeDef, type WorkerId } from "../nodes";
import { CONNECTION_OF } from "../outbox/types";
import { nextRun, parseCron } from "../schedule/cron";
import { schedules } from "../schedule/tick";
import type { PostRow, RunRow } from "../store/rows";
import { monthStart, nextWeek, parisWeek, weekStart } from "../time";
import { PLATFORMS, type Platform } from "../types";
import { health, type Health } from "./health";
import { mediaNeed } from "../render/need";

export type NodeStatus = "off" | "ok" | "running" | "waiting" | "failed";

export interface MapNode extends NodeDef {
  readonly status: NodeStatus;
  readonly statusNote: string | null;
  readonly stats: readonly { readonly label: string; readonly value: string }[];
  readonly enabled: boolean;
  readonly lastRun: { readonly at: string; readonly outcome: string; readonly url: string | null } | null;
  readonly nextRun: string | null;
  readonly position: { readonly x: number; readonly y: number } | null;
  readonly collapsed: boolean;
}

export interface MapEdge {
  readonly id: string;
  readonly from: string;
  readonly to: string;
  readonly label: string | null;
  readonly animated: boolean;
  readonly flow: boolean;
  readonly library: string | null;
}

export interface MapView {
  readonly nodes: readonly MapNode[];
  readonly edges: readonly MapEdge[];
  readonly health: Health;
}

const money = (n: number) => `$${n.toFixed(2)}`;
const when = (iso: string | null | undefined) =>
  iso ? new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Paris", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso)) : "—";

const SETTINGS_NODE: Readonly<Record<string, string>> = {
  "input-study": "input-study",
  "input-site": "input-site",
  "input-metrics": "input-metrics",
  strategist: "strategist",
  "writer-en": "writer-en",
  "writer-fr": "writer-fr",
  community: "community",
  analyst: "analyst",
  gate: "gate",
  "render-pictures": "render-pictures",
  "render-video": "render-video",
  outbox: "outbox",
  library: "library",
  reminders: "reminders",
};

export async function mapView(ctx: AgentContext): Promise<MapView> {
  const { store, settings, now } = ctx;
  const week = parisWeek(now);
  const weekFrom = weekStart(now).toISOString();
  const [h, runs, positions, postsWeek, queuedAll, approvedAll, connections, replies, remindersDue, cardsWeek, nextCards, tts, sources, sky] = await Promise.all([
    health(ctx),
    store.runs({ since: new Date(now.getTime() - 35 * 86400_000).toISOString(), limit: 3000 }),
    store.nodePositions(),
    store.posts({ scheduledFrom: weekFrom, scheduledTo: new Date(Date.parse(weekFrom) + 7 * 86400_000).toISOString(), limit: 3000 }),
    store.posts({ statuses: ["queued"], limit: 500 }),
    store.posts({ statuses: ["approved"], limit: 1000 }),
    store.connections(),
    store.replies({ statuses: ["draft"], limit: 500 }),
    store.reminders({ statuses: ["scheduled", "sent"], dueBefore: now.toISOString(), limit: 500 }),
    store.cards({ weeks: [week] }),
    store.cards({ weeks: [nextWeek(week)] }),
    store.ttsSince(monthStart(now).toISOString()),
    store.sources({ limit: 5000 }),
    store.sky({ from: now.toISOString().slice(0, 10), to: new Date(now.getTime() + 30 * 86400_000).toISOString().slice(0, 10) }),
  ]);
  const tests = await store.studySessions({ from: weekFrom, to: now.toISOString() }).catch(() => []);
  const lastOf = (agent: string): RunRow | undefined => runs.filter((r) => r.agent === agent).sort((a, b) => b.started_at.localeCompare(a.started_at))[0];
  const costOf = (agent: string) => runs.filter((r) => r.agent === agent && r.started_at >= weekFrom).reduce((n, r) => n + r.cost_usd, 0);
  const crons = new Map(schedules(settings).map((s) => [s.worker, s.cron]));
  const nextOf = (worker?: WorkerId) => {
    const cron = worker ? crons.get(worker) : undefined;
    if (!cron) return null;
    try {
      return nextRun(parseCron(cron), now)?.toISOString() ?? null;
    } catch {
      return null;
    }
  };
  const running = (agent: string) => {
    const r = lastOf(agent);
    return !!r && r.outcome === "running" && now.getTime() - Date.parse(r.started_at) < 90 * 60_000;
  };
  const pos = new Map(positions.map((p) => [p.node, p]));
  const enabledOf = (id: string): boolean => {
    if (id.startsWith("platform-")) return settings.platform(id.slice(9) as Platform).enabled;
    const key = SETTINGS_NODE[id];
    if (!key) return true;
    const s = settings.raw(key);
    return s["enabled"] === undefined ? true : s["enabled"] !== false;
  };
  const postedWeek = postsWeek.filter((p) => p.status === "posted");
  const gateFails = postsWeek.filter((p) => p.gate && !p.gate.ok);
  const waitingDraftCards = nextCards.filter((c) => c.status === "draft").length;
  const mediaQueue = approvedAll.filter((p) => mediaNeed(p) !== null);
  const renderedLastNight = runs.filter((r) => r.agent === "render" && now.getTime() - Date.parse(r.started_at) < 30 * 3600_000).reduce((n, r) => n + Number((r.wrote as Record<string, number>)["studio_posts"] ?? 0), 0);

  const state = (def: NodeDef): Omit<MapNode, keyof NodeDef | "position" | "collapsed"> => {
    const enabled = enabledOf(def.id);
    const off = { enabled, status: "off" as NodeStatus, statusNote: "turned off in Settings", lastRun: null, nextRun: null };
    const base = (agent: string | undefined, stats: MapNode["stats"], waiting: string | null = null) => {
      const last = agent ? lastOf(agent) : undefined;
      const status: NodeStatus = !enabled ? "off" : agent && running(agent) ? "running" : last?.outcome === "failed" ? "failed" : waiting ? "waiting" : "ok";
      return {
        enabled,
        status,
        statusNote: status === "failed" ? (last?.error ?? "the last run failed") : status === "waiting" ? waiting : null,
        stats,
        lastRun: last ? { at: last.started_at, outcome: last.outcome, url: last.log_url } : null,
        nextRun: enabled ? nextOf(def.worker) : null,
      };
    };
    switch (def.kind) {
      case "agent": {
        if (def.id === "writer-en" || def.id === "writer-fr") {
          const lang = def.id === "writer-en" ? "en" : "fr";
          const mine = postsWeek.filter((p) => p.language === lang);
          return base(def.id, [
            { label: "pieces this week", value: String(mine.length) },
            { label: "gate failures", value: String(mine.filter((p) => p.gate && !p.gate.ok).length) },
            { label: "cost this week", value: money(costOf(def.id)) },
          ]);
        }
        const waiting = def.id === "strategist" && waitingDraftCards ? `${waitingDraftCards} cards wait for approval` : def.id === "community" && replies.length ? `${replies.length} reply drafts wait` : null;
        return base(def.id, [
          { label: "last run", value: when(lastOf(def.id)?.started_at) },
          { label: "next run", value: when(nextOf(def.worker)) },
          { label: "cost this week", value: money(costOf(def.id)) },
        ], waiting);
      }
      case "input":
        if (def.id === "input-study") return { ...base(undefined, [{ label: "source", value: "AGS study_sessions" }, { label: "read by", value: "strategist, analyst" }, { label: "window", value: `${settings.get("input-study").weeks} week(s)` }]) };
        if (def.id === "input-site") return base("sources", [{ label: "pages", value: String(sources.length) }, { label: "sky events (30 days)", value: String(sky.length) }, { label: "next read", value: when(nextOf("sources")) }]);
        return base("metrics", [{ label: "last run", value: when(lastOf("metrics")?.started_at) }, { label: "posts read last night", value: String(Number((lastOf("metrics")?.wrote as Record<string, number> | undefined)?.["studio_metrics"] ?? 0)) }, { label: "next run", value: when(nextOf("metrics")) }]);
      case "gate": {
        const byCheck = new Map<string, number>();
        for (const p of gateFails) for (const f of p.gate?.failures ?? []) byCheck.set(f.check, (byCheck.get(f.check) ?? 0) + 1);
        const top = [...byCheck.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2);
        return base(undefined, [{ label: "failures this week", value: String(gateFails.length) }, ...top.map(([k, n]) => ({ label: k, value: String(n) }))], gateFails.length ? `${gateFails.length} pieces failed a check` : null);
      }
      case "renderer":
        return base("render", def.id === "render-video"
          ? [{ label: "queue", value: String(mediaQueue.filter((p) => mediaNeed(p) === "video").length) }, { label: "rendered last night", value: String(renderedLastNight) }, { label: "voice minutes", value: `${(tts.durationMs / 60000).toFixed(1)} / ${settings.get("render-video").minutes_cap}` }]
          : [{ label: "queue", value: String(mediaQueue.filter((p) => mediaNeed(p) === "picture").length) }, { label: "rendered last night", value: String(renderedLastNight) }, { label: "next run", value: when(nextOf("render")) }]);
      case "outbox":
        return base("publish", [{ label: "queued", value: String(queuedAll.length) }, { label: "posted this week", value: String(postedWeek.length) }, { label: "mode", value: `${h.live ? "live" : "dry run"} · ${settings.get("global").scheduling_mode}` }], queuedAll.some((p) => p.by_hand || settings.postingMode(p.platform) !== "api") ? "pieces wait to be posted by hand" : null);
      case "platform": {
        const platform = def.id.slice(9) as Platform;
        const conn = connections.find((c) => c.platform === (CONNECTION_OF[platform] ?? platform));
        const mode = settings.postingMode(platform);
        const expiry = conn?.expires_at ?? null;
        const expiring = !!expiry && Date.parse(expiry) - now.getTime() < 7 * 86400_000;
        const mine = (s: PostRow["status"]) => postsWeek.filter((p) => p.platform === platform && p.status === s).length;
        const stats = [
          { label: "queued", value: String(queuedAll.filter((p) => p.platform === platform).length) },
          { label: "posted this week", value: String(mine("posted")) },
          { label: mode === "api" ? "token" : "how", value: mode === "api" ? (conn ? (expiry ? `until ${expiry.slice(0, 10)}` : conn.status) : "not connected") : mode === "postly" ? "through Postly" : mode === "inbox" ? "TikTok inbox" : "by hand" },
        ];
        if (!enabled) return { ...off, stats };
        const failed = postsWeek.some((p) => p.platform === platform && p.status === "failed");
        // Through Postly, the network's own token doesn't matter; Postly's key and channel do.
        const postlyMissing = mode === "postly" && (!(process.env.POSTLY_API_KEY ?? "").trim() || !settings.get("postly").channels[platform]);
        const tokenMissing = mode === "api" && (!conn || conn.status === "expired" || conn.status === "disconnected");
        const status: NodeStatus = tokenMissing || postlyMissing || (mode === "api" && expiring) || failed ? "failed" : queuedAll.some((p) => p.platform === platform) && (mode === "by_hand" || mode === "inbox") ? "waiting" : "ok";
        return {
          enabled,
          status,
          statusNote: status === "failed" ? (postlyMissing ? "Postly isn't set up for it: Settings → Connections" : tokenMissing && !conn ? "not connected" : mode === "api" && expiring ? `the token ends ${expiry?.slice(0, 10)}` : tokenMissing ? "not connected" : "a post failed this week") : null,
          stats,
          lastRun: null,
          nextRun: null,
        };
      }
      case "library": {
        const count = (s: PostRow["status"]) => postsWeek.filter((p) => p.status === s).length;
        return base("maintenance", [{ label: "draft", value: String(count("draft")) }, { label: "approved", value: String(count("approved") + count("rendered")) }, { label: "posted", value: String(count("posted")) }]);
      }
      case "reminders":
        return base(undefined, [{ label: "due now", value: String(remindersDue.length) }, { label: "urgent", value: String(remindersDue.filter((r) => r.urgent).length) }, { label: "quiet", value: `${settings.get("reminders").quiet_start}–${settings.get("reminders").quiet_end}` }], remindersDue.length ? `${remindersDue.length} reminders due` : null);
      case "brand":
        return base(undefined, [{ label: "kit", value: `version ${ctx.kitVersion}` }, { label: "cards this week", value: String(cardsWeek.length) }, { label: "spend this week", value: `${money(h.spend.spent)} / ${money(h.spend.cap)}` }]);
      default:
        return base(undefined, []);
    }
  };

  const nodes: MapNode[] = NODES.map((def) => {
    const p = pos.get(def.id);
    return { ...def, ...state(def), position: p ? { x: p.x, y: p.y } : null, collapsed: p?.collapsed ?? false };
  });

  const count = (filter: (p: PostRow) => boolean) => postsWeek.filter(filter).length;
  const flows: MapEdge[] = [
    { id: "f-study-strategist", from: "input-study", to: "strategist", label: tests.length ? `${tests.length} tests` : null, animated: false, flow: true, library: null },
    { id: "f-site-strategist", from: "input-site", to: "strategist", label: sources.length ? `${sources.length} pages` : null, animated: running("sources"), flow: true, library: "/studio/library?tab=sky" },
    { id: "f-metrics-analyst", from: "input-metrics", to: "analyst", label: postedWeek.length ? `${postedWeek.length} posts read` : null, animated: running("metrics"), flow: true, library: "/studio/library?tab=scorecards" },
    { id: "f-strategist-en", from: "strategist", to: "writer-en", label: `${cardsWeek.filter((c) => c.language !== "fr").length} cards`, animated: running("strategist"), flow: true, library: `/studio/library?tab=cards&week=${week}` },
    { id: "f-strategist-fr", from: "strategist", to: "writer-fr", label: `${cardsWeek.filter((c) => c.language !== "en").length} cards`, animated: running("strategist"), flow: true, library: `/studio/library?tab=cards&week=${week}` },
    { id: "f-en-gate", from: "writer-en", to: "gate", label: `${count((p) => p.language === "en")} pieces`, animated: running("writer-en"), flow: true, library: `/studio/library?tab=pieces&week=${week}&language=en` },
    { id: "f-fr-gate", from: "writer-fr", to: "gate", label: `${count((p) => p.language === "fr")} pieces`, animated: running("writer-fr"), flow: true, library: `/studio/library?tab=pieces&week=${week}&language=fr` },
    { id: "f-gate-pictures", from: "gate", to: "render-pictures", label: `${count((p) => mediaNeed(p) === "picture")} pictures`, animated: running("render"), flow: true, library: `/studio/library?tab=media&week=${week}` },
    { id: "f-gate-video", from: "gate", to: "render-video", label: `${count((p) => mediaNeed(p) === "video")} videos`, animated: running("render"), flow: true, library: `/studio/library?tab=media&week=${week}` },
    { id: "f-pictures-outbox", from: "render-pictures", to: "outbox", label: `${count((p) => mediaNeed(p) === "picture" && (p.status === "rendered" || p.status === "posted"))} ready`, animated: running("publish"), flow: true, library: `/studio/library?tab=media&week=${week}` },
    { id: "f-video-outbox", from: "render-video", to: "outbox", label: `${count((p) => mediaNeed(p) !== null && (p.status === "rendered" || p.status === "posted"))} ready`, animated: running("publish"), flow: true, library: `/studio/library?tab=pieces&week=${week}&status=rendered` },
    ...PLATFORMS.map((p) => {
      const n = count((x) => x.platform === p && x.status === "posted");
      return { id: `f-outbox-${p}`, from: "outbox", to: `platform-${p}`, label: n ? `${n} posts` : null, animated: running("publish"), flow: true, library: `/studio/library?tab=pieces&week=${week}&platform=${p}` };
    }),
    { id: "f-community-reminders", from: "community", to: "reminders", label: replies.length ? `${replies.length} drafts` : null, animated: running("community"), flow: true, library: "/studio/library?tab=replies" },
  ];
  // Only what flows is drawn: the columns already say which node belongs to which group.
  return { nodes, edges: flows.map((e) => (e.label && /^0 /.test(e.label) ? { ...e, label: null } : e)), health: h };
}

