"use client";

import { Handle, Position } from "reactflow";

const NODE_STYLES: Record<string, { fill: string; border: string; glow: string }> = {
    customer: { fill: "#dbe5f5", border: "#7a9ecf", glow: "rgba(122,158,207,0.5)" },
    order:    { fill: "#f5dbdb", border: "#cf7a7a", glow: "rgba(207,122,122,0.5)" },
    delivery: { fill: "#f5eadb", border: "#cf9e6a", glow: "rgba(207,158,106,0.5)" },
    invoice:  { fill: "#f5dbe0", border: "#cf7a8a", glow: "rgba(207,122,138,0.5)" },
    journal:  { fill: "#e8dbf5", border: "#9a7acf", glow: "rgba(154,122,207,0.5)" },
    payment:  { fill: "#dbf0f0", border: "#6abcbc", glow: "rgba(106,188,188,0.5)" },
    product:  { fill: "#def5db", border: "#7acf7a", glow: "rgba(122,207,122,0.5)" },
};

export default function DotNode({ data }: { data: any }) {
    const type = data.type as string;
    const palette = NODE_STYLES[type] || { fill: "#e0e0e0", border: "#999", glow: "rgba(153,153,153,0.5)" };
    const conns = data.connections || 0;
    const isHub = conns > 8;

    const highlighted = data.highlighted || false;
    const isSeed = data.isSeed || false;
    const dimmed = data.dimmed || false;

    // Size logic: seeds are largest, hubs are medium, regular nodes are small
    const size = isSeed ? 18 : isHub ? 14 : 8;

    // Build styles based on state
    let background = palette.fill;
    let border = `2px solid ${palette.border}`;
    let boxShadow = "none";
    let opacity = 1;

    if (isSeed) {
        // Seed node: solid colored center, thick colored border, strong glow ring
        background = palette.border;
        border = `3px solid ${palette.border}`;
        boxShadow = `0 0 0 4px rgba(255,255,255,0.9), 0 0 0 6px ${palette.border}, 0 0 24px 10px ${palette.glow}`;
    } else if (highlighted) {
        // Highlighted (flow member): subtle glow in its own color
        background = palette.fill;
        border = `2.5px solid ${palette.border}`;
        boxShadow = `0 0 0 3px rgba(255,255,255,0.8), 0 0 14px 6px ${palette.glow}`;
    } else if (dimmed) {
        // no-op: keep default styling
    }

    return (
        <div
            style={{
                width: size,
                height: size,
                background,
                border,
                borderRadius: "50%",
                position: "relative",
                boxShadow,
                opacity,
                transition: "opacity 0.3s ease, box-shadow 0.3s ease, width 0.2s ease, height 0.2s ease",
            }}
        >
            {/* Single invisible handle dead-center for all edges */}
            <Handle
                type="source"
                position={Position.Bottom}
                style={{
                    background: "transparent",
                    border: "none",
                    width: 1,
                    height: 1,
                    top: "50%",
                    left: "50%",
                    transform: "translate(-50%, -50%)",
                    minWidth: 0,
                    minHeight: 0,
                }}
            />
            <Handle
                type="target"
                position={Position.Top}
                style={{
                    background: "transparent",
                    border: "none",
                    width: 1,
                    height: 1,
                    top: "50%",
                    left: "50%",
                    transform: "translate(-50%, -50%)",
                    minWidth: 0,
                    minHeight: 0,
                }}
            />
        </div>
    );
}
