# 01 — Project Overview

> Part of the AI Teammates project notes. Start here, then read the [README](README.md)
> for the navigation map.

## 1. What the application is

**AI Teammates** is a web application where a signed-in user creates personal AI bots —
each with a name, avatar, job description, working instructions, and its own cloud
computer (a Daytona sandbox) — and works with them either one-on-one in a direct chat
or together in a group chat where bots can be `@mentioned` and can hand work off to
another bot whose job is better suited.

The product definition lives in `PRODUCT.md` at the repository root. The short version:

- **Direct chats** — talk to a single bot. The bot can run shell commands, read/write
  files, and drive its own Linux desktop (mouse/keyboard/screen) inside its sandbox.
  The user can watch that desktop live over VNC in a side panel.
- **Group chats** — several bots in one conversation with a shared memory, mentions,
  a selectable responder, and a `handoff` tool that transfers the turn to another bot.
- **Memory** — three scopes (global per user, per group, per bot) with user-controlled
  privacy toggles on `/memory`.
- **Bring-your-own-key AI** — the app never funds model calls. The user saves their own
  Gemini, OpenRouter, or OpenAI API key (or connects an eligible ChatGPT plan), and every
  model request is billed directly to that provider account.
- **Paid product** — Clerk Billing gates the workspace: a Free account can sign in and
  view plans, but bots, sandboxes, and chat turns require the **Pro plan ($9/month)**.

Non-goals that the repository explicitly does **not** claim (from `PRODUCT.md`): no
customer counts or testimonials, no integration catalog, no autonomous scheduling, no
external messaging channels.

## 2. Who it is for

| Audience | How they use it |
|---|---|
| Individual prosumer users | Create a small team of specialized bots (researcher, code reviewer, editor, tutor — presets in `lib/bot-presets.ts`), give each a computer, and delegate tasks in chat. |
| Free visitors | Read the public landing page at `/` and the pricing page at `/pricing`; cannot create or use bots. |
| Developers/owner of the repo | Maintain and extend a full-stack Next.js + Trigger.dev + Neon + Clerk + Daytona system (this documentation set). |

## 3. Key features (implemented)

All of these are present in code — file references included:

| Feature | Where it lives |
|---|---|
| Public landing page at `/` (Skydive-inspired design, `DESIGN.md`) | `app/page.tsx`, `app/landing.module.css`, `components/landing-demos.tsx` |
| Clerk sign-in/sign-up, user profile, pricing table | `app/sign-in/[[...sign-in]]`, `app/sign-up/[[...sign-up]]`, `app/pricing`, `app/(account)/billing`, `proxy.ts` |
| Workspace with fixed sidebar (chats, bots, ⌘K search, account links) | `components/workspace-layout.tsx`, `components/app-sidebar.tsx` |
| Bot CRUD with avatar shuffling, job presets, instructions | `actions/bot.ts`, `components/bot-dialog.tsx`, `lib/bot-presets.ts` |
| Direct chat with streaming AI responses, tool calls, attachments | `app/(dashboard)/chats/[chatId]/page.tsx`, `components/chat.tsx`, `trigger/chat.ts` |
| Group chat with `@mentions`, responder selection, bot-to-bot handoff | `components/group-chat-dialog.tsx`, `lib/ai/bot-mentions.ts`, `lib/ai/group-handoff.ts` |
| Per-bot sandbox computer: shell, files, mouse/keyboard/screen tools | `lib/ai/computer-tools.ts`, `lib/daytona.ts`, `lib/sandbox-usage.ts` |
| Live VNC desktop preview/fullscreen (noVNC) | `components/chat-desktop.tsx`, `components/chat-desktop-viewer.tsx`, `lib/daytona-vnc.ts`, `actions/desktop.ts` |
| Three memory scopes with privacy toggles and grounded fact capture | `lib/ai/memory-manager.ts`, `lib/ai/memory-capture.ts`, `lib/ai/chat-memory.ts`, `lib/ai/bot-memory.ts`, `actions/memory.ts` |
| Personal API keys (Gemini/OpenRouter/OpenAI) verified before saving | `actions/api-keys.ts`, `lib/ai/provider-key-validation.ts`, `components/api-key-settings.tsx` |
| ChatGPT plan connection (hosted OAuth — implemented but disabled; experimental Codex/ChatGPT community flow — enabled) | `lib/chatgpt.ts`, `lib/community-chatgpt.ts`, `app/api/connections/chatgpt/*`, `components/community-chatgpt-connection.tsx` |
| Pro subscription gating ($9/mo) with friendly upgrade UX | `lib/billing.ts`, `lib/billing-agent.ts`, `components/paid-access.tsx`, `clerk-billing.json` |
| Usage allowances: 20 sandbox hours/period, 3 bots, 1 running sandbox | `lib/usage.ts`, `lib/usage-policy.ts`, `lib/sandbox-usage.ts` |
| Usage & Billing dashboard with meters, activity table, countdown, "stop my sandbox" | `app/(account)/usage/page.tsx`, `components/usage-countdown.tsx`, `actions/usage.ts` |
| Structured error monitoring and logging (Sentry, privacy-scrubbed) | `lib/logging.ts`, `lib/sentry-privacy.ts`, `sentry.*.config.ts`, `trigger/init.ts` |
| Background tasks: chat agent, delayed sandbox stop, minute-lease recovery | `trigger/chat.ts`, `trigger/sandbox-usage.ts` |

