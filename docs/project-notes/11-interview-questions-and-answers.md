# 11 — Interview Questions & Answers

> Part of the AI Teammates project notes. Read after [10 — Development & Deployment Guide](10-development-and-deployment-guide.md).
> Maps directly to [README](README.md) and all preceding architectural documentation.

This guide provides a comprehensive technical interview preparation question bank tailored specifically to the **AI Teammates** repository. Every question includes a **Simple Answer** (concise 60-second summary) followed by a **Deep-Dive Answer** (architectural details, exact code files, algorithms, and trade-offs).

---

## 1. Project Overview & Elevator Pitch

### Q1: Can you give me a high-level overview of AI Teammates?
- **Simple Answer:** AI Teammates is a full-stack web application where users create personal AI bots with custom instructions and dedicated cloud computers (Daytona Linux sandboxes). Users can talk to them one-on-one or collaborate in multi-bot group chats with bot-to-bot handoffs, live desktop VNC streaming, and grounded memory across three scopes.
- **Deep-Dive Answer:** The application decouples fast web routing on Next.js 16 (App Router) from long-running agent execution on Trigger.dev v4 Node 24 workers. AI is powered entirely by the user's personal API keys (Gemini, OpenRouter, OpenAI) or ChatGPT OAuth, keeping platform operational costs strictly fixed. Infrastructure is gated behind a Clerk Billing Pro plan ($9/mo) and backed by Neon Serverless PostgreSQL with Drizzle ORM.

### Q2: Why does the product enforce Bring-Your-Own-Key (BYOK) instead of selling AI credits?
- **Simple Answer:** To eliminate token liability and financial risk. Cloud sandboxes running bash and desktop loops consume thousands of tokens per minute; BYOK ensures variable model costs bill directly to the user's provider account.
- **Deep-Dive Answer:** In an agentic system where bots autonomously execute compiler builds, run tests, and manipulate Linux desktops, token consumption is non-deterministic and can spike unpredictably. If the platform sold credits or offered flat-rate AI, a few power users could exhaust the platform's margins. By decoupling compute hosting ($9/mo flat fee) from AI generation (BYOK), the platform scales with zero model Cost of Goods Sold (COGS).

---

## 2. Architecture & System Design

### Q3: Why decouple Next.js on Vercel from Trigger.dev for agent execution?
- **Simple Answer:** Vercel serverless functions have short execution timeouts (15–60s) and cannot sustain multi-minute agent tool-use loops. Trigger.dev workers run durable tasks on Node 24 without serverless timeout limits.
- **Deep-Dive Answer:** In `trigger/chat.ts`, a bot interacting with a Daytona sandbox can spend minutes executing terminal commands, awaiting network requests, and generating code. Next.js handles fast, transactional RPCs via Server Actions (`actions/chat.ts`), which mint a 1-hour Public Access Token (PAT) and delegate execution to Trigger.dev. The browser connects directly to Trigger.dev's SSE stream, eliminating serverless connection limits and timeout errors.

### Q4: How does the application avoid TCP connection pool exhaustion on PostgreSQL?
- **Simple Answer:** By using Neon's serverless HTTP driver (`@neondatabase/serverless`) instead of traditional persistent TCP sockets.
- **Deep-Dive Answer:** In serverless architectures, hundreds of ephemeral lambdas spinning up simultaneously can instantly exhaust PgBouncer or standard PostgreSQL connection pools. The Neon HTTP driver in `lib/db/client.ts` executes SQL queries over stateless HTTP POST requests. Each query is self-contained, requiring zero connection handshake overhead and zero persistent socket slots.

---

## 3. Technology Selection & Trade-offs

### Q5: Why did you choose Drizzle ORM over Prisma?
- **Simple Answer:** Drizzle has zero binary dependencies, compiles to simple SQL queries, and avoids Prisma's heavy Rust engine, reducing serverless cold starts.
- **Deep-Dive Answer:** Prisma bundles a 15–30MB Rust binary engine that must be unpacked and loaded into memory on every cold start, introducing 200–500ms of latency. Drizzle is a lightweight TypeScript query builder with near-zero cold start overhead. Furthermore, `drizzle-zod` generates runtime validation schemas (such as `insertBotSchema` in `lib/db/schema.ts`) directly from table definitions, maintaining single-source-of-truth DRY across client forms and the database.

### Q6: Why Base UI (`base-nova`) instead of Radix UI or Material UI?
- **Simple Answer:** Base UI is completely unstyled and headless, modernly architected for React 19 without runtime CSS-in-JS performance bottlenecks.
- **Deep-Dive Answer:** Component libraries like MUI use emotion/styled-components, injecting CSS strings at runtime, which breaks React Server Components and degrades streaming SSR. Base UI provides accessible, unstyled primitives (focus traps, dialog portals, ARIA states) styled cleanly with Tailwind CSS v4's CSS-first `@theme` variables in `app/globals.css`.

---

## 4. Data Modeling & Concurrency

