"use client";

import { useEffect, useState } from "react";
import ReactFlow, { Background, Controls } from "reactflow";
import "reactflow/dist/style.css";

export default function Graph() {
  const [nodes, setNodes] = useState<any[]>([]);
  const [edges, setEdges] = useState<any[]>([]);

  useEffect(() => {
    fetch("/api/graph")
      .then((res) => res.json())
      .then((data) => {
        const newNodes: any[] = [];
        const newEdges: any[] = [];

        let x = 100;

        // Customers
        data.customers.forEach((c: any) => {
          newNodes.push({
            id: `customer-${c.id}`,
            position: { x, y: 100 },
            data: { label: `Customer: ${c.name}` },
          });
          x += 200;
        });

        x = 100;

        // Orders
        data.orders.forEach((o: any) => {
          newNodes.push({
            id: `order-${o.id}`,
            position: { x, y: 250 },
            data: { label: `Order: ${o.id}` },
          });

          newEdges.push({
            id: `c-${o.customerId}-o-${o.id}`,
            source: `customer-${o.customerId}`,
            target: `order-${o.id}`,
          });

          x += 200;
        });

        x = 100;

        // Invoices
        data.invoices.forEach((i: any) => {
          newNodes.push({
            id: `invoice-${i.id}`,
            position: { x, y: 400 },
            data: { label: `Invoice: ${i.id}` },
          });

          newEdges.push({
            id: `c-${i.customerId}-i-${i.id}`,
            source: `customer-${i.customerId}`,
            target: `invoice-${i.id}`,
          });

          x += 200;
        });

        setNodes(newNodes);
        setEdges(newEdges);
      });
  }, []);

  return (
    <div className="w-full h-full">
      <ReactFlow nodes={nodes} edges={edges}>
        <Background />
        <Controls />
      </ReactFlow>
    </div>
  );
}