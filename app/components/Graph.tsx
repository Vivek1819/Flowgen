"use client";

import ReactFlow, {
  Background,
  Controls,
} from "reactflow";
import "reactflow/dist/style.css";

const nodes = [
  {
    id: "1",
    position: { x: 100, y: 100 },
    data: { label: "Customer: Acme Corp" },
  },
  {
    id: "2",
    position: { x: 300, y: 100 },
    data: { label: "Order: O1" },
  },
  {
    id: "3",
    position: { x: 500, y: 100 },
    data: { label: "Invoice: I1" },
  },
];

const edges = [
  { id: "e1-2", source: "1", target: "2" },
  { id: "e2-3", source: "2", target: "3" },
];

export default function Graph() {
  return (
    <div className="w-full h-full">
      <ReactFlow nodes={nodes} edges={edges}>
        <Background />
        <Controls />
      </ReactFlow>
    </div>
  );
}