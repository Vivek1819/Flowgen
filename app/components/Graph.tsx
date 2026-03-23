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

                let x = 100;

                // Customers
                data.customers.forEach((c: any) => {
                    newNodes.push({
                        id: `customer-${c.id}`,
                        position: { x, y: 100 },
                        data: { label: `Customer: ${c.name}` },
                        style: {
                            background: highlightCustomers ? "#000" : "#fff",
                            color: highlightCustomers ? "#fff" : "#000",
                        },
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
                        style: {
                            background: highlightOrders ? "#000" : "#fff",
                            color: highlightOrders ? "#fff" : "#000",
                        },
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
                        style: {
                            background: highlightInvoices ? "#000" : "#fff",
                            color: highlightInvoices ? "#fff" : "#000",
                        },
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