### Q7: How does AI Teammates prevent concurrent race conditions when provisioning sandboxes?
- **Simple Answer:** By executing atomic Compare-And-Swap (CAS) SQL updates in PostgreSQL on the `sandbox_leases` table.
- **Deep-Dive Answer:** Rather than relying on external distributed lock managers like Redis Redlock, `lib/sandbox-usage.ts` executes an atomic `insert(...).onConflictDoUpdate(...)` query with a `where` condition checking that `sandbox_leases.endsAt < now()`. If another concurrent request holds an active lease, the update condition fails, the row is unchanged, and the second request is immediately blocked from launching a duplicate container.

### Q8: Explain the three-tier memory model and where each tier is stored.
- **Simple Answer:** User memory is stored in Neon (`user_memories`), group memory is stored in Neon (`group_memories`), and bot individual memory is stored inside the bot's Daytona sandbox filesystem as `~/MEMORY.md`.
- **Deep-Dive Answer:**
  1. **Global User Memory:** Structured facts about user preferences, stored in Neon and shared across all bots if permitted by `memory_preferences`.
  2. **Group Memory:** Facts specific to a collaborative group room (`chatId`), stored in Neon and visible to all member bots.
  3. **Bot Memory:** A private scratchpad stored inside the bot's container (`~/MEMORY.md`), validated by `memoryContentSchema` to contain markdown bullets ($\le 32$KB). This cleanly couples bot memory with the container lifespan.

---

## 5. Security & Privacy

### Q9: How are personal API keys secured if they are not stored in the database?
- **Simple Answer:** Keys are stored in Clerk's encrypted `privateMetadata`, which is inaccessible to client-side sessions and browser JavaScript.
- **Deep-Dive Answer:** In `actions/api-keys.ts`, after live validation against vendor APIs, the key is written directly to Clerk via backend SDK calls (`clerkClient().users.updateUserMetadata`). Clerk encrypts `privateMetadata` at rest. It is never included in the browser session JWT. The Trigger.dev worker fetches the key over HTTPS immediately before invoking the model and holds it only in ephemeral worker memory.

### Q10: How does Sentry error tracking prevent leaking user prompts and API keys?
- **Simple Answer:** Through custom privacy scrubbing in `lib/sentry-privacy.ts` that redacts authorization headers, regex patterns matching API keys, and prompt payloads before transmission.
- **Deep-Dive Answer:** `lib/sentry-privacy.ts` binds `beforeSend` sanitization hooks across Next.js server, client, and Trigger.dev runtimes. It uses regular expressions targeting key prefixes (`AIza*`, `sk-or-*`, `sk-*`), strips sensitive HTTP request headers (`authorization`, `cookie`), and redacts raw conversation payloads from exception contexts.

---

## 6. Scenario-Based & Troubleshooting Questions

### Q11: What happens if a Daytona sandbox crashes or becomes unresponsive during a tool turn?
- **Simple Answer:** The tool call encounters an execution timeout, marks the lease for cleanup, and returns a structured error to the LLM so it can inform the user gracefully.
- **Deep-Dive Answer:** `lib/ai/response-timeout.ts` enforces execution deadlines on Daytona REST/gRPC calls. If a command hangs or the container crashes, the promise rejects, catching inside `trigger/chat.ts`. The error is transformed by `lib/ai/chat-error.ts` into a friendly markdown warning. Meanwhile, the 1-minute `recover-expired-sandbox-leases` cron detects the stale lease and triggers container destruction.

### Q12: How does the system handle a user opening two browser tabs and sending messages simultaneously?
- **Simple Answer:** The first message acquires the user's single sandbox lease; the second message is rejected with a lease conflict error or queued until the active lease expires.
- **Deep-Dive Answer:** Because `sandbox_leases` enforces a primary key on `userId`, only one active lease can exist. The second tab's `acquireSandboxLease()` fails the CAS condition and throws a user-facing error explaining that a sandbox is already active in another session, preventing container proliferation.

---

## 7. Advanced & Senior-Level Questions

### Q13: If this application scaled to 100,000 daily active users, where would the architectural bottlenecks appear?
- **Simple Answer:** In Daytona sandbox provisioning capacity, Neon HTTP query volume, and Clerk API rate limits for fetching user keys.
- **Deep-Dive Answer:**
  1. **Sandbox Cold Starts:** Provisioning thousands of Linux containers per minute would saturate Daytona's cluster scheduler. We would introduce a warm container pool pre-warmed with base Ubuntu/noVNC images.
  2. **Clerk Rate Limits:** Fetching `privateMetadata` on every worker turn would hit Clerk management API limits. We would migrate user key storage to AWS KMS with local Redis caching.
  3. **Group Handoff Latency:** Re-synthesizing context across multiple bot handoffs consumes redundant tokens. We would implement structured KV caching or prompt prefix caching (available in Gemini and Claude).

### Q14: How does multi-bot handoff avoid infinite loops if Bot A and Bot B keep passing work back and forth?
- **Simple Answer:** By enforcing a strict turn limit and tracking handoff depth inside the worker execution loop.
- **Deep-Dive Answer:** In `lib/ai/group-handoff.ts`, each handoff increments an execution step counter. If the number of bot-to-bot handoffs exceeds a safe threshold (e.g., 5 handoffs per user prompt), the `handoff` tool is disabled, forcing the active bot to summarize the current progress and return final output to the user.
