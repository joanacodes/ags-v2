"use client";
import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { Background, Controls, Handle, MiniMap, Position, ReactFlow, ReactFlowProvider, useReactFlow, type Edge, type Node, type NodeProps } from "@xyflow/react";
import { api, useApi } from "@/components/studio/api";
import { HealthStrip } from "@/components/studio/health";
import { NodeDrawer } from "@/components/studio/node-drawer";
import { Dot, ErrorNote, Loading, useAction } from "@/components/studio/ui";
import type { MapNode, MapView } from "@/studio/views/map";

const W = 212;
const H = 122;
const KIND_GLYPH: Record<string, string> = { brand: "☉", group: "◇", input: "↘", agent: "✦", gate: "▣", renderer: "▶", outbox: "➶", platform: "◦", library: "□", reminders: "◔" };

type StudioNodeData = { node: MapNode; open: (id: string) => void; toggle: (id: string) => void; hasChildren: boolean; collapsed: boolean };

function StudioNode({ data }: NodeProps<Node<StudioNodeData>>) {
  const n = data.node;
  return (
    <div
      className={`w-[212px] rounded-2xl border bg-card p-3 text-left shadow-soft transition ${n.status === "failed" ? "border-rust/50" : n.status === "waiting" ? "border-gold/60" : "border-line"} ${n.status === "off" ? "opacity-60" : ""}`}
      onDoubleClick={() => data.open(n.id)}
      onKeyDown={(e) => e.key === "Enter" && data.open(n.id)}
    >
      <Handle type="target" position={Position.Left} className="!h-2 !w-2 !border-0 !bg-ink/30" />
      <div className="flex items-center gap-2">
        <span className="font-serif text-base text-ink-3" aria-hidden="true">{KIND_GLYPH[n.kind] ?? "·"}</span>
        <span className="truncate font-medium">{n.label}</span>
        <span className="ml-auto"><Dot status={n.status} title={n.statusNote ?? n.status} /></span>
      </div>
      <dl className="mt-2 grid grid-cols-3 gap-1">
        {n.stats.slice(0, 3).map((s) => (
          <div key={s.label} className="min-w-0">
            <dt className="truncate text-[9px] uppercase tracking-wider text-ink-3">{s.label}</dt>
            <dd className="truncate text-xs font-medium">{s.value}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-2 flex items-center gap-1">
        <button className="btn btn-sm min-h-[26px] px-2 text-[11px]" onClick={() => data.open(n.id)}>Settings</button>
        {data.hasChildren && (
          <button className="btn btn-quiet btn-sm min-h-[26px] px-2 text-[11px]" onClick={() => data.toggle(n.id)}>{data.collapsed ? "Show" : "Fold"}</button>
        )}
      </div>
      <Handle type="source" position={Position.Right} className="!h-2 !w-2 !border-0 !bg-ink/30" />
    </div>
  );
}

const nodeTypes = { studio: StudioNode };
const MINI: Record<string, string> = { failed: "#a8322a", waiting: "#c98a2e", running: "#2f5d8a", off: "#c9c6bd", ok: "#4f7a45" };

/**
 * The default layout: the pipeline left to right (brand, inputs, agents, gate, renderers, outbox, the
 * platforms in two columns), each group's members stacked under it; the library and reminders under the
 * brand. Computed from the node list, so a new node finds its place without a layout library.
 */
const COLUMN: Record<string, number> = { brand: 0, library: 0, reminders: 0, inputs: 1, agents: 2, gate: 3, renderers: 4, outbox: 5 };
function layout(nodes: readonly MapNode[], hidden: ReadonlySet<string>): Map<string, { x: number; y: number }> {
  const out = new Map<string, { x: number; y: number }>();
  const colX = (c: number) => c * (W + 70);
  const rowY = (r: number) => r * (H + 28);
  out.set("brand", { x: colX(0), y: rowY(1) });
  out.set("library", { x: colX(0), y: rowY(3) });
  out.set("reminders", { x: colX(0), y: rowY(4) });
  for (const group of ["inputs", "agents", "renderers"]) {
    const c = COLUMN[group]!;
    out.set(group, { x: colX(c), y: rowY(0) });
    nodes.filter((n) => n.parent === group && !hidden.has(n.id)).forEach((n, i) => out.set(n.id, { x: colX(c), y: rowY(i + 1) }));
  }
  out.set("gate", { x: colX(COLUMN["gate"]!), y: rowY(2) });
  out.set("outbox", { x: colX(COLUMN["outbox"]!), y: rowY(2) });
  nodes.filter((n) => n.parent === "outbox" && !hidden.has(n.id)).forEach((n, i) => out.set(n.id, { x: colX(6 + (i % 2)), y: rowY(Math.floor(i / 2)) }));
  return out;
}

function Flow({ view, reload }: { view: MapView; reload: () => Promise<void> }) {
  const { setCenter, getNode } = useReactFlow();
  const narrow = typeof window !== "undefined" && window.innerWidth < 768;
  const [folded, setFolded] = useState<Set<string>>(() => new Set(view.nodes.filter((n) => n.collapsed || (narrow && n.id === "outbox" && !view.nodes.find((x) => x.id === "outbox")?.position)).map((n) => n.id)));
  const [open, setOpen] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const { run } = useAction();

  const hidden = useMemo(() => {
    const h = new Set<string>();
    const hide = (id: string) => view.nodes.filter((n) => n.parent === id).forEach((c) => (h.add(c.id), hide(c.id)));
    folded.forEach(hide);
    return h;
  }, [folded, view.nodes]);
  const auto = useMemo(() => layout(view.nodes, hidden), [view.nodes, hidden]);
  const toggle = useCallback((id: string) => {
    setFolded((f) => {
      const next = new Set(f);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      const n = view.nodes.find((x) => x.id === id);
      void api(`/api/studio/nodes/${id}`, { body: { x: n?.position?.x ?? 0, y: n?.position?.y ?? 0, collapsed: next.has(id) } }).catch(() => undefined);
      return next;
    });
  }, [view.nodes]);

  const nodes: Node<StudioNodeData>[] = view.nodes
    .filter((n) => !hidden.has(n.id))
    .map((n) => ({
      id: n.id,
      type: "studio",
      position: n.position ?? auto.get(n.id) ?? { x: 0, y: 0 },
      data: { node: n, open: setOpen, toggle, hasChildren: view.nodes.some((c) => c.parent === n.id), collapsed: folded.has(n.id) },
      focusable: true,
      width: W,
      height: H,
      ariaLabel: `${n.label}: ${n.status}`,
    }));
  const visible = new Set(nodes.map((n) => n.id));
  const edges: Edge[] = view.edges
    .filter((e) => visible.has(e.from) && visible.has(e.to))
    .map((e) => ({
      id: e.id,
      source: e.from,
      target: e.to,
      type: e.flow ? "smoothstep" : "default",
      animated: e.animated,
      label: e.label ?? undefined,
      labelBgPadding: [6, 3] as [number, number],
      labelBgBorderRadius: 8,
      labelStyle: { fontSize: 11, fill: "#474e44" },
      labelBgStyle: { fill: "#faf9f5" },
      style: e.flow ? { stroke: "#b5512c", strokeWidth: 1.4, strokeDasharray: e.animated ? undefined : "0" } : { stroke: "rgba(28,33,27,.22)", strokeWidth: 1 },
      data: { library: e.library },
    }));

  const focus = (text: string) => {
    const hit = view.nodes.find((n) => n.label.toLowerCase().includes(text.toLowerCase()));
    if (!hit) return;
    const n = getNode(hit.id);
    if (n) void setCenter(n.position.x + W / 2, n.position.y + H / 2, { zoom: 1.1, duration: 400 });
  };

  return (
    <div className="relative h-[calc(100vh-260px)] min-h-[480px] overflow-hidden rounded-2xl border border-line bg-[#efece3]">
      <div className="absolute left-3 right-3 top-3 z-10 flex flex-wrap gap-2">
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            focus(query);
          }}
        >
          <input className="field w-44 bg-card" placeholder="Find a node" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Find a node" />
        </form>
        <button className="btn btn-sm bg-card" onClick={() => run("reset", () => api("/api/studio/nodes", { method: "DELETE" }).then(reload), "Layout reset")}>Reset layout</button>
      </div>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.08, minZoom: 0.5 }}
        minZoom={0.2}
        maxZoom={1.6}
        nodesConnectable={false}
        onNodeDragStop={(_, n) => void api(`/api/studio/nodes/${n.id}`, { body: { x: n.position.x, y: n.position.y, collapsed: folded.has(n.id) } }).catch(() => undefined)}
        onEdgeClick={(_, e) => {
          const link = (e.data as { library?: string | null } | undefined)?.library;
          if (link) window.location.assign(link);
        }}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={24} color="rgba(28,33,27,.08)" />
        {!narrow && <MiniMap pannable zoomable nodeColor={(n) => MINI[(n.data as StudioNodeData).node.status] ?? "#4f7a45"} nodeStrokeWidth={0} nodeBorderRadius={8} maskColor="rgba(28,33,27,.08)" bgColor="#faf9f5" style={{ width: 180, height: 110 }} />}
        <Controls showInteractive={false} />
      </ReactFlow>
      <NodeDrawer node={open ? (view.nodes.find((n) => n.id === open) ?? null) : null} onClose={() => setOpen(null)} onChanged={() => void reload()} />
    </div>
  );
}

export function MapScreen() {
  const { data, error, loading, reload } = useApi<MapView>("/api/studio/map", 30_000);
  if (loading && !data) return <Loading label="Drawing the Map" />;
  if (error && !data) return <ErrorNote error={error} retry={reload} />;
  if (!data) return null;
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">The whole Studio</p>
          <h1 className="text-4xl">Map</h1>
        </div>
        <p className="max-w-md text-sm text-ink-2">Each node opens its settings. A red dot needs you; amber waits for you; blue is running. An edge opens what flowed through it this week in the <Link href="/studio/library" className="text-accent hover:underline">Library</Link>.</p>
      </div>
      <HealthStrip h={data.health} />
      <div className="mt-4">
        <ReactFlowProvider>
          <Flow view={data} reload={reload} />
        </ReactFlowProvider>
      </div>
    </div>
  );
}
