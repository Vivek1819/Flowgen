# Walkthrough: Conversation Memory

I have implemented conversation memory to allow for natural, context-aware follow-up questions in the FlowGen chat.

## Changes Made

### Frontend
- The chat interface now sends the entire message history to the backend with every query.

### Backend
- **Context Injection**: Message history is injected into prompts for Intent Classification, Entity Extraction, and SQL Generation.
- **Reference Resolution**: Added specific instructions for the LLM to resolve pronouns like "it", "this", or "those orders" using the provided history.

## Verification
### Sample Flow
1. **User:** "Show me orders for customer Melton Group"
2. **User:** "What are the deliveries for **those** orders?"
- *Result*: AI correctly identifies "those orders" from history and generates a JOIN query for the specific order IDs.