## 4. Technology stack (summary)

The full treatment with alternatives and trade-offs is in
[02 — Tech stack deep dive](02-tech-stack-deep-dive.md).

| Layer | Choice |
|---|---|
| Language | TypeScript 5 (strict), ES modules |
| Web framework | Next.js 16.4 (App Router), React 19.3 |
| Styling/UI | Tailwind CSS v4 (CSS-first, no config file), shadcn-style components on **Base UI** (`base-nova`), lucide icons, next-themes |
| Forms/validation | react-hook-form + zodResolver, drizzle-zod insert schemas, Zod 4 |
| AI | Vercel AI SDK v7 (`ai`, `@ai-sdk/react`), provider SDKs for Google/OpenAI/OpenRouter-compatible endpoints |
| Realtime/agents | Trigger.dev v4 — `chat.agent` ("chat-agent") + scheduled/delayed tasks; UI streams via `@trigger.dev/sdk/chat/react` |
| Backend API surface | Server Actions (9 `"use server"` files) + 3 route handlers; no REST framework |
| Database | Neon Postgres over the **HTTP driver** (`@neondatabase/serverless`) + Drizzle ORM; schema applied with `db:push` (no migration commits) |
| Auth + billing | Clerk (`@clerk/nextjs`), Clerk Billing (Pro $9/mo, feature flags `bots`/`sandboxes`) |
| Sandboxes | Daytona (2 vCPU / 4 GiB / 10 GiB limits), noVNC for viewing |
| ChatGPT integrations | Hosted OAuth (PKCE, disabled) and experimental community flow (`@openai-oauth/*`) |
| Avatars | DiceBear 10 (`@dicebear/core` + `@dicebear/styles`), server-rendered data URIs |
| Observability | Sentry (browser/server/edge/worker), structured Sentry Logs |
| Testing | Vitest (7 `.tsx` UI tests) + `node:test` (22 `.ts`/`.mjs` suites, 4 needing a live DB) |
| Tooling | pnpm, ESLint 9 flat config, Prettier, `tsc --noEmit` |
| Hosting | Vercel (web), Trigger.dev Cloud (worker), Neon (DB), Clerk, Daytona, Sentry |
| CI | **None** — no `.github/workflows`; quality gates run locally before deploy |

## 5. High-level architecture

```text
Browser ──► Vercel: Next.js 16 (pages + Server Actions + 3 route handlers)
              │  proxy.ts (clerkMiddleware) establishes sessions
              ├──► Neon Postgres (Drizzle over HTTP driver)
              ├──► Clerk (auth sessions, billing subscription, private metadata = API keys)
              ├──► Trigger.dev session API ──► Worker (Node 24)
              │        chat-agent: plan check → user's model key → memory → tools → stream
              │        stop-sandbox-lease (delayed) / recover-expired-sandbox-leases (cron 1m)
              │        ├──► Gemini / OpenRouter / OpenAI / ChatGPT (user-owned credentials)
              │        └──► Daytona sandbox (bash/files/desktop) + signed VNC URL
              └──► Sentry (errors + scrubbed logs, web & worker)
```

Two runtime processes share one codebase (`lib/` is imported by both):

1. **Next.js server** — rendering, authentication, server actions, route handlers.
2. **Trigger.dev worker** — long-running AI turns, tool execution, sandbox lifecycle.

Client-side state is intentionally minimal: Server Components + server actions +
`router.refresh()`, four React contexts, and the AI SDK's `useChat` store. There is no
Redux/Zustand/React Query anywhere. Details in
[03 — Architecture & design decisions](03-architecture-and-design-decisions.md).

## 6. A complete request lifecycle (condensed)

Taking a chat message as the canonical flow:

