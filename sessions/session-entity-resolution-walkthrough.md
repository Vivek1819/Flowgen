# Walkthrough: Smart Entity Resolution & Highlighting

I have upgraded the intelligent query system to be "smarter" about discovering IDs and highlighting relevant nodes in the graph, especially for name-based and aggregate queries.

## Key Improvements

### 1. Smart Entity Resolution Layer
The system now uses an LLM-based **Named Entity Recognition (NER)** step before generating SQL. It identifies names like "Melton Group" and resolves them to actual database IDs by searching the `Customer` and `Product` tables.

### 2. ID-Aware SQL Generation
The SQL generator prompt has been reinforced to **always** select the `id` columns of all entities involved in the query. This ensures that even for aggregate queries, the underlying entity IDs are available for the graph visualization.

### 3. Rich Text & Markdown Rendering
The chat interface now correctly renders Markdown responses, creating a clean, professional "premium" look in the chat panel.
