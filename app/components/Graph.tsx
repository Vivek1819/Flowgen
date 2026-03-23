"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import ReactFlow, { Background, Controls, useReactFlow } from "reactflow";
import { ReactFlowProvider } from "reactflow";
import "reactflow/dist/style.css";
import NodeInspector from "./NodeInspector";
import DotNode from "./DotNode";
import {
    forceSimulation,
    forceLink,
    forceManyBody,
    forceCenter,
    forceCollide,
    forceX,
    forceY,
    SimulationNodeDatum,
    SimulationLinkDatum,
} from "d3-force";

// ─────────────────────────────────────────────
// Force-directed layout engine
// ─────────────────────────────────────────────

interface SimNode extends SimulationNodeDatum {
    id: string;
}

function runForceLayout(
    rawNodes: { id: string }[],
    rawEdges: { source: string; target: string }[],
    width: number,
    height: number
): Map<string, { x: number; y: number }> {
    const simNodes: SimNode[] = rawNodes.map((n) => ({ id: n.id, x: Math.random() * width, y: Math.random() * height }));
    const nodeMap = new Map(simNodes.map((n) => [n.id, n]));
    const simLinks: SimulationLinkDatum<SimNode>[] = rawEdges
        .filter((e) => nodeMap.has(e.source) && nodeMap.has(e.target))
        .map((e) => ({ source: nodeMap.get(e.source)!, target: nodeMap.get(e.target)! }));

    const sim = forceSimulation(simNodes)
        .force("link", forceLink(simLinks).id((d: any) => d.id).distance(100).strength(0.4))
        .force("charge", forceManyBody().strength(-400))
        .force("center", forceCenter(width / 2, height / 2))
        .force("collide", forceCollide(30))
        .force("x", forceX(width / 2).strength(0.03))
        .force("y", forceY(height / 2).strength(0.03))
        .stop();

    // Run simulation synchronously — more ticks = better convergence
    for (let i = 0; i < 500; i++) sim.tick();

    const positions = new Map<string, { x: number; y: number }>();
    for (const n of simNodes) {
        positions.set(n.id, { x: n.x ?? 0, y: n.y ?? 0 });
    }
    return positions;
}

// ─────────────────────────────────────────────
// Custom node types registration
// ─────────────────────────────────────────────

const nodeTypes = { dot: DotNode };

// ─────────────────────────────────────────────
// Graph Inner
// ─────────────────────────────────────────────

