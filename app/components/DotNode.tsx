"use client";

import { Handle, Position } from "reactflow";

const NODE_STYLES: Record<string, { fill: string; border: string }> = {
    customer: { fill: "#dbe5f5", border: "#7a9ecf" },
    order:    { fill: "#f5dbdb", border: "#cf7a7a" },
    delivery: { fill: "#f5eadb", border: "#cf9e6a" },
    invoice:  { fill: "#f5dbe0", border: "#cf7a8a" },
    journal:  { fill: "#e8dbf5", border: "#9a7acf" },
    payment:  { fill: "#dbf0f0", border: "#6abcbc" },
};

export default function DotNode({ data }: { data: any }) {
    const type = data.type as string;
    const palette = NODE_STYLES[type] || { fill: "#e0e0e0", border: "#999" };
    const conns = data.connections || 0;
    const isHub = conns > 8;
    const size = isHub ? 14 : 8;

    const highlighted = data.highlighted || false;

    return (
        <div
            style={{
                width: size,
                height: size,
                background: palette.fill,
                border: `2px solid ${palette.border}`,
                borderRadius: "50%",
                position: "relative",
                boxShadow: highlighted
                    ? "0 0 0 3px white, 0 0 14px 5px rgba(99,162,255,0.8)"
                    : "none",
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
