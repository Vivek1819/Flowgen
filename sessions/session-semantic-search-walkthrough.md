# FDE Assignment Evaluation: FlowGen Project

This document evaluates the project against the FDE Task requirements.

## 1. Functional Requirements Mapping
- **Graph Construction**: Prisma schema covers the entire O2C lifecycle.
- **Graph Visualization**: React Flow with custom D3-force layout, node inspector, and smart highlighting.
- **Conversational Query Interface**: NL-to-SQL engine with intent classification and self-correction.

## 2. Technical Excellence
- **Unified Brain**: Consolidated Intent, NER, and SQL generation.
- **Fuzzy Matching**: Resolves "Melton" to "Melton Group" using semantic reasoning.
- **Robust SQL Extraction**: Prevent database syntax errors by stripping markdown from LLM responses.
