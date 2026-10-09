<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Project notes

- Read `README.md` first for the architecture and local setup.
- The product is Oriel (useoriel.com). Put user-facing name strings through `BRAND` in `src/config/brand.ts`, never hardcoded, so forks can rename it.
- Model IDs, thinking levels and knowledge limits live in `src/config/ai.ts`. Gemini 3.8 Flash doesn't accept thinking level "minimal".
- Text chat and voice share one turn loop, `src/lib/runtime/run-turn.ts`. A behavior change belongs there or in `system-prompt.ts`/`tools.ts`, not in one of the two routes.
- Browser tools are defined in `src/lib/runtime/tools.ts` and run by `executeClientCall` in `src/components/widget/widget-app.tsx`, for both text and calls.
- Call audio is our own pipeline (README, "Calls"). Barge-in and echo rules are in `src/components/widget/voice/`. The server-side speech stream is in `src/lib/voice/`. `eleven_v4_turbo` only works on the Text to Dialogue WebSocket.
- Database access is server-side through `supabaseAdmin`, after `authorizeOrg`/`authorizeAgent` checks. New tables need RLS enabled with no policies.
- UI copy: no eyebrow labels, step numbers or filler captions. Write with sentence case and plain words.
- Before finishing: `npm run typecheck && npm run lint && npm run build`.
- Any new paid model call must be recorded with `recordUsage` (`src/lib/usage/record.ts`), and its price added to `src/lib/usage/pricing.ts`. Customers never see costs, only counts.
- Two editions (`src/config/edition.ts`): self-hosted (default, no plans or limits) and cloud. Anything about plans, limits or billing must be a no-op when self-hosted.
- The whole repo is public under AGPL-3.0, including the hosted edition's billing and the marketing site (`src/app/(web)`, `src/components/web`, used only by the cloud edition). Never commit secrets, customer data or links to assets on other products' servers; keys belong in `.env.local`, small static files in `public/`.
- Integrations (`src/lib/integrations`): a tool is a job (`capabilities.ts`), not a service, and each service is an adapter in `providers/` registered in `providers/index.ts`. A new service needs a catalog entry, an adapter, the provider in the `integrations_provider_check` constraint and its logo in `src/components/brand/integration-logos.tsx`. Secrets go through `store.ts`, never into `metadata` or `config`.
- Knowledge work (imports, indexing, refresh) runs in the background worker (`src/lib/knowledge/worker.ts`), never in a request: queue it with `src/lib/knowledge/queue.ts` and wake the worker from `after()`.
- The dashboard's help assistant learns from `src/content/app-assistant/guide.md` and `site-map.ts`. When you add or change a dashboard feature, update the guide and run `npm run app-assistant`.
- Workspace pages render inside `WorkspaceShell`. Plan limits go through `src/lib/billing/limits.ts`. Import plans from `src/config/plans.ts`. The plan list itself (`src/config/subscription-plans.ts`) is private and gitignored: when its shape changes, change `subscription-plans.example.ts` the same way.
- Dashboard pages use `PageBody` (one shared width). Conversations is the exception: a full-height split, with the list in its layout and the conversation in the page.

