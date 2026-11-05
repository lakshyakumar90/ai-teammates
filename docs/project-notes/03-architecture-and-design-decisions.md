# 03 — Architecture and Design Decisions

> Part of the AI Teammates project notes. Read after [02 — Tech Stack Deep Dive](02-tech-stack-deep-dive.md).
> Maps directly to [README](README.md) and [`diagrams/system-architecture.mmd`](diagrams/system-architecture.mmd).

---

## 1. High-Level Architecture Overview

AI Teammates is structured around a **decoupled web and execution architecture**. The application separates fast, interactive web routing from long-running, stateful agent execution and containerized Linux sandboxing.

```text
┌──────────────────────────────────────────────────────────────────────────┐
│                             Client (Browser)                             │
│  - React 19 RSC/Client Components   - Base UI Primitives (Base Nova)     │
│  - SSE Streaming Hook (@trigger.dev/sdk/chat/react)  - noVNC RFB Canvas  │
└───────────────────▲──────────────────────────────────────▲───────────────┘
                    │ HTTPS (Server Actions / RSC)         │ SSE (1h Scoped PAT)
┌───────────────────▼──────────────────────────┐           │
│         Vercel: Next.js 16 Web Tier          │           │
│  - Middleware: proxy.ts (clerkMiddleware)    │           │
│  - Server Actions: actions/*.ts              │           │
│  - Route Handlers: app/api/connections/*     │           │
│  - Shared Library: lib/                      │           │
└─────────────┬──────────────────────────┬─────┘           │
              │ Drizzle HTTP Queries     │ Mint PAT        │
              ▼                          ▼                 ▼
┌───────────────────────────┐    ┌─────────────────────────────────────────┐
│     Neon Serverless DB    │    │      Trigger.dev Cloud: Worker Tier     │
│  - 13 Relational Tables   │    │  - Node 24 Runtime                      │
│  - CAS Leases & Periods   │    │  - chat-agent (chat.agent loop)         │
│  - Group & User Memories  │    │  - stop-sandbox-lease (delayed 5m)      │
│  - Encrypted OAuth Tokens │    │  - recover-expired-sandbox-leases (1m)  │
└───────────────────────────┘    └──────────────┬──────────────────────────┘
                                                │
                                 ┌──────────────┴──────────────┐
                                 ▼                             ▼
                  ┌─────────────────────────────┐ ┌────────────────────────┐
                  │      Daytona Sandboxes      │ │  User-Owned Model APIs │
                  │ - Linux Container (Ubuntu)  │ │ - Google Gemini Flash  │
                  │ - Bash / FS / Mouse / Keys  │ │ - OpenRouter           │
                  │ - MEMORY.md file storage    │ │ - OpenAI / ChatGPT OAU │
                  │ - noVNC WebSocket Stream    │ └────────────────────────┘
                  └─────────────────────────────┘
```

### Component Communication Pathways

1. **Browser ↔ Next.js Web Tier:**
   - Standard page navigations fetch server-rendered React components (RSC).
   - User interactions (creating a bot, updating memory toggles, saving API keys) invoke **Next.js Server Actions** over HTTP POST.
   - `proxy.ts` verifies session authenticity before any action or page executes.

2. **Next.js Web Tier ↔ Database (Neon):**
   - The web tier executes queries through `@neondatabase/serverless` using stateless HTTP requests.
   - Eliminates TCP handshake latency and pool exhaustion.

3. **Next.js Web Tier ↔ Trigger.dev Worker:**
   - When a user sends a message, `actions/chat.ts` initiates a session via `@trigger.dev/sdk/v3`.
   - The server mints a 1-hour Public Access Token (PAT) scoped to that session ID and passes it to the client.
   - The client connects directly to Trigger.dev's SSE stream, bypassing Vercel execution limits.

4. **Trigger.dev Worker ↔ Daytona Sandbox & AI Models:**
   - The worker runs `chat-agent`, which loads user memories and system instructions.
   - The agent invokes external LLMs using the user's decrypted personal API keys.
   - When the LLM calls computer tools (`bash`, `write_file`, `mouse_click`), the worker sends commands to Daytona's REST/gRPC endpoints.
   - Daytona streams live VNC video to the client's browser canvas via a signed WebSocket URL.

---

## 2. Deep Dive: Key Architectural Decisions

### Decision 1: Decoupling Web Serving (Next.js) from Agent Execution (Trigger.dev)

- **The Problem:** AI agents utilizing computer tools (running compilers, web scraping, navigating UI) can take 1–5 minutes per turn. Hosting this inside Next.js serverless functions on Vercel triggers execution timeouts (maximum 15–60 seconds on hobby/pro plans) and risks connection drops.
- **The Chosen Solution:** Offload all chat orchestration, tool loops, and container lifecycle tasks to **Trigger.dev v4** workers running on Node 24. Next.js only initiates the task and returns a public streaming token.
- **Alternatives Considered:**
  1. *Dedicated Express/Fastify long-lived server:* High operational maintenance (deploying clusters, managing auto-scaling, handling SSL).
  2. *BullMQ + Redis with custom worker:* Requires running a dedicated Redis instance and custom SSE streaming gateway.
- **Advantages:**
  - Zero Vercel timeout issues.
  - Built-in durable retries, run tracking, and execution history.
  - Zero server maintenance when idle.
- **Disadvantages:** Introduces a dependency on Trigger.dev Cloud; requires dual development processes locally (`next dev` and `trigger dev`).
- **Scaling Implications:** Easily handles thousands of concurrent long-running agent turns without saturating the Next.js web application servers.
- **When would we change this?** If customer compliance requires an entirely on-premises, air-gapped installation without third-party orchestrators.

---

### Decision 2: Bring-Your-Own-Key (BYOK) AI Model Infrastructure

- **The Problem:** Providing AI compute for unlimited sandbox tool loops (which generate thousands of tokens per minute) would require complex credit billing, expensive margins, and financial fraud risk from malicious users abusing cloud sandboxes.
- **The Chosen Solution:** AI Teammates charges only a flat $9/month workspace fee for infrastructure (sandboxes, storage, hosting) and requires users to provide their own Gemini, OpenRouter, or OpenAI API keys. The app never funds model tokens.
- **Alternatives Considered:**
  1. *Token markup / Credit system:* The app buys wholesale tokens and meters usage with credits.
  2. *Flat-rate unlimited AI:* Unviable due to extreme cost variance in agentic loops.
- **Advantages:**
  - Zero token liability or financial loss for the platform operator.
  - Users can choose high-end or budget models without platform pricing penalties.
  - Eliminates model access rate limits imposed by shared enterprise keys.
- **Disadvantages:** Friction during user onboarding; non-technical users may struggle to generate API keys.
- **Scaling Implications:** Platform scales with zero model COGS (Cost of Goods Sold) increase.
- **When would we change this?** If targeting non-technical enterprise consumers who demand consolidated billing on a single corporate invoice.

---

### Decision 3: Three-Tier Tiered Memory Model

- **The Problem:** Bots need context about the user, the current group conversation, and their own individual past actions. Storing all context in one flat database table causes prompt bloat, memory collisions, and privacy leaks between bots.
- **The Chosen Solution:** A three-tier memory architecture:
  1. **User Global Memory:** Stored in Neon (`user_memories` table). Facts about user preferences (e.g., "User prefers TypeScript over Python"). Shared across all bots if enabled.
  2. **Group Memory:** Stored in Neon (`group_memories` table). Facts scoped to a specific group chat (`chatId`).
  3. **Bot Individual Memory:** Stored directly inside the bot's Daytona sandbox filesystem as `~/MEMORY.md` (capped at 32KB). Private to that bot's computer.
- **Alternatives Considered:**
  1. *Vector RAG database (Pinecone/pgvector):* Overkill for individual user facts; introduces high latency and unpredictable retrieval hallucination.
  2. *Single monolithic memory table:* Risks exposing bot-private working notes to group members.
- **Advantages:**
  - Grounded deterministic fact retrieval without embedding latency.
  - Bot memory stays coupled with the bot's sandbox filesystem; deleting or resetting the sandbox cleanly resets bot internal state.
  - User retains full control via privacy toggles (`memory_preferences` table).
- **Disadvantages:** Bot memory requires the sandbox filesystem to be accessible; if Daytona is unreachable, bot memory cannot be read.
- **Scaling Implications:** Memory lookups are $O(1)$ key-value reads, avoiding expensive vector similarity calculations.
- **When would we change this?** If conversations spanned millions of messages requiring semantic search over archival history.

---

### Decision 4: Compare-And-Swap (CAS) Lease Management for Sandboxes

- **The Problem:** Running a cloud sandbox 24/7 costs significant money. Furthermore, users should only have 1 active sandbox running simultaneously to prevent resource abuse. If two browser tabs or group bots initiate turns at once, concurrent race conditions could provision duplicate sandboxes.
- **The Chosen Solution:** Atomic Compare-And-Swap (CAS) updates in Neon Postgres (`sandbox_leases` table). The lease records `userId`, `sandboxId`, `startsAt`, `endsAt`, and `stoppingUntil`. An update query only succeeds if the lease has expired or belongs to the current caller.
- **Alternatives Considered:**
  1. *Distributed Redis locks (Redlock):* Adds another stateful infrastructure dependency.
  2. *Application-level mutexes in memory:* Fails across multi-instance serverless deployments.
- **Advantages:**
  - Guaranteed single running sandbox per user across all web lambdas and workers.
  - Automatic reclamation via delayed tasks and a 1-minute fallback cron job.
- **Disadvantages:** If a lease operation fails to update the DB cleanly, a container might run until the 1-minute cron reclaims it.
- **Scaling Implications:** Relies on PostgreSQL's row-level locking, easily scaling to millions of lease transitions.
- **When would we change this?** If users are upgraded to Enterprise tiers supporting multi-sandbox parallel bot swarms.

---

### Decision 5: Clerk Private Metadata for API Key Storage

- **The Problem:** Storing raw API keys in the database poses a major security liability if database backups or logs are exposed.
- **The Chosen Solution:** User API keys are validated against the provider (`lib/ai/provider-key-validation.ts`) and then stored inside Clerk's encrypted `privateMetadata`. They are never returned to client-side session tokens.
- **Alternatives Considered:**
  1. *Encrypted columns in Neon Postgres:* Requires maintaining AES encryption keys and secure KMS key rotation in Next.js.
  2. *Client-side LocalStorage:* Keys would be exposed to browser XSS attacks and could not be used by background workers.
- **Advantages:**
  - Zero API key credentials reside in the Neon database.
  - Leverages Clerk's SOC2-compliant encrypted key-value storage.
- **Disadvantages:** Extra network round-trip to Clerk API when fetching keys inside worker runs.
- **Scaling Implications:** Bounded by Clerk's management API rate limits (mitigated by caching during worker runs).
- **When would we change this?** If Clerk API rate limits become a bottleneck under enterprise load, moving to AWS KMS / HashiCorp Vault.

---

## 3. Monorepo vs. Single Repository Architecture

### Current Structure: Unified Next.js Repository with pnpm Workspaces
AI Teammates utilizes a **single repository** layout configured with `pnpm-workspace.yaml`.

```text
ai-teammates/
├── app/                  # Next.js App Router (UI routes & pages)
├── actions/              # Next.js Server Actions (RPC endpoints)
├── components/           # React UI components (Base UI + Tailwind)
├── lib/                  # Shared core domain logic (AI, DB, Auth, Daytona)
│   ├── ai/               # AI prompts, tools, memory, models
│   └── db/               # Drizzle schema, client, relations
├── trigger/              # Trigger.dev worker tasks and agents
├── tests/                # Test suites (Vitest + Node:test)
└── docs/                 # Documentation knowledge base
```

### Why a Unified Single Package?
1. **Shared Domain Layer (`lib/`):** Both Next.js server actions and Trigger.dev workers must share exact database schemas (`lib/db/schema.ts`), billing policies (`lib/billing.ts`), and Daytona clients (`lib/daytona.ts`). Maintaining them in the same codebase eliminates version desynchronization.
2. **Atomic Commits:** Changes to a tool definition (`lib/ai/computer-tools.ts`) and its UI display (`components/ai-elements/tool.tsx`) happen in a single Git commit without coordinating multi-package publish workflows.
3. **Low Complexity:** No need for complex monorepo tooling like Turborepo, Nx, or Changesets.

### When to Transition to a Multi-Package Monorepo?
A transition to a formal monorepo (`packages/ui`, `packages/db`, `apps/web`, `apps/worker`) would be justified if:
- A separate mobile app (React Native / Expo) or desktop app (Electron) is added that needs `packages/db` without Next.js dependencies.
- The Trigger.dev worker requires distinct native C++ compilation modules or separate Docker build pipelines incompatible with Vercel's bundler.

---

## 4. Architectural Boundaries and Dependency Rules

To prevent code corruption and accidental serverless bundle bloat, strict architectural boundaries are maintained:

```text
[ Browser / Client ] ──(Only calls)──► [ Server Actions / Route Handlers ]
         │                                            │
   (Never imports)                             (Imports shared)
         │                                            │
         ▼                                            ▼
[ lib/ai/computer-tools.ts ] ◄───────────────── [ lib/ ] Core
[ lib/db/schema.ts         ] ◄───────────────── [ lib/ ] Core
         ▲
         │
   (Imports shared)
         │
[ Trigger.dev Worker (trigger/*.ts) ]
```

### Enforced Boundary Invariants

1. **Client Components Never Import Server Libraries:**
   - Client components (`components/*.tsx`) must never import from `lib/db/client.ts`, `lib/daytona.ts`, or `@clerk/nextjs/server`. Doing so would leak server credentials and fail Next.js client bundling.

2. **Web Tier Never Runs Direct Sandbox Tools:**
   - Server Actions in `actions/chat.ts` never execute bash commands or launch Daytona sandboxes directly. They strictly validate authorization and dispatch execution to Trigger.dev.

3. **No Direct Model Calls from the Browser:**
   - The browser never communicates with OpenAI, Gemini, or OpenRouter directly. All prompts and keys pass through server-controlled worker pipelines to enforce privacy scrubbing and lease tracking.

4. **Worker Never Imports Client UI:**
   - Trigger tasks in `trigger/*.ts` are pure Node.js services. They never import React components, hooks, or DOM utilities.