1. `components/chat.tsx` (`ChatView`) submits via `useChat` → `useTriggerChatTransport`.
2. The transport calls server actions from `actions/chat.ts`:
   `startChatSession` (billing + ownership check → Trigger session) and
   `mintChatAccessToken` (1-hour public token scoped to that chat session).
3. Trigger.dev runs `chatAgent` (`trigger/chat.ts`):
   `onTurnStart` registers the run for usage accounting (`trackWorkerRun`).
4. `run()` resolves the bot (`getChatBot`), re-checks the paid plan
   (`requireUserPaidPlan`), builds a metered model (`meteredModel` — re-checks the plan
   again on **every** generate/stream call and resolves the user's own API key).
5. Memory is read and (if enabled) new facts are captured with evidence grounding.
6. Tools are attached: computer tools for direct chats, handoff tools for groups,
   memory tools for both; `streamText` executes with step caps (20 direct / 6 group)
   and desktop-loop bounds.
7. UI message chunks stream back to the browser; `onTurnComplete` reconciles worker
   usage with a compare-and-swap delta (`syncWorkerRun`).
8. Errors are sanitized (`chatErrorMessage` + `sanitizeDetail`) before reaching the UI.

The full walkthroughs are in [05 — Feature walkthroughs](05-feature-and-code-walkthroughs.md)
and [08 — API & realtime workflows](08-api-and-realtime-workflows.md).

## 7. Repository structure (summary)

```text
ai-teammates/
├── app/            # Next.js App Router: routes, layouts, 3 route handlers, global CSS
├── actions/        # 9 "use server" files — the app's mutation API
├── components/     # 18 app components, ai-elements/ (6), ui/ (61 Base UI primitives)
├── lib/            # business logic shared by web + worker (policies, ai/, db/)
├── queries/        # server-only read queries (Clerk-scoped)
├── hooks/          # use-session-action, use-mobile
├── trigger/        # Trigger.dev worker tasks + its Sentry init; trigger.config.ts at root
├── tests/          # 29 test files (vitest .tsx + node:test .ts/.mjs)
├── types/          # ambient types (novnc.d.ts)
├── docs/           # this documentation set
└── (root configs)  # package.json, tsconfig, next/drizzle/vitest/eslint configs, *.md
```

Excluded from this documentation's inventory: `node_modules/`, `.next/`, `.pnpm-store/`,
`.trigger/` (local Trigger runtime + QA browser profile), `.vercel/`, `.clerk/`, the
agent-skill bundles (`.agents/`, `.claude/`, `.cursor/`, `.github/skills/`), and the
scraped reference material in `.firecrawl/`. A per-file inventory is in
[04 — Folder & file reference](04-folder-and-file-reference.md).

## 8. Main architectural decisions (one-liners)

Each is argued in full in [03](03-architecture-and-design-decisions.md):

1. **Single fullstack Next.js app, not a frontend + API pair** — mutations are Server
   Actions; only 3 browser-facing HTTP routes exist (OAuth callbacks).
2. **Separate Trigger.dev worker** — AI turns and sandbox lifecycles are long-running,
   retried, and must survive beyond a request's lifetime.
3. **Bring-your-own-key AI (BYOK)** — no app-funded credits; every model call re-validates
   the user's paid plan and resolves the user's own provider key.
4. **Neon Postgres + Drizzle over the HTTP driver** — serverless-friendly and stateless;
   no interactive transactions, compensated with single-statement atomic SQL and `db.batch`.
5. **Usage ledger with compare-and-swap semantics** — debits/refunds/settlements are
   atomic deltas so retries and overlapping reconciliation cannot double count.
6. **One sandbox lease per user** — enforced by primary key; delayed stop task armed
   before provisioning; a cron recovers expired leases.
7. **Clerk-hosted auth and billing** — sessions, subscriptions, and API-key storage
   (private metadata) outsourced; app code enforces ownership and plan gates everywhere.
8. **No CI** — deploys are manual (Vercel for web, `trigger.dev deploy` for the worker)
   with local typecheck/tests as the gate.

## 9. Where to go next

- Defend technology choices → [02](02-tech-stack-deep-dive.md)
- Whiteboard the system → [03](03-architecture-and-design-decisions.md) + `diagrams/`
- Explain any file → [04](04-folder-and-file-reference.md)
- Walk a feature end to end → [05](05-feature-and-code-walkthroughs.md)
- Data model → [06](06-database-and-data-models.md)
- Security posture → [07](07-authentication-and-security.md)
- Realtime/streaming → [08](08-api-and-realtime-workflows.md)
- Testing → [09](09-testing-and-code-quality.md)
- Run/deploy the project → [10](10-development-and-deployment-guide.md)
- Interview prep → [11](11-interview-questions-and-answers.md)
