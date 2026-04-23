# Repository Guidelines

## Project Structure & Module Organization
This repo is a Vite + React + TypeScript app with Cloudflare Pages Functions.
- `src/`: frontend app code.
- `src/pages/`: route-level pages (`Index.tsx`, `Login.tsx`, `Nangua.tsx`).
- `src/components/`: shared UI and feature components (`ui/*` contains shadcn-style primitives).
- `src/hooks/`, `src/lib/`: reusable hooks and helpers.
- `src/test/`: Vitest setup and frontend tests.
- `functions/api/`: serverless endpoints for auth, chat, conversation CRUD, and debug/provider admin routes.
- `public/`: static assets.

## Build, Test, and Development Commands
- `npm run dev`: start local Vite dev server.
- `npm run build`: production build to `dist/` (Cloudflare Pages output).
- `npm run build:dev`: build using development mode.
- `npm run preview`: preview built app locally.
- `npm run lint`: run ESLint for `.ts/.tsx` sources.
- `npm run test`: run Vitest once (CI-friendly).
- `npm run test:watch`: run Vitest in watch mode.

## Coding Style & Naming Conventions
- Language: TypeScript (`.ts`, `.tsx`), ES modules.
- Indentation: 2 spaces; keep imports grouped and readable.
- Components/pages: PascalCase file names (for example, `NavLink.tsx`, `NotFound.tsx`).
- Utilities/hooks: lower-case or kebab naming patterns already used in repo (for example, `utils.ts`, `use-toast.ts`).
- Use alias imports via `@/*` for `src/*` paths when helpful.
- Lint rules are defined in `eslint.config.js`; run `npm run lint` before opening a PR.

## Testing Guidelines
- Framework: Vitest with `jsdom` and Testing Library (`src/test/setup.ts`).
- Test file pattern: `src/**/*.{test,spec}.{ts,tsx}`.
- Prefer colocated tests near features or under `src/test/` for shared cases.
- Add/update tests for behavior changes in chat flow, auth/session handling, and key UI interactions.

## Commit & Pull Request Guidelines
- Follow existing history style: short, imperative summaries (for example, `Persist selected model for new chats...`).
- Keep commits focused and atomic; avoid mixing unrelated frontend and function changes.
- PR checklist: clear problem/solution summary; linked issue (if applicable); test evidence (`npm run test`, `npm run lint`); screenshots/GIFs for UI changes; notes for env/binding updates (for example `CHAT_KV`, `.dev.vars` keys).

## Security & Configuration Tips
- Never commit secrets. Start from `.dev.vars.example`.
- Required runtime values include `AI_API_KEY`, `AI_BASE_URL`, `AI_MODELS`, `DEMO_USERNAME`, `DEMO_PASSWORD`, and `SESSION_SECRET`.
- Validate Cloudflare Pages KV binding `CHAT_KV` before testing conversation persistence.
