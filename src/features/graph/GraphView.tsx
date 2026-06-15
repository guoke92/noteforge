// =====================================================================
//  Lightweight force-directed graph using SVG (no external dep).
//  Suitable for the ≤ a few hundred-node visualisation use-case
//  outlined in the UI spec (E1).
// =====================================================================

import { useEffect, useMemo, useRef, useState } from "react";
import { Maximize, Minus, Plus, Search } from "lucide-react";
import type { GraphEdge, GraphNode, KnowledgeGraph } from "@/types";
import { knowledge } from "@/ipc";
import { useEditorStore } from "@/store/editor";
import { useWorkspaceStore } from "@/store/workspace";
import { Button } from "@/components/ui/Button";

interface SimNode extends GraphNode {
  x: number;
  y: number;
  vx: number;
  vy: number;
  fixed?: boolean;
}

interface SimEdge extends Omit<GraphEdge, "source" | "target"> {
  source: SimNode;
  target: SimNode;
}

function tick(nodes: SimNode[], edges: SimEdge[], width: number, height: number) {
  const k = 0.005;
  const repulsion = 1800;
  const linkDist = 80;
  const linkStrength = 0.08;
  const damping = 0.85;

  // Repulsion
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i];
      const b = nodes[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d2 = dx * dx + dy * dy + 0.1;
      const f = repulsion / d2;
      const dx_norm = dx / Math.sqrt(d2);
      const dy_norm = dy / Math.sqrt(d2);
      a.vx -= dx_norm * f * 0.001;
      a.vy -= dy_norm * f * 0.001;
      b.vx += dx_norm * f * 0.001;
      b.vy += dy_norm * f * 0.001;
    }
  }
  // Link attraction
  for (const e of edges) {
    const dx = e.target.x - e.source.x;
    const dy = e.target.y - e.source.y;
    const d = Math.sqrt(dx * dx + dy * dy) || 0.1;
    const diff = d - linkDist;
    const fx = (dx / d) * diff * linkStrength;
    const fy = (dy / d) * diff * linkStrength;
    e.source.vx += fx;
    e.source.vy += fy;
    e.target.vx -= fx;
    e.target.vy -= fy;
  }
  // Center gravity
  for (const n of nodes) {
    n.vx += (width / 2 - n.x) * k;
    n.vy += (height / 2 - n.y) * k;
    n.vx *= damping;
    n.vy *= damping;
    if (!n.fixed) {
      n.x += n.vx;
      n.y += n.vy;
    }
    // Boundary
    n.x = Math.max(20, Math.min(width - 20, n.x));
    n.y = Math.max(20, Math.min(height - 20, n.y));
  }
}

