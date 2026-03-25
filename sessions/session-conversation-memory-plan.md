# Implementation Plan - Conversation Memory

The chat interface currently lacks context from previous turns. This plan implements conversation memory to allow for natural follow-up questions.

## Proposed Changes

### Frontend: `app/page.tsx`
- Update `handleSend` to maintain a `messages` history state.
- Send the full history in the `POST` request to `/api/query`.

### Backend: `app/api/query/route.ts`
- **Context Injection**: Incorporate the `messages` array into system prompts for:
    - Intent Classification
    - Entity Extraction
    - SQL Generation
- **Reference Resolution**: Specifically instruct the LLM to resolve pronouns ("it", "those") based on the message history.
