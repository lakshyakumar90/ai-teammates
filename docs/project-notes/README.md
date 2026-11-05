# AI Teammates — Project Notes

A complete technical knowledge base for the **AI Teammates** repository: architecture,
technology rationales, file-by-file reference, feature walkthroughs, database internals,
security, testing, deployment, a from-scratch rebuild guide, and a project-specific
interview preparation bank.

These notes document the **actual implementation** in this repository. Anything not
implemented is labeled as such; technology-choice rationales that are not recorded in
repository history are explicitly marked as *retrospective architectural justifications*.
No secret values are reproduced anywhere in this documentation.

---

## What the application does

Create AI bots with names, avatars, jobs, instructions, and **individual cloud computers**
(Daytona sandboxes). Talk to bots privately or bring them together in a group chat with
`@mentions`, a selectable responder, and bot-to-bot handoffs. Memory works at three
scopes (global, per-group, per-bot). AI is supplied exclusively through the signed-in
user's own Gemini/OpenRouter/OpenAI API key or an eligible ChatGPT plan connection — the
app provides **no AI credits**. The workspace is gated by a Clerk Billing **Pro
subscription ($9/month)**; Free accounts can browse plans but not use bots or sandboxes.

- Product definition: [`PRODUCT.md`](../../PRODUCT.md)
- Deployment record: [`DEPLOYMENT.md`](../../DEPLOYMENT.md)
- Agent/contributor rules: [`AGENTS.md`](../../AGENTS.md)

## Actual technology stack

| Concern | Technology |
|---|---|
| Language | TypeScript 5 (strict) |
| Web framework | Next.js 16.4 App Router on React 19.3 |
| UI | Tailwind CSS v4 (CSS-first), shadcn-style components on Base UI (`base-nova`), lucide, next-themes |
| AI | Vercel AI SDK v7 (`ai`, `@ai-sdk/react`, provider SDKs) |
| Agentic runtime / realtime | Trigger.dev v4 (`chat.agent`, delayed + scheduled tasks, session streaming) |
| Database | Neon Postgres via `@neondatabase/serverless` HTTP driver + Drizzle ORM |
| Auth + billing | Clerk (`@clerk/nextjs`) + Clerk Billing (Pro $9/mo) |
| Sandboxes | Daytona (≤2 vCPU / 4 GiB / 10 GiB), noVNC desktop viewing |
| ChatGPT | Hosted OAuth (implemented, disabled) + experimental `@openai-oauth` community flow |
| Avatars | DiceBear 10 |
| Observability | Sentry (browser/server/edge/worker, scrubbed logs) |
| Testing | Vitest (UI) + `node:test` (unit/integration; 4 suites need a live DB) |
| Tooling | pnpm, ESLint 9, Prettier, `tsc --noEmit` |
| Hosting | Vercel (web), Trigger.dev Cloud (worker), Neon, Clerk, Daytona, Sentry |
| CI | None — manual quality gates (see [10](10-development-and-deployment-guide.md)) |

## High-level architecture

```text
Browser ─► Vercel (Next.js: RSC pages, Server Actions, 3 OAuth route handlers)
             ├─► Neon Postgres (Drizzle, HTTP driver)
             ├─► Clerk (sessions, billing, private metadata = user API keys)
             └─► Trigger.dev ─► Worker (Node 24)
                    ├─► chat-agent: plan check → user's key → memory → tools → stream
                    ├─► stop-sandbox-lease (delayed) · recover-expired-sandbox-leases (cron)
                    ├─► Gemini / OpenRouter / OpenAI / ChatGPT (user-owned credentials)
                    └─► Daytona sandbox (bash/files/desktop) + signed VNC URL
```

Two runtime processes (Next.js server, Trigger.dev worker) share the `lib/` layer. The
browser talks to Trigger.dev sessions over SSE using 1-hour scoped public tokens minted
by server actions.

## Documentation map