function GraphInner({ query, highlightedIds }: { query: string; highlightedIds: string[] }) {
    const [nodes, setNodes] = useState<any[]>([]);
    const [edges, setEdges] = useState<any[]>([]);
    const [selectedNode, setSelectedNode] = useState<any>(null);
    const [panelPosition, setPanelPosition] = useState({ x: 0, y: 0 });
    const { fitView } = useReactFlow();
    const highlightSet = useMemo(() => new Set(highlightedIds), [highlightedIds]);

    useEffect(() => {
        fetch("/api/graph")
            .then((res) => res.json())
            .then((data) => {
                const newNodes: any[] = [];
                const newEdges: any[] = [];

                // ── Build all nodes with placeholder positions ──
                data.customers?.forEach((c: any) => {
                    newNodes.push({ id: `customer-${c.id}`, data: { raw: c, type: "customer" } });
                });

                data.orders?.forEach((o: any) => {
                    newNodes.push({ id: `order-${o.id}`, data: { raw: o, type: "order" } });
                    newEdges.push({ id: `c-${o.customerId}-o-${o.id}`, source: `customer-${o.customerId}`, target: `order-${o.id}` });
                });

                data.deliveries?.forEach((d: any) => {
                    newNodes.push({ id: `delivery-${d.id}`, data: { raw: d, type: "delivery" } });
                    if (d.orderId) {
                        newEdges.push({ id: `o-${d.orderId}-d-${d.id}`, source: `order-${d.orderId}`, target: `delivery-${d.id}` });
                    }
                });

                data.invoices?.forEach((i: any) => {
                    newNodes.push({ id: `invoice-${i.id}`, data: { raw: i, type: "invoice" } });
                    if (i.orderId) {
                        newEdges.push({ id: `o-${i.orderId}-i-${i.id}`, source: `order-${i.orderId}`, target: `invoice-${i.id}` });
                    } else if (i.customerId) {
                        newEdges.push({ id: `c-${i.customerId}-i-${i.id}`, source: `customer-${i.customerId}`, target: `invoice-${i.id}` });
                    }
                });

                data.journalEntries?.forEach((j: any) => {
                    newNodes.push({ id: `journal-${j.id}`, data: { raw: j, type: "journal" } });
                    if (j.invoiceId) {
                        newEdges.push({ id: `i-${j.invoiceId}-j-${j.id}`, source: `invoice-${j.invoiceId}`, target: `journal-${j.id}` });
                    }
                });

                data.payments?.forEach((p: any) => {
                    newNodes.push({ id: `payment-${p.id}`, data: { raw: p, type: "payment" } });
                    newEdges.push({ id: `c-${p.customerId}-p-${p.id}`, source: `customer-${p.customerId}`, target: `payment-${p.id}` });
                });

                // ── Calculate connection counts ──
                const connectionCounts: Record<string, number> = {};
                newEdges.forEach((e) => {
                    connectionCounts[e.source] = (connectionCounts[e.source] || 0) + 1;
                    connectionCounts[e.target] = (connectionCounts[e.target] || 0) + 1;
                });

                // ── Run force simulation ──
                const positions = runForceLayout(newNodes, newEdges, 3000, 2000);

                // ── Apply positions and styles ──
                const styledNodes = newNodes.map((n) => {
                    const pos = positions.get(n.id) || { x: 0, y: 0 };
                    const type = n.data.type as string;
                    const conns = connectionCounts[n.id] || 0;
                    n.data.connections = conns;

                    const isHub = conns > 8;

                    return {
                        ...n,
                        type: "dot",
                        position: pos,
                        data: { ...n.data, label: "", connections: conns },
                    };
                });

                // ── Style edges — adaptive opacity based on hub connectivity ──
                const styledEdges = newEdges.map((e) => {
                    const sourceConns = connectionCounts[e.source] || 1;
                    const targetConns = connectionCounts[e.target] || 1;
                    const maxConns = Math.max(sourceConns, targetConns);
                    // Adaptive opacity: hub edges slightly lighter, but ALL edges clearly visible
                    const opacity = maxConns > 20 ? 0.3 : maxConns > 10 ? 0.45 : maxConns > 5 ? 0.6 : 0.75;
                    return {
                        ...e,
                        type: "straight",
                        style: { stroke: "#7eadd4", strokeWidth: 1.4, opacity },
                        animated: false,
                    };
                });

                setNodes(styledNodes);
                setEdges(styledEdges);

                // Fit the view after layout is set
                setTimeout(() => fitView({ padding: 0.15, duration: 400 }), 50);
            });
    }, [query]);

    // ── Auto-pan to highlighted nodes ──
    useEffect(() => {
        if (highlightedIds.length === 0 || nodes.length === 0) return;
        const hlNodeIds = nodes
            .filter((n) => {
                const rawId = n.id.split("-").slice(1).join("-");
                return highlightSet.has(rawId);
            })
            .map((n) => n.id);
        if (hlNodeIds.length === 0) return;
        setTimeout(() => {
            fitView({
                nodes: hlNodeIds.map((id) => ({ id })),
                padding: 0.3,
                duration: 600,
            });
        }, 100);
    }, [highlightedIds, nodes, fitView, highlightSet]);

    // ── Memoized highlight overlays ──
    const highlightedNodes = useMemo(
        () =>
            nodes.map((n) => {
                const rawId = n.id.split("-").slice(1).join("-");
                const isHighlighted = highlightSet.has(rawId);
                return {
                    ...n,
                    data: { ...n.data, highlighted: isHighlighted },
                };
            }),
        [nodes, highlightSet]
    );

    const highlightedEdges = useMemo(
        () =>
            edges.map((e) => {
                const sourceRaw = e.source.split("-").slice(1).join("-");
                const targetRaw = e.target.split("-").slice(1).join("-");
                const isHighlighted = highlightSet.has(sourceRaw) && highlightSet.has(targetRaw);
                return {
                    ...e,
                    style: isHighlighted
                        ? { stroke: "#63a2ff", strokeWidth: 1.8, opacity: 0.9 }
                        : e.style,
                    animated: isHighlighted,
                };
            }),
        [edges, highlightSet]
    );

    return (
        <div className="w-full h-full">
            <ReactFlow
                nodes={highlightedNodes}
                edges={highlightedEdges}
                nodeTypes={nodeTypes}
                onNodeMouseEnter={(e, node) => {
                    setSelectedNode(node);
                    setPanelPosition({ x: e.clientX + 12, y: e.clientY + 12 });
                }}
                onNodeMouseMove={(e) => {
                    setPanelPosition({ x: e.clientX + 12, y: e.clientY + 12 });
                }}
                onNodeMouseLeave={() => setSelectedNode(null)}
                minZoom={0.1}
                maxZoom={3}
                defaultViewport={{ x: 0, y: 0, zoom: 0.6 }}
                proOptions={{ hideAttribution: true }}
            >
                <Background color="#e8ecf1" gap={28} size={1} />
                <Controls
                    showInteractive={false}
                    style={{
                        bottom: 16,
                        left: 16,
                        display: "flex",
                        flexDirection: "column",
                        gap: 2,
                        background: "white",
                        borderRadius: 10,
                        boxShadow: "0 2px 12px rgba(0,0,0,0.08)",
                        border: "1px solid #e5e7eb",
                        padding: 4,
                    }}
                />
            </ReactFlow>
            <NodeInspector node={selectedNode} position={panelPosition} />
        </div>
    );
}

export default function Graph(props: { query: string; highlightedIds: string[] }) {
    return (
        <ReactFlowProvider>
            <GraphInner {...props} />
        </ReactFlowProvider>
    );
}