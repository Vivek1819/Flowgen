# Implementation Plan - Fix Graph Zoom and Layout Stability

The graph currently refetches and reshuffles on every query, which causes visual instability.

## Proposed Changes
- **Graph.tsx**: Change data fetch `useEffect` to run once on mount.
- **fitView Optimization**: Increase timeout and adjust padding for Better zoom levels.
- **Stability**: Ensure nodes don't jump on every query.