| # | Document | What it answers |
|---|---|---|
| 00 | [README.md](README.md) | Entry point, reading order, diagram index (this file) |
| 01 | [Project overview](01-project-overview.md) | What the app is, features, stack summary, request lifecycle |
| 02 | [Tech stack deep dive](02-tech-stack-deep-dive.md) | Every technology: what/why/alternatives/disadvantages/interview Qs |
| 03 | [Architecture & design decisions](03-architecture-and-design-decisions.md) | System design, decisions with trade-offs, monorepo question, dependency graph |
| 04 | [Folder & file reference](04-folder-and-file-reference.md) | Every folder and important file: purpose, exports, consumers |
| 05 | [Feature & code walkthroughs](05-feature-and-code-walkthroughs.md) | Each feature end to end: UI → actions → worker → DB |
| 06 | [Database & data models](06-database-and-data-models.md) | Schema, ER diagram, CAS patterns, integrity, alternatives |
| 07 | [Authentication & security](07-authentication-and-security.md) | Clerk flows, authorization, threat/control table, gaps |
| 08 | [API & realtime workflows](08-api-and-realtime-workflows.md) | Server-action API surface, chat streaming lifecycle, group handoff |
| 09 | [Testing & code quality](09-testing-and-code-quality.md) | Both test frameworks, what each suite proves, how to add tests |
| 10 | [Development & deployment guide](10-development-and-deployment-guide.md) | Setup, env vars (names only), commands, deploy, troubleshooting |
| 11 | [Interview questions & answers](11-interview-questions-and-answers.md) | Project-specific question bank (basic → senior) with two-tier answers |
| 12 | [Build-from-scratch guide](12-build-from-scratch-guide.md) | Rebuilding the same product today, stage by stage |
| 13 | [Scalability & performance](13-scalability-and-performance.md) | Current bottlenecks, what scales, what would change |
| 14 | [Improvements & technical debt](14-improvements-and-technical-debt.md) | Prioritized findings with evidence and recommended fixes |
| 15 | [Glossary & quick revision](15-glossary-and-quick-revision.md) | Terms, one-page revision sheet, rapid-fire Q&A |
| 16 | [Improvements playbook](16-improvements-playbook.md) | What to build, how to build it, pros/cons, and interview answers for "why didn't you implement it?" |

## Diagrams (Mermaid source files)

| File | Content |
|---|---|
| [`diagrams/system-architecture.mmd`](diagrams/system-architecture.mmd) | High-level system: browser, web app, worker, DB, external services |
| [`diagrams/repository-architecture.mmd`](diagrams/repository-architecture.mmd) | Folder/module dependency map |
| [`diagrams/frontend-architecture.mmd`](diagrams/frontend-architecture.mmd) | Routes, layout gate, components, hooks, state |
| [`diagrams/backend-architecture.mmd`](diagrams/backend-architecture.mmd) | Actions, policies, DB layer, worker tasks, shared `lib/` |
| [`diagrams/database-er.mmd`](diagrams/database-er.mmd) | Entity-relationship diagram of all 13 tables |
| [`diagrams/authentication-flow.mmd`](diagrams/authentication-flow.mmd) | Sign-in, session, server-action and worker authorization |
| [`diagrams/api-request-lifecycle.mmd`](diagrams/api-request-lifecycle.mmd) | Client → action → policy → DB/response |
| [`diagrams/realtime-workflow.mmd`](diagrams/realtime-workflow.mmd) | Chat session, token, stream, reconnect, stop |
| [`diagrams/deployment-workflow.mmd`](diagrams/deployment-workflow.mmd) | Dev → build → test → Vercel + Trigger.dev deploys |
| [`diagrams/feature-workflows/`](diagrams/feature-workflows/) | Bot creation, chat turn, group handoff, sandbox lease, API key save, ChatGPT connect |

Every diagram reflects implemented behavior; anything suggested but not built is drawn
dashed and annotated.

## Recommended reading order

**First pass (understand the product):** 01 → 05 (skim feature list) → 03.

**Second pass (own the internals):** 04 → 06 → 08 → 07 → 09 → 10.

**Interview preparation:**
1. Read [01](01-project-overview.md) until you can explain the product in 60 seconds.
2. Study [02](02-tech-stack-deep-dive.md) — each technology has ready-made Q&A.
3. Practice [11](11-interview-questions-and-answers.md) — simple answer first, then the
   deep-dive answer for every question.
4. Rehearse whiteboarding from the `diagrams/` files with [03](03-architecture-and-design-decisions.md).
5. Use [15](15-glossary-and-quick-revision.md) the night before.

**Quick interview links:** [project overview Qs](11-interview-questions-and-answers.md#project-overview) ·
[architecture Qs](11-interview-questions-and-answers.md#architecture) ·
[technology selection Qs](11-interview-questions-and-answers.md#technology-selection) ·
[scenario-based Qs](11-interview-questions-and-answers.md#scenario-based) ·
[senior-level Qs](11-interview-questions-and-answers.md#advanced-and-senior-level)

## Ground rules these notes follow

- **Evidence over assumption.** Every claim traces to a file, function, or route.
- **Implemented vs. recommended** are always separated.
- **No invented decisions.** Where history is unknown, the text says so and presents a
  defensible retrospective justification instead.
- **No secrets.** Environment variables are documented by name, purpose, and consumer
  only — never by value.
- **Documentation-only change set.** Nothing outside `docs/project-notes/` was modified.
