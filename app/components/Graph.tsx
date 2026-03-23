"use client";

import { useEffect, useState } from "react";
import ReactFlow, { Background, Controls } from "reactflow";
import "reactflow/dist/style.css";

export default function Graph({ query }: { query: string }) {
    const [nodes, setNodes] = useState<any[]>([]);
    const [edges, setEdges] = useState<any[]>([]);

    useEffect(() => {
        fetch("/api/graph")
            .then((res) => res.json())
            .then((data) => {

                const q = query.toLowerCase();

                const highlightCustomers = q.includes("customer");
                const highlightOrders = q.includes("order");
                const highlightInvoices = q.includes("invoice");

                const newNodes: any[] = [];
                const newEdges: any[] = [];

                const spacingX = 220;
                const startX = 100;

                // Customers
                data.customers.forEach((c: any, index: number) => {
                    newNodes.push({
                        id: `customer-${c.id}`,
                        position: { x: startX + index * spacingX, y: 100 },
                        data: { label: `Customer: ${c.name}` },
                        style: {
                            background: highlightCustomers ? "#000" : "#fff",
                            color: highlightCustomers ? "#fff" : "#000",
                            border: "1px solid #ddd",
                            padding: 10,
                            borderRadius: 8,
                        },
                    });
                });

                // Orders
                data.orders.forEach((o: any, index: number) => {
                    newNodes.push({
                        id: `order-${o.id}`,
                        position: { x: startX + index * spacingX, y: 250 },
                        data: { label: `Order: ${o.id}` },
                        style: {
                            background: highlightOrders ? "#000" : "#fff",
                            color: highlightOrders ? "#fff" : "#000",
                            border: "1px solid #ddd",
                            padding: 10,
                            borderRadius: 8,
                        },
                    });

                    newEdges.push({
                        id: `c-${o.customerId}-o-${o.id}`,
                        source: `customer-${o.customerId}`,
                        target: `order-${o.id}`,
                    });
                });

                // Invoices
                data.invoices.forEach((i: any, index: number) => {
                    newNodes.push({
                        id: `invoice-${i.id}`,
                        position: { x: startX + index * spacingX, y: 400 },
                        data: { label: `Invoice: ${i.id}` },
                        style: {
                            background: highlightInvoices ? "#000" : "#fff",
                            color: highlightInvoices ? "#fff" : "#000",
                            border: "1px solid #ddd",
                            padding: 10,
                            borderRadius: 8,
                        },
                    });

                    newEdges.push({
                        id: `c-${i.customerId}-i-${i.id}`,
                        source: `customer-${i.customerId}`,
                        target: `invoice-${i.id}`,
                    });
                });

                setNodes(newNodes);
                setEdges(newEdges);
            });
    }, [query]);

    return (
        <div className="w-full h-full">
            <ReactFlow nodes={nodes} edges={edges}>
                <Background />
                <Controls />
            </ReactFlow>
        </div>
    );
}