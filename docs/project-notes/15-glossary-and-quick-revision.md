# 15 — Glossary & Quick Revision

> Part of the AI Teammates project notes. Read after [14 — Improvements & Technical Debt](14-improvements-and-technical-debt.md).
> Maps directly to [README](README.md) and serves as the ultimate interview cheat sheet.

---

## 1. Technical Glossary

- **BYOK (Bring Your Own Key):** Architectural model where users provide their own provider API keys (Gemini, OpenRouter, OpenAI); the platform bills $0 for model tokens.
- **CAS (Compare-And-Swap):** Concurrency control technique where an atomic SQL update only succeeds if the record matches expected state (used in `sandbox_leases` to ensure $\le 1$ running container).
- **Daytona:** Infrastructure platform providing on-demand, containerized Linux development sandboxes with terminal and GUI capabilities.
- **Drizzle ORM:** A lightweight, type-safe TypeScript ORM with zero binary overhead and direct SQL dialect mapping.
- **Neon:** Serverless PostgreSQL database with decoupled storage and compute, supporting stateless queries over HTTP POST.
- **noVNC / RFB:** Remote FrameBuffer protocol client implemented in HTML5/JavaScript to stream Linux X11 desktops over WebSockets to an HTML5 canvas.
- **PAT (Public Access Token):** A short-lived (1-hour) scoped cryptographic token minted by Trigger.dev allowing browser clients to connect directly to background task SSE streams.
- **RSC (React Server Components):** React components rendered exclusively on the server that emit zero JavaScript to the client bundle.
- **Server Action:** Next.js 16 RPC mechanism allowing client components to invoke server-side functions directly over HTTP POST.
- **Trigger.dev v4:** Durable execution and background worker framework running on Node 24 that hosts the long-lived `chat-agent` loop without serverless timeout limits.
- **Vercel AI SDK v7:** TypeScript library providing standardized multi-provider streaming, model abstractions, and tool calling via Zod schemas.

---

## 2. One-Page Architecture Cheat Sheet

### System Summary in 5 Bullets
1. **Frontend:** Next.js 16 App Router on React 19, styled with Tailwind v4 (CSS-first) and headless Base UI (`base-nova`).
2. **Execution Worker:** Long-running AI loops run on Trigger.dev v4 Node 24 workers (`chat-agent`), streaming real-time text and tool cards over SSE.
3. **Database:** 13 tables in Neon PostgreSQL accessed via `@neondatabase/serverless` HTTP driver and Drizzle ORM.
4. **Sandboxes:** Each bot has access to an isolated Daytona Linux container (max 2 vCPU, 4 GiB RAM, 10 GiB disk) with live noVNC desktop streaming.
5. **Business Model:** Workspace gated by a $9/mo Clerk Billing Pro plan; AI is powered strictly by the user's personal API keys (zero token liability).

### Database Schema in 13 Lines
- `bots`: Bot personas, job descriptions, instructions, DiceBear avatars.
- `chats`: Conversation rooms (direct 1-on-1 and multi-bot groups).
- `chat_members`: Junction table linking bots to chat rooms (Many-to-Many).
- `user_memories`: Persistent key-value facts about the user across all chats.
- `group_memories`: Persistent facts scoped specifically to a group chat room.
- `memory_preferences`: User privacy toggles for automatic memory capture.
- `sandbox_leases`: CAS tracking enforcing $\le 1$ active Daytona sandbox per user.
- `usage_periods`: Monthly billing period boundaries and 20-hour quota tracker.
- `usage_entries`: Granular ledger of sandbox sessions and token runtimes.
- `worker_runs`: Reconciles Trigger.dev worker task runs against billing periods.
- `bot_capacity`: Tracks active bot allocations per user (max 3 on Pro).
- `chatgpt_connections`: Encrypted AES-256-GCM OAuth tokens for ChatGPT Plus.
- `oauth_attempts`: Ephemeral SHA-256 hashed state storage for PKCE verification.

### Critical Invariants (Never Break These)
1. **Never store user API keys in Neon:** Store exclusively in Clerk `privateMetadata`.
2. **Never exceed 1 active sandbox per user:** Enforce via atomic CAS on `sandbox_leases`.
3. **Never run agent tool loops in Next.js actions:** Always dispatch to Trigger.dev.
4. **Never execute raw unparameterized SQL:** Always use Drizzle query builders.
5. **Never emit unscrubbed prompts or keys to Sentry:** Always filter via `sentry-privacy.ts`.

---

## 3. Rapid-Fire Revision Q&A (20 Questions)

1. **Q: What framework powers the web tier?**
   - **A:** Next.js 16.4 App Router on React 19.3.
2. **Q: Where are long-running AI turns executed?**
   - **A:** In Trigger.dev v4 Node 24 background workers (`chat-agent`).
3. **Q: How does the browser receive streaming tokens?**
   - **A:** Direct Server-Sent Events (SSE) connection to Trigger.dev using a 1-hour Public Access Token.
4. **Q: How are personal API keys verified?**
   - **A:** Live validation request to vendor endpoints before saving to Clerk `privateMetadata`.
5. **Q: What prevents concurrent duplicate sandboxes?**
   - **A:** Atomic Compare-And-Swap (CAS) SQL updates on `sandbox_leases`.
6. **Q: How long does an idle sandbox stay alive?**
   - **A:** 5 minutes (enforced by delayed task `stop-sandbox-lease`).
7. **Q: What runs every 1 minute in the background?**
   - **A:** `recover-expired-sandbox-leases` cron task, shutting down orphaned Daytona containers.
8. **Q: What are the sandbox container resource limits?**
   - **A:** Max 2 vCPUs, 4 GiB RAM, 10 GiB disk.
9. **Q: How does the browser render the live desktop?**
   - **A:** noVNC RFB client connecting over secure WebSockets to Daytona, rendered on an HTML5 canvas.
10. **Q: What is the monthly sandbox usage quota?**
    - **A:** 20 hours (72,000 seconds) per billing period.
11. **Q: What is the maximum number of bots on the Pro plan?**
    - **A:** 3 bots.
12. **Q: Where is bot-specific private memory stored?**
    - **A:** Inside the bot's Daytona sandbox filesystem as `~/MEMORY.md` (capped at 32KB).
13. **Q: Where is global user memory stored?**
    - **A:** In Neon PostgreSQL's `user_memories` table.
14. **Q: Why does the app use the Neon HTTP driver instead of TCP?**
    - **A:** To eliminate TCP connection pool exhaustion across serverless functions.
15. **Q: Why use Drizzle over Prisma?**
    - **A:** Zero binary dependencies, zero cold-start engine overhead, and automatic Zod schema generation via `drizzle-zod`.
16. **Q: What authentication provider is used?**
    - **A:** Clerk (`@clerk/nextjs`), with route protection via `proxy.ts`.
17. **Q: How are ChatGPT OAuth credentials encrypted at rest?**
    - **A:** AES-256-GCM encryption in `lib/connection-crypto.ts`.
18. **Q: What happens if a Free user attempts to run a chat turn?**
    - **A:** `requireUserPaidPlan()` blocks execution and renders `paid-access.tsx` upgrade modal.
19. **Q: What two testing frameworks are used?**
    - **A:** Vitest (7 UI suites) and `node:test` (22 backend/logic suites).
20. **Q: How are database changes applied?**
    - **A:** In-place schema synchronization via `drizzle-kit push` (`pnpm db:push`).
