# Implementation Plan: Universal Smart Query & Visualization

This plan upgrades the FlowGen query engine to be more robust and visually responsive.

## Proposed Changes
- **Intelligent Highlighting**: LLM reviews SQL results to pick relevant entities.
- **Robust Fallback**: If SQL returns 0 rows, use `traverseGraph` from mentioned IDs.
- **Ultra-Reliable SQL**: Mandatory `LEFT JOIN` for flow traces to handle incomplete data.