export function GraphView() {
  const ws = useWorkspaceStore((s) => s.current);
  const [graph, setGraph] = useState<KnowledgeGraph | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [zoom, setZoom] = useState(1);
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const openFile = useEditorStore((s) => s.openFile);

  useEffect(() => {
    if (!ws) return;
    knowledge.getGraph(ws.id).then(setGraph);
  }, [ws]);

  const { simNodes, simEdges } = useMemo(() => {
    if (!graph) return { simNodes: [] as SimNode[], simEdges: [] as SimEdge[] };
    const rect = containerRef.current?.getBoundingClientRect();
    const w = rect?.width || 600;
    const h = rect?.height || 400;
    const visible = filter
      ? graph.nodes.filter((n) => n.label.toLowerCase().includes(filter.toLowerCase()))
      : graph.nodes;
    const visibleIds = new Set(visible.map((n) => n.id));

    const sn: SimNode[] = visible.map((n, i) => ({
      ...n,
      x: w / 2 + Math.cos((i / visible.length) * Math.PI * 2) * 120,
      y: h / 2 + Math.sin((i / visible.length) * Math.PI * 2) * 120,
      vx: 0,
      vy: 0,
    }));
    const map = new Map(sn.map((n) => [n.id, n]));
    const se: SimEdge[] = graph.edges
      .filter((e) => visibleIds.has(e.source) && visibleIds.has(e.target))
      .map((e) => ({ ...e, source: map.get(e.source)!, target: map.get(e.target)! }));
    return { simNodes: sn, simEdges: se };
  }, [graph, filter]);

  // run simulation
  useEffect(() => {
    if (!simNodes.length) return;
    const rect = containerRef.current?.getBoundingClientRect();
    const w = rect?.width || 600;
    const h = rect?.height || 400;
    let iter = 0;
    const handle = setInterval(() => {
      tick(simNodes, simEdges, w, h);
      iter++;
      // force re-render
      svgRef.current?.querySelectorAll<SVGGElement>("g.node").forEach((el, i) => {
        const n = simNodes[i];
        if (n) el.setAttribute("transform", `translate(${n.x},${n.y})`);
      });
      svgRef.current?.querySelectorAll<SVGLineElement>("line.edge").forEach((el, i) => {
        const e = simEdges[i];
        if (!e) return;
        el.setAttribute("x1", String(e.source.x));
        el.setAttribute("y1", String(e.source.y));
        el.setAttribute("x2", String(e.target.x));
        el.setAttribute("y2", String(e.target.y));
      });
      if (iter > 300) clearInterval(handle);
    }, 30);
    return () => clearInterval(handle);
  }, [simNodes, simEdges]);

  return (
    <div ref={containerRef} className="relative flex h-full w-full flex-col bg-bg-primary">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2 border-b border-border bg-bg-secondary px-2 py-1.5">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 text-xs text-text-secondary">
            <Search size={12} />
            <input
              placeholder="筛选节点..."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="input h-6 w-40"
            />
          </div>
          <span className="text-xs text-text-tertiary">
            {simNodes.length} 节点 · {simEdges.length} 边
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Button size="icon" variant="ghost" onClick={() => setZoom((z) => Math.max(0.5, z - 0.1))}>
            <Minus size={13} />
          </Button>
          <span className="w-10 text-center text-xs">{Math.round(zoom * 100)}%</span>
          <Button size="icon" variant="ghost" onClick={() => setZoom((z) => Math.min(2.5, z + 0.1))}>
            <Plus size={13} />
          </Button>
          <Button size="icon" variant="ghost" onClick={() => setZoom(1)} title="重置">
            <Maximize size={13} />
          </Button>
        </div>
      </div>

      {/* Empty state */}
      {(!graph || simNodes.length === 0) && (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 text-center text-sm text-text-secondary">
          <div className="text-text-tertiary">📌</div>
          <div className="font-medium text-text-primary">当前知识库尚未建立双向链接</div>
          <div className="text-xs">
            编辑 Markdown 时使用 <code className="rounded-sm bg-bg-tertiary px-1">[[文件名]]</code>{" "}
            创建链接
          </div>
        </div>
      )}

      {/* Graph */}
      <svg
        ref={svgRef}
        className="flex-1"
        viewBox={`0 0 ${containerRef.current?.clientWidth || 600} ${
          containerRef.current?.clientHeight || 400
        }`}
        style={{ transform: `scale(${zoom})`, transformOrigin: "center" }}
      >
        <g>
          {simEdges.map((e, i) => (
            <line
              key={i}
              className="edge"
              x1={e.source.x}
              y1={e.source.y}
              x2={e.target.x}
              y2={e.target.y}
              stroke="var(--color-border)"
              strokeWidth={1}
              opacity={selected && e.source.id !== selected && e.target.id !== selected ? 0.2 : 0.7}
            />
          ))}
          {simNodes.map((n, i) => {
            const isSelected = n.id === selected;
            const radius = 6 + Math.min(12, (n.degree || 0) * 1.5);
            return (
              <g
                key={i}
                className="node cursor-pointer"
                transform={`translate(${n.x},${n.y})`}
                opacity={!selected || isSelected || isNeighbor(selected, n.id, simEdges) ? 1 : 0.3}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelected(n.id);
                }}
                onDoubleClick={() => openFile(n.referenceId)}
              >
                <circle
                  r={radius}
                  fill={isSelected ? "var(--color-accent)" : "var(--color-bg-tertiary)"}
                  stroke={isSelected ? "var(--color-accent)" : "var(--color-border)"}
                  strokeWidth={1.5}
                />
                <text
                  y={radius + 12}
                  textAnchor="middle"
                  fontSize={11}
                  fill="var(--color-text-primary)"
                  pointerEvents="none"
                >
                  {n.label.length > 18 ? n.label.slice(0, 16) + "…" : n.label}
                </text>
              </g>
            );
          })}
        </g>
      </svg>

      {selected && (
        <div className="absolute bottom-3 right-3 max-w-sm rounded-md border border-border bg-surface p-3 text-xs shadow-md">
          <div className="font-medium text-text-primary">
            {simNodes.find((n) => n.id === selected)?.label}
          </div>
          <div className="text-text-secondary">类型: note</div>
          <div className="mt-2 flex items-center gap-2">
            <Button size="sm" variant="primary" onClick={() => openFile(selected)}>
              打开
            </Button>
            <Button size="sm" variant="outline" onClick={() => setSelected(null)}>
              关闭
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function isNeighbor(id: string, other: string, edges: SimEdge[]): boolean {
  for (const e of edges) {
    if ((e.source.id === id && e.target.id === other) || (e.source.id === other && e.target.id === id))
      return true;
  }
  return false;
}
