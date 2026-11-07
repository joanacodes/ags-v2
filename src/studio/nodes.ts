/**
 * The Studio drawn as a tree: the Map's nodes, their kinds, their parents and the workers behind them.
 * The Map lays itself out from this (by depth and order), and every node's settings are keyed by its id.
 */
import { PLATFORMS, PLATFORM_LABELS, type Platform } from "./types";

export const WORKERS = ["strategist", "community", "analyst", "metrics", "render", "publish", "sky", "sources", "maintenance"] as const;
export type WorkerId = (typeof WORKERS)[number];

export type NodeKind = "brand" | "group" | "input" | "agent" | "gate" | "renderer" | "outbox" | "platform" | "library" | "reminders";

export interface NodeDef {
  readonly id: string;
  readonly label: string;
  readonly kind: NodeKind;
  readonly parent: string | null;
  /** The worker that runs when the owner taps "Run now" on this node. */
  readonly worker?: WorkerId;
  readonly blurb: string;
}

const platformNodes: NodeDef[] = PLATFORMS.map((p: Platform) => ({
  id: `platform-${p}`,
  label: PLATFORM_LABELS[p],
  kind: "platform" as const,
  parent: "outbox",
  blurb: p === "tiktok" || p === "substack" || p === "medium" ? "Posted by hand from Today" : p === "site" ? "Draft pull requests" : "Posted through its own API",
}));

export const NODES: readonly NodeDef[] = [
  { id: "brand", label: "Brand", kind: "brand", parent: null, blurb: "The kit every agent reads first" },
  { id: "inputs", label: "Inputs", kind: "group", parent: "brand", blurb: "What the agents read" },
  { id: "input-study", label: "Study data", kind: "input", parent: "inputs", blurb: "Tests and scores by src, the cap, the orders" },
  { id: "input-site", label: "Site and sky", kind: "input", parent: "inputs", worker: "sources", blurb: "Pages, hook bank, sky table, calendar" },
  { id: "input-metrics", label: "Metrics", kind: "input", parent: "inputs", worker: "metrics", blurb: "Nightly numbers from every platform" },
  { id: "agents", label: "Agents", kind: "group", parent: "brand", blurb: "Who writes, who answers, who counts" },
  { id: "strategist", label: "Strategist", kind: "agent", parent: "agents", worker: "strategist", blurb: "Plans the week's cards on Sunday" },
  { id: "writer-en", label: "Writer EN", kind: "agent", parent: "agents", worker: "strategist", blurb: "Writes every English piece" },
  { id: "writer-fr", label: "Writer FR", kind: "agent", parent: "agents", worker: "strategist", blurb: "Writes every French piece, never translated" },
  { id: "community", label: "Community", kind: "agent", parent: "agents", worker: "community", blurb: "Sorts comments and drafts replies" },
  { id: "analyst", label: "Analyst", kind: "agent", parent: "agents", worker: "analyst", blurb: "Friday's scorecard and next week's ideas" },
  { id: "gate", label: "Gate", kind: "gate", parent: "brand", blurb: "Text checks, media checks" },
  { id: "renderers", label: "Renderers", kind: "group", parent: "brand", blurb: "Pictures and videos, made by code" },
  { id: "render-pictures", label: "Pictures", kind: "renderer", parent: "renderers", worker: "render", blurb: "Carousels, pins, stills, stories" },
  { id: "render-video", label: "Video", kind: "renderer", parent: "renderers", worker: "render", blurb: "The engine: voice, captions, meadow" },
  { id: "outbox", label: "Outbox", kind: "outbox", parent: "brand", worker: "publish", blurb: "Posts only what the owner approved" },
  ...platformNodes,
  { id: "library", label: "Library", kind: "library", parent: "brand", blurb: "Everything made and held" },
  { id: "reminders", label: "Reminders", kind: "reminders", parent: "brand", blurb: "What needs the owner, and when" },
];

export function nodeById(id: string): NodeDef | undefined {
  return NODES.find((n) => n.id === id);
}

export function childrenOf(id: string): NodeDef[] {
  return NODES.filter((n) => n.parent === id);
}

/** Which node a worker's runs belong to (for the Map's "last run" and "cost this week"). */
export const WORKER_NODE: Readonly<Record<WorkerId, string>> = {
  strategist: "strategist",
  community: "community",
  analyst: "analyst",
  metrics: "input-metrics",
  render: "renderers",
  publish: "outbox",
  sky: "input-site",
  sources: "input-site",
  maintenance: "library",
};
