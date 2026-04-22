# AI Mirror Demo

This project is a Vite + React chat UI prepared for Cloudflare Pages.

## What is included

- Fixed username/password login with cookie session
- Cloudflare KV-backed multi-conversation chat history
- Streaming chat page with sidebar conversation switching, model switching, mode switching, stop/regenerate, and image input
- Cloudflare Pages Functions under `functions/api/*`
- Edge proxy pattern for OpenAI-compatible chat completion APIs
- Example env file at `.dev.vars.example`

## Cloudflare Pages settings

- Build command: `npm run build`
- Build output directory: `dist`
- Functions directory: `functions`

## Cloudflare bindings

Add a KV namespace binding in Pages:

- Binding name: `CHAT_KV`
- Value: your KV namespace

## Required environment variables

- `AI_API_KEY`: your upstream model API key
- `AI_BASE_URL`: full chat completions endpoint
- `AI_MODEL`: default model name
- `AI_MODELS`: comma-separated model whitelist shown in the UI
- `AI_SYSTEM_PROMPT`: optional system prompt
- `DEMO_USERNAME`: fixed login username
- `DEMO_PASSWORD`: fixed login password
- `SESSION_SECRET`: secret used to sign the login cookie

Example:

```env
AI_API_KEY=your_api_key
AI_BASE_URL=https://api.openai.com/v1/chat/completions
AI_MODEL=gpt-4o-mini
AI_MODELS=gpt-4o-mini,gpt-4.1-mini,gpt-4.1
AI_SYSTEM_PROMPT=You are a concise and helpful AI assistant for a personal demo site.
DEMO_USERNAME=demo
DEMO_PASSWORD=demo123456
SESSION_SECRET=change-me-before-production
```

## How it works

The frontend:

1. Signs in through `/api/login`
2. Loads the saved conversations from `/api/session`
3. Streams model output from `/api/chat`
4. Creates and switches conversations through `/api/conversation/create` and `/api/conversation/select`
5. Resets all history through `/api/conversation/reset`

The backend:

1. Verifies the signed session cookie
2. Persists a conversation index and per-conversation records in `CHAT_KV`
3. Injects mode-specific system instructions
4. Streams the assistant response back to the UI
5. Supports image input through OpenAI-compatible vision messages

## Notes

- The current function targets OpenAI-compatible `chat/completions` APIs.
- Image input is sent as a data URL, so keep uploads small.
- If your provider uses a different response shape, adjust `functions/api/chat.ts`.
- Local `vite build` could not be verified in this sandbox because `esbuild` process spawning is blocked here. `eslint` was run successfully after fixes.
