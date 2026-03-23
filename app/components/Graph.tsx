"use client";

import { useEffect, useMemo, useState } from "react";
import ReactFlow, { Background, Controls, useReactFlow } from "reactflow";
import { ReactFlowProvider } from "reactflow";
import "reactflow/dist/style.css";
import NodeInspector from "./NodeInspector";

function GraphInner({ query, highlightedIds }: { query: string, highlightedIds: string[] }) {
    const [nodes, setNodes] = useState<any[]>([]);
    const [edges, setEdges] = useState<any[]>([]);
    const [selectedNode, setSelectedNode] = useState<any>(null);
    const [panelPosition, setPanelPosition] = useState({ x: 0, y: 0 });
    const { getViewport } = useReactFlow();
    const highlightSet = useMemo(() => new Set(highlightedIds), [highlightedIds]);

    // Unused but kept for future click-to-pin
    const handleNodeClick = (_: any, _node: any) => {};

    useEffect(() => {
        fetch("/api/graph")
            .then((res) => res.json())
            .then((data) => {
                const newNodes: any[] = [];
                const newEdges: any[] = [];

                const spacingX = 120;
                const startX = 100;

                const COLORS: any = {
                    customer: "#2563eb",
                    order: "#16a34a",
                    delivery: "#f59e0b",
                    invoice: "#ef4444",
                    journal: "#7c3aed",
                    payment: "#06b6d4",
                };

                // ------------------ CUSTOMERS ------------------
                data.customers.forEach((c: any, index: number) => {
                    newNodes.push({
                        id: `customer-${c.id}`,
                        position: { x: startX + index * spacingX, y: 100 },
                        data: { raw: c, type: "customer" },
                        style: {
                            width: 10,
                            height: 10,
                            background: COLORS.customer,
                            borderRadius: "50%",
                        },
                    });
                });

                // ------------------ ORDERS ------------------
                data.orders.forEach((o: any, index: number) => {
                    newNodes.push({
                        id: `order-${o.id}`,
                        position: { x: startX + index * spacingX, y: 220 },
                        data: { raw: o, type: "order" },
                        style: {
                            width: 10,
                            height: 10,
                            background: COLORS.order,
                            borderRadius: "50%",
                        },
                    });

                    newEdges.push({
                        id: `c-${o.customerId}-o-${o.id}`,
                        source: `customer-${o.customerId}`,
                        target: `order-${o.id}`,
                    });
                });

                // ------------------ DELIVERIES ------------------
                data.deliveries?.forEach((d: any, index: number) => {
                    newNodes.push({
                        id: `delivery-${d.id}`,
                        position: { x: startX + index * spacingX, y: 340 },
                        data: { raw: d, type: "delivery" },
                        style: {
                            width: 10,
                            height: 10,
                            background: COLORS.delivery,
                            borderRadius: "50%",
                        },
                    });

                    if (d.orderId) {
                        newEdges.push({
                            id: `o-${d.orderId}-d-${d.id}`,
                            source: `order-${d.orderId}`,
                            target: `delivery-${d.id}`,
                        });
                    }
                });

                // ------------------ INVOICES ------------------
                data.invoices.forEach((i: any, index: number) => {
                    newNodes.push({
                        id: `invoice-${i.id}`,
                        position: { x: startX + index * spacingX, y: 460 },
                        data: { raw: i, type: "invoice" },
                        style: {
                            width: 10,
                            height: 10,
                            background: COLORS.invoice,
                            borderRadius: "50%",
                        },
                    });

                    newEdges.push({
                        id: `c-${i.customerId}-i-${i.id}`,
                        source: `customer-${i.customerId}`,
                        target: `invoice-${i.id}`,
                    });
                });

                // ------------------ JOURNAL ------------------
                data.journalEntries?.forEach((j: any, index: number) => {
                    newNodes.push({
                        id: `journal-${j.id}`,
                        position: { x: startX + index * spacingX, y: 580 },
                        data: { raw: j, type: "journal" },
                        style: {
                            width: 10,
                            height: 10,
                            background: COLORS.journal,
                            borderRadius: "50%",
                        },
                    });

                    if (j.invoiceId) {
                        newEdges.push({
                            id: `i-${j.invoiceId}-j-${j.id}`,
                            source: `invoice-${j.invoiceId}`,
                            target: `journal-${j.id}`,
                        });
                    }
                });

                // ------------------ PAYMENTS ------------------
                data.payments.forEach((p: any, index: number) => {
                    newNodes.push({
                        id: `payment-${p.id}`,
                        position: { x: startX + index * spacingX, y: 700 },
                        data: { raw: p, type: "payment" },
                        style: {
                            width: 10,
                            height: 10,
                            background: COLORS.payment,
                            borderRadius: "50%",
                        },
                    });

                    newEdges.push({
                        id: `c-${p.customerId}-p-${p.id}`,
                        source: `customer-${p.customerId}`,
                        target: `payment-${p.id}`,
                    });
                });

                // --- Calculate Connections ---
                const connectionCounts: Record<string, number> = {};
                newEdges.forEach(e => {
                    connectionCounts[e.source] = (connectionCounts[e.source] || 0) + 1;
                    connectionCounts[e.target] = (connectionCounts[e.target] || 0) + 1;
                });
                newNodes.forEach(n => {
                    n.data.connections = connectionCounts[n.id] || 0;
                });

                setNodes(newNodes);
                setEdges(newEdges);
            });
    }, [query]);

    // Memoize highlighted nodes — only recomputes when nodes or highlightedIds change
    const highlightedNodes = useMemo(() => nodes.map(n => {
        const rawId = n.id.split("-").slice(1).join("-");
        const isHighlighted = highlightSet.has(rawId);
        return {
            ...n,
            style: {
                ...n.style,
                ...(isHighlighted ? {
                    boxShadow: "0 0 0 3px white, 0 0 16px 6px rgba(250,204,21,0.9)",
                    zIndex: 10,
                } : {})
            }
        };
    }), [nodes, highlightSet]);

    // Memoize highlighted edges
    const highlightedEdges = useMemo(() => edges.map(e => {
        const sourceRaw = e.source.split("-").slice(1).join("-");
        const targetRaw = e.target.split("-").slice(1).join("-");
        const isHighlighted = highlightSet.has(sourceRaw) && highlightSet.has(targetRaw);
        return {
            ...e,
            style: isHighlighted ? { stroke: "#facc15", strokeWidth: 2 } : undefined,
            animated: isHighlighted,
        };
    }), [edges, highlightSet]);

    return (
        <div className="w-full h-full">
            <ReactFlow
                nodes={highlightedNodes}
                edges={highlightedEdges}
                onNodeMouseEnter={(e, node) => {
                    setSelectedNode(node);
                    setPanelPosition({ x: e.clientX + 12, y: e.clientY + 12 });
                }}
                onNodeMouseMove={(e) => {
                    setPanelPosition({ x: e.clientX + 12, y: e.clientY + 12 });
                }}
                onNodeMouseLeave={() => setSelectedNode(null)}
            >
                <Background />
                <Controls />
            </ReactFlow>
            <NodeInspector node={selectedNode} position={panelPosition} />
        </div>
    );
}

export default function Graph(props: { query: string, highlightedIds: string[] }) {
    return (
        <ReactFlowProvider>
            <GraphInner {...props} />
        </ReactFlowProvider>
    );
}