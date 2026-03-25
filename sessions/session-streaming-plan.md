# Implementation Plan - Streaming Responses

Implement real-time streaming for LLM answers and status updates to improve user experience and perceived performance.

## Proposed Changes

### Backend: `app/api/query/route.ts`
- Replace `Response.json` with a `Response` object using a `ReadableStream`.
- Use a helper function to send JSON-formatted chunks to the stream:
    - `{"type": "status", "content": "..."}` for intermediate updates.
    - `{"type": "answer_chunk", "content": "..."}` for streamed LLM text.
    - `{"type": "metadata", "highlightedIds": [...], ...}` for final graph updates.
- Implement a `streamResponse` helper using `TextEncoder`.

### Frontend: `app/page.tsx`
- Update `handleSend` to consume the `ReadableStream` from the `/api/query` response.
- Use a `fetch` reader to process chunks incrementally.
- Maintain a "current streaming message" state to show the answer as it arrives.
