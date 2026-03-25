# Technical Requirements: Graph Clustering & Advanced Analysis

## 1. Graph Clustering
Clustering in FlowGen would focus on reducing "hairball" complexity by grouping related documents into logical units.
- **Parent-Child Mapping**: Using React Flow's `parentId` for nested groups.
- **D3 Grouping**: Updating `Graph.tsx` physics to handle cluster bounding boxes.

## 2. Advanced Graph Analysis
- **Process Latency**: Calculate "Order-to-Delivery" duration and highlight bottlenecks.
- **Impact Analysis**: Forward/Backward dependency tracing for document deletion.
- **Metric Scaling**: Node sizing based on degree centrality or currency volume.

## 3. Persistent Sessions
- Adding `Conversation` and `Message` models to `prisma/schema.prisma` to persist history across database sessions.
