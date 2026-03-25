# Walkthrough - Streaming Responses

I have successfully implemented streaming responses in the FlowGen application.

## Changes Made

### Backend
- Refactored `/api/query` to use a `ReadableStream`.
- Added support for intermediate status updates (e.g., "Classifying intent", "Generating SQL").
- Enabled LLM response streaming using Groq's streaming API.

### Frontend
- Updated the chat interface to consume the `ReadableStream`.
- Added a `status` indicator that shows what the AI is currently doing.
- implemented real-time message updates as chunks arrive.
