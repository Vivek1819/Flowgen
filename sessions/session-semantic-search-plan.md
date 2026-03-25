# Semantic Search Implementation Plan

The goal is to upgrade the current "substring-based" entity resolution to a "semantic search" system using the LLM's reasoning capabilities.

## Proposed Changes
- **Consolidate 'Brain' Calls**: Merge `classifyIntent`, `extractEntityNames`, and the initial `runSQLQuery` logic into a single high-quality LLM call.
- **Smart Entity Resolution**: If the consolidated brain finds a named entity but lacks an ID, trigger the `semanticSearch` fallback logic.
- **Model Switch**: Use `llama-3.1-8b-instant` for the initial "Brain" and "NER" tasks.
