# 02 — Tech Stack Deep Dive

> Part of the AI Teammates project notes. Read after [01 — Project Overview](01-project-overview.md).
> Maps directly to [README](README.md) and [11 — Interview Q&A](11-interview-questions-and-answers.md).

Every technology in AI Teammates was selected to balance developer velocity, zero-cost idle infrastructure, and prosumer isolation. This document provides an exhaustive technical analysis of each core component in the stack, following a rigorous 11-point evaluation format.

---

## 1. TypeScript 5 (Strict Mode)

### 1. What is it?
- **Simple:** A strongly typed programming language that builds on JavaScript by adding static type definitions so bugs are caught before code runs.
- **Technical:** A statically typed superset of ECMAScript targeting ES2022/Node 24 with strict null checking, discriminated unions, template literal types, and type-only imports/exports compiled down via Next.js SWC.

### 2. Where is it used in this project?
- Everywhere. Configured in `tsconfig.json` (`target: "ES2017"`, `strict: true`, `moduleResolution: "node"`).
- Shared domain types in `lib/db/schema.ts`, action signatures in `actions/*.ts`, tool schemas in `lib/ai/computer-tools.ts`, Trigger.dev agent definitions in `trigger/chat.ts`.

### 3. Why did we use it?
- Eliminates common runtime crashes (undefined property access, bad JSON shapes) across the distributed boundary between Vercel Server Actions and the Trigger.dev worker.
- End-to-end schema synchronization with Drizzle ORM and Zod (`drizzle-zod` generates TypeScript types directly from database tables).

### 4. Why is it suitable for this project?
- Strict inference ensures that AI tool parameters (`z.infer<typeof schema>`) align with Daytona SDK arguments.
- High DX with VSCode/Cursor and automated type checks via `pnpm run check` (`tsc --noEmit`).

### 5. What alternatives were available?
- Pure JavaScript (with JSDoc).
- Flow.
- ReScript / ReasonML.

### 6. Why did we not choose those alternatives?
*(Retrospective architectural justification)*
- **Pure JavaScript:** Unviable for a system with 13 database tables, complex streaming event objects, and multi-tool schemas.
- **Flow:** Deprecated in favor of TypeScript by the wider React ecosystem.
- **ReScript:** Too small an ecosystem; lack of native bindings for Vercel AI SDK and Daytona.

### 7. What are its disadvantages?
- Type compilation overhead; complex inference with deep recursive schemas (e.g., Vercel AI SDK `tool()` parameter typing).
- `tsconfig.tsbuildinfo` cache invalidation quirks during local development.

### 8. Could we build this ourselves?
- No. Implementing a static type system for JavaScript is a multi-decade compiler engineering effort.

### 9. What would we need to implement it from scratch?
- Parser/AST generator, bidirectional type checker, type inference engine, control flow graph analyzer, and code emitter.

### 10. When would we choose another technology?
- We would use Rust or Go if building high-throughput low-level networking proxies or VNC protocol decoders rather than a full-stack web application.

### 11. Interview questions & answers
- **Basic:** *Why is strict mode enabled in `tsconfig.json`?*
  - **Answer:** It activates `noImplicitAny`, `strictNullChecks`, `strictFunctionTypes`, and `strictBindCallApply`, forcing developers to explicitly handle `null` and `undefined` when querying Neon or reading Clerk metadata.
- **Intermediate:** *How does AI Teammates share types between database schema and client forms?*
  - **Answer:** We define Drizzle tables in `lib/db/schema.ts`, wrap them using `createInsertSchema` from `drizzle-zod`, and infer TypeScript types using `z.infer<>` in `components/bot-dialog.tsx` and `actions/bot.ts`.
- **Advanced:** *How does TypeScript safeguard tool calling inside `trigger/chat.ts`?*
  - **Answer:** The Vercel AI SDK's `tool({ parameters: z.object(...) })` enforces exact runtime validation and static typings for tool arguments passed to Daytona's file and desktop operations.

---

## 2. Next.js 16.4 (App Router) & React 19

### 1. What is it?
- **Simple:** A full-stack web framework built on React that handles server-side page rendering, URL routing, and server-side functions (Server Actions).
- **Technical:** Next.js 16.4 leveraging React 19 Server Components (RSC), Server Actions (`"use server"`), streaming SSR, nested layouts, and Route Handlers over Node/Edge runtimes.

### 2. Where is it used in this project?
- Application structure in `app/`: root layout (`app/layout.tsx`), landing page (`app/page.tsx`), route groupings `(account)` and `(dashboard)`, and API route handlers (`app/api/connections/chatgpt/*`).
- Server actions in `actions/*.ts` executing server-side logic directly called from client components.

### 3. Why did we use it?
- Next.js App Router allows zero-bundle-size React Server Components for heavy layout rendering while keeping interactive state confined to leaf components (`components/chat.tsx`, `components/chat-desktop.tsx`).
- Server Actions eliminate the need for a separate REST/GraphQL API boilerplate for typical CRUD operations.

### 4. Why is it suitable for this project?
- Native integration with Clerk via `proxy.ts` (Next.js middleware).
- Seamless deployment on Vercel with automatic edge routing, asset optimization, and zero cold-start HTTP driver routing to Neon.

### 5. What alternatives were available?
- Remix / React Router v7.
- Vite + React SPA with an Express/Fastify/NestJS backend.
- Astro.

### 6. Why did we not choose those alternatives?
*(Retrospective architectural justification)*
- **SPA + Express:** Doubles repository complexity, deployment targets, and authentication handshake overhead.
- **Remix:** Excellent, but Vercel AI SDK and Clerk have deepest day-one support and optimized server action hooks for Next.js.
- **Astro:** Primarily content-oriented; less native ergonomics for real-time streaming state and complex multi-dialog applications.

### 7. What are its disadvantages?
- Next.js server actions are tied to HTTP POST requests with serialization constraints.
- Long-running operations cannot stay open on standard serverless functions (which is why Trigger.dev was adopted for execution).

### 8. Could we build this ourselves?
- Building an RSC-compliant server-side streaming router on raw Node.js `http` and React 19's `react-dom/server` is technically feasible but would require thousands of lines of hydration and routing plumbing.

### 9. What would we need to implement it from scratch?
- Client-side pushState router, Node HTTP server, streaming HTML chunker, bundler with client/server boundary splitting, and serialization protocol for action payloads.

### 10. When would we choose another technology?
- If the application required long-lived bi-directional WebSocket connections directly on the web tier, a dedicated Fastify/Go server would be chosen over Next.js serverless functions.

### 11. Interview questions & answers
- **Basic:** *What is the difference between `app/page.tsx` and `components/chat.tsx`?*
  - **Answer:** `app/page.tsx` is a Server Component rendered on the server, while `components/chat.tsx` has `"use client"` and manages browser state, hooks, and streaming events.
- **Intermediate:** *Why use Server Actions (`actions/bot.ts`) instead of API routes?*
  - **Answer:** Server Actions provide type-safe RPCs directly callable from React components without configuring fetch URLs, headers, CSRF tokens, or separate serialization schemas.
- **Advanced:** *Why can't Next.js Server Actions run the full AI chat loop?*
  - **Answer:** Vercel serverless functions have execution timeout limits (15–60s) and memory constraints. AI tool-use loops with sandbox operations and desktop execution take minutes, requiring offloading to Trigger.dev workers.

---

## 3. Tailwind CSS v4 & Base UI (`base-nova`)

### 1. What is it?
- **Simple:** A utility-first CSS framework and an unstyled, accessible UI component primitives library.
- **Technical:** Tailwind v4 (CSS-first engine utilizing `@theme` directives without `tailwind.config.js`) paired with `@base-ui-components/react` (`base-nova`) and Lucide React icons.

### 2. Where is it used in this project?
- `app/globals.css` (Tailwind v4 imports, theme CSS variables, HSL color tokens).
- `components/ui/*` (Button, Dialog, Dropdown, Drawer, Card, Tooltip, Avatar, Bubble).
- `app/landing.module.css` (custom landing page hero animations and gradients).

### 3. Why did we use it?
- Tailwind v4 eliminates JavaScript-based PostCSS configuration bottlenecks.
- Base UI provides bulletproof accessibility (ARIA roles, keyboard focus traps, portal rendering) without the runtime overhead of heavy styling opinions.

### 4. Why is it suitable for this project?
- Allows rapid creation of a refined, dark-mode-first aesthetic (`next-themes`) matching modern AI interfaces like Claude and Cursor.

### 5. What alternatives were available?
- Material UI (MUI).
- Chakra UI.
- Pure CSS Modules.
- Radix UI + Tailwind v3.

### 6. Why did we not choose those alternatives?
*(Retrospective architectural justification)*
- **MUI/Chakra:** Runtime CSS-in-JS style injection damages React Server Component performance.
- **Radix UI:** Base UI is the next-generation unstyled primitive library with cleaner state hooks and superior Base Nova theme tokens.
- **Pure CSS Modules:** Too slow for prototyping complex responsive dashboards with hundreds of atomic variations.

### 7. What are its disadvantages?
- HTML class attribute verbosity.
- Tailwind v4 syntax changes require awareness of modern CSS standards (`@theme`, `@utility`).

### 8. Could we build this ourselves?
- Accessible modal dialogs, focus trapping, and keyboard navigation require handling dozens of browser-specific edge cases that take months to get right.

### 9. What would we need to implement it from scratch?
- Focus sentinel nodes, tab index management, escape key handlers, collision-aware floating element positioning (like Floating UI), and ARIA state sync.

### 10. When would we choose another technology?
- We would choose CSS Modules or vanilla stylesheet architectures if building a public embeddable widget where global utility CSS class names could conflict with host page styles.

### 11. Interview questions & answers
- **Basic:** *How does dark mode switching work in this stack?*
  - **Answer:** `next-themes` manages the `dark` class on the root `<html>` element, which toggles CSS variables defined in `app/globals.css` used by Tailwind classes.
- **Intermediate:** *Why use Base UI over Radix UI primitives?*
  - **Answer:** Base UI offers superior integration with modern React 19 paradigms, lower bundle size, and simpler headless component composition without redundant wrapper elements.
- **Advanced:** *How does Tailwind v4 differ from Tailwind v3 in this codebase?*
  - **Answer:** Tailwind v4 drops `tailwind.config.js` and PostCSS plugins in favor of native CSS `@import "tailwindcss";` and `@theme` blocks directly in `app/globals.css`.

---

## 4. Vercel AI SDK v7 (`ai`, `@ai-sdk/react`)

### 1. What is it?
- **Simple:** A TypeScript library that provides a unified way to connect to any AI model, stream text and tool calls, and manage chat UI state.
- **Technical:** Unified provider abstraction layer supporting Server-Sent Events streaming, multi-modal generation, structured object generation, and client-side streaming hooks (`useChat`).

### 2. Where is it used in this project?
- `lib/ai/models.ts` (provider initialization for Google Generative AI, OpenAI, and OpenRouter).
- `lib/ai/computer-tools.ts` (defining AI tools via `tool()` helper).
- `lib/ai/chat-memory.ts` and `lib/ai/memory-capture.ts` (`generateText` with structured memory fact extraction).
- `trigger/chat.ts` (core execution loop feeding tools into `chat-agent`).

### 3. Why did we use it?
- Normalizes disparate vendor APIs (Google Gemini vs OpenAI responses vs OpenRouter OpenAI-compatible endpoints) into a single unified interface.
- Standardizes tool execution definitions (`parameters` validated via Zod schemas, async `execute()` functions).

### 4. Why is it suitable for this project?
- Bring-your-own-key design requires switching between Gemini 2.5 Flash, OpenRouter models, and OpenAI models without rewriting orchestration code.
- Native TypeScript typing for prompt inputs, tool calls, and structured tool outputs.

### 5. What alternatives were available?
- LangChain / LangGraph.
- Direct vendor SDKs (`@google/genai`, `openai`).
- LlamaIndex.

### 6. Why did we not choose those alternatives?
*(Retrospective architectural justification)*
- **LangChain:** Excessive layers of abstraction, bloated bundle sizes, complex callback managers, and high churn between versions.
- **Direct Vendor SDKs:** Would require maintaining 3+ distinct streaming and tool-calling parsers and separate error handlers.
- **LlamaIndex:** Centered around RAG; this project emphasizes tool execution and container control rather than vector search.

### 7. What are its disadvantages?
- Rapid release cycles can introduce breaking changes in helper types across major versions.
- Tight coupling to Vercel's preferred data streaming protocol.

### 8. Could we build this ourselves?
- Writing a basic fetch client for OpenAI is simple; standardizing tool calling, delta chunk reassembly, and provider differences across 3 vendors is a large, fragile maintenance task.

### 9. What would we need to implement it from scratch?
- SSE parser, JSON-schema-to-tool-call translator, stream reassembly buffer, unified token counter, and provider-specific error wrappers.

### 10. When would we choose another technology?
- If complex cyclical graph workflows with conditional branching and checkpoint rollbacks were needed, LangGraph would be evaluated.

### 11. Interview questions & answers
- **Basic:** *How does AI Teammates initialize different models dynamically?*
  - **Answer:** In `lib/ai/models.ts`, we inspect the requested model string and instantiate either `createGoogleGenerativeAI`, `createOpenAI`, or `createOpenRouter` using the user's decrypted personal API key.
- **Intermediate:** *How are tool schemas passed to the LLM?*
  - **Answer:** Tools are created using the `tool()` function from `ai`, which accepts a Zod schema in `parameters`. The SDK converts this Zod schema into JSON Schema for the provider's function calling API.
- **Advanced:** *How does `lib/ai/chatgpt-stream.ts` handle ChatGPT OAuth connections?*
  - **Answer:** Since ChatGPT web subscriptions do not expose a standard API key, the app proxies requests through OpenAI's internal completion endpoints using refreshed OAuth tokens and maps responses back into Vercel AI SDK stream chunks.

---

## 5. Trigger.dev v4 (`chat.agent` & Background Worker)

### 1. What is it?
- **Simple:** A background task orchestrator and execution runtime that runs long-running server code without serverless timeouts.
- **Technical:** Trigger.dev v4 framework running on Node 24 worker instances. Uses `chat.agent` to host long-lived agentic loops, schedule delayed tasks (`stop-sandbox-lease`), and run cron jobs (`recover-expired-sandbox-leases`), communicating with Next.js via scoped public access tokens.

### 2. Where is it used in this project?
- `trigger.config.ts` (project configuration, build extensions).
- `trigger/chat.ts` (`chat-agent` definition, turn streaming, tool routing).
- `trigger/sandbox-usage.ts` (delayed sandbox shutdown and 1-minute lease reclamation cron).
- `actions/chat.ts` (starting sessions via `@trigger.dev/sdk/v3` and minting client tokens).

### 3. Why did we use it?
- Web applications on Vercel cannot run multi-minute tasks or hold open SSE streams indefinitely.
- Trigger.dev provides robust execution guarantees, automatic retries, delayed executions, and client session streaming.

### 4. Why is it suitable for this project?
- An agent driving a Daytona sandbox can spend 2-5 minutes executing bash commands, waiting for compiler builds, and moving desktop mice. Trigger.dev workers have no short serverless timeouts.
- Provides real-time event streaming to the browser over SSE with zero additional WebSocket server infrastructure.

### 5. What alternatives were available?
- BullMQ + Redis + dedicated Node.js worker containers.
- AWS Step Functions / SQS + Lambda.
- Inngest.
- Temporal.

### 6. Why did we not choose those alternatives?
*(Retrospective architectural justification)*
- **BullMQ + Redis:** Requires provisioning, securing, and maintaining dedicated 24/7 Redis clusters and worker servers.
- **Temporal:** Heavy operational overhead (Cassandra/Postgres dependencies, complex SDK ceremonies); excessive for our task volume.
- **Inngest:** Similar to Trigger.dev, but Trigger.dev v4's first-class `chat.agent` abstraction and frontend streaming hooks (`@trigger.dev/sdk/chat/react`) provided an exact match for our architecture.

### 7. What are its disadvantages?
- Dependency on external Trigger.dev Cloud orchestrator or self-hosted control plane.
- Local development requires running `npx trigger.dev@latest dev` alongside Next.js.

### 8. Could we build this ourselves?
- A basic queue can be built on Postgres `SKIP LOCKED`, but real-time SSE streaming, heartbeat tracking, distributed retries, and token minting require substantial infrastructure.

### 9. What would we need to implement it from scratch?
- Distributed job dispatcher, worker heartbeat monitor, Postgres advisory locks / Redis pub-sub, SSE connection broker, and token authorization service.

### 10. When would we choose another technology?
- If strict on-premises data residency prevented cloud orchestrators, Temporal or BullMQ on Kubernetes would be used.

### 11. Interview questions & answers
- **Basic:** *Why does AI Teammates use Trigger.dev instead of Next.js route handlers for chat?*
  - **Answer:** Next.js route handlers on Vercel timeout after 15–60 seconds. AI Teammates' sandboxed bot actions take minutes, necessitating a background worker with durable streaming.
- **Intermediate:** *How does the browser securely connect to a Trigger.dev task run?*
  - **Answer:** In `actions/chat.ts`, the server action verifies the user's session and billing status, starts a run on Trigger.dev, mints a short-lived (1-hour) Public Access Token (PAT) scoped only to that session, and returns it to the client for direct SSE streaming.
- **Advanced:** *How does Trigger.dev handle sandbox lease cleanup?*
  - **Answer:** When a chat turn finishes, a delayed task (`stop-sandbox-lease`) is scheduled for 5 minutes later. Additionally, a 1-minute cron (`recover-expired-sandbox-leases`) queries Neon for stale leases and calls Daytona to shut them down.

---

## 6. Neon Postgres & HTTP Driver (`@neondatabase/serverless`)

### 1. What is it?
- **Simple:** A serverless PostgreSQL database with decoupled storage and compute that can scale to zero when not in use.
- **Technical:** Multi-tenant managed PostgreSQL utilizing Neon's serverless HTTP query driver, bypassing connection pool limitations of TCP connections in ephemeral serverless environments.

### 2. Where is it used in this project?
- `lib/db/client.ts` (`neon(process.env.DATABASE_URL)`).
- `lib/db/schema.ts` (13 Drizzle table schemas).
- `drizzle.config.ts` (Neon database credentials and dialect configuration).

### 3. Why did we use it?
- Zero cold-start connection setup: standard TCP connection establishment to Postgres takes 100-300ms; Neon's HTTP driver executes single queries over HTTP POST in ~20ms.
- Scales down to zero compute during inactivity, keeping infrastructure costs at $0 when bots are idle.

### 4. Why is it suitable for this project?
- Eliminates connection pool exhaustion that occurs when thousands of serverless lambdas open concurrent TCP sockets.
- Fully compatible with standard PostgreSQL SQL syntax, indexes, and constraints.

### 5. What alternatives were available?
- Supabase (Postgres).
- PlanetScale (MySQL).
- Amazon Aurora Serverless v2.
- MongoDB Atlas.

### 6. Why did we not choose those alternatives?
*(Retrospective architectural justification)*
- **PlanetScale:** MySQL lacks native UUID/nanoid primary key ergonomics and rich relational cascade semantics of Postgres.
- **MongoDB:** Relational models with cascade deletes (e.g., deleting a chat cascades to `chat_members` and `group_memories`) are much safer in relational SQL.
- **Supabase:** Excellent, but Neon's specialized HTTP driver provides superior latency in Vercel serverless functions without requiring pgBouncer proxies.

### 7. What are its disadvantages?
- HTTP queries cannot use traditional interactive multi-statement transactions (`BEGIN ... COMMIT`) over long periods. Single-statement operations or Neon pipeline transactions must be used.
- Cold compute resume latency (1-2s) if the database has scaled to zero.

### 8. Could we build this ourselves?
- Decoupling Postgres storage from compute via custom shared-disk architectures is a multi-million-dollar systems engineering project.

### 9. What would we need to implement it from scratch?
- Custom Page Server, WAL service, compute container provisioner, and connection router.

### 10. When would we choose another technology?
- If the application required millions of writes per second with high-frequency time-series telemetry, ClickHouse or Cassandra would be used.

### 11. Interview questions & answers
- **Basic:** *Why does AI Teammates use `@neondatabase/serverless` instead of `pg` (node-postgres)?*
  - **Answer:** `node-postgres` relies on persistent TCP sockets which quickly exhaust connection limits in serverless functions. Neon's driver executes queries over stateless HTTP requests.
- **Intermediate:** *How does AI Teammates prevent race conditions in sandbox lease assignment?*
  - **Answer:** We use atomic Compare-And-Swap (CAS) SQL queries in `lib/sandbox-usage.ts` that update the lease record only if the existing lease has expired or matches the caller's ID.
- **Advanced:** *What happens when a database schema change is needed?*
  - **Answer:** AI Teammates uses `drizzle-kit push` (`pnpm db:push`) to synchronize Drizzle schema directly to Neon without managing sequential migration files.

---

## 7. Drizzle ORM (`drizzle-orm`, `drizzle-zod`)

### 1. What is it?
- **Simple:** A lightweight TypeScript Object-Relational Mapper that allows querying databases with type safety without a heavy runtime engine.
- **Technical:** A zero-overhead, code-first TypeScript ORM with direct SQL dialect mapping, schema definition, query builder, and runtime Zod validation generation via `drizzle-zod`.

### 2. Where is it used in this project?
- `lib/db/schema.ts` (all 13 tables, relations, and insert validation schemas).
- `actions/*.ts`, `lib/*.ts`, `trigger/*.ts` (all database inserts, queries, updates, and deletes).

### 3. Why did we use it?
- Unlike Prisma, Drizzle has zero binary dependencies (`query-engine` binary), ensuring minimal serverless cold starts.
- "If you know SQL, you know Drizzle" — queries mirror actual SQL without hidden queries or N+1 surprises.

### 4. Why is it suitable for this project?
- Direct compatibility with Neon's HTTP driver (`drizzle(client, { schema })`).
- `drizzle-zod` generates runtime validation schemas from the database definition, enforcing DRY (Don't Repeat Yourself) between DB schema and form validation.

### 5. What alternatives were available?
- Prisma.
- TypeORM.
- Kysely.
- Raw SQL (`pg` / `neon` tagged template literals).

### 6. Why did we not choose those alternatives?
*(Retrospective architectural justification)*
- **Prisma:** Bundles a heavy Rust binary engine that inflates cold starts by 200–500ms on Vercel and Trigger.dev workers.
- **TypeORM:** Relies on legacy TypeScript experimental decorators and has poor type inference for joined tables.
- **Kysely:** Excellent query builder, but lacks Drizzle's automated migration and `drizzle-zod` schema generator integration.

### 7. What are its disadvantages?
- Relation queries (`db.query.bots.findMany({ with: { memberships: true } })`) use a custom query API separate from the core `db.select().from()` builder.
- Schema push (`db:push`) can be dangerous in large multi-engineer production teams without strict migration reviews.

### 8. Could we build this ourselves?
- A basic query generator can be written with template strings, but achieving full end-to-end type safety for nested joins is extremely difficult.

### 9. What would we need to implement it from scratch?
- SQL string sanitizer, AST query builder, deep TypeScript mapped types for tables/columns/joins, and a schema diffing engine.

### 10. When would we choose another technology?
- For complex multi-tenant enterprise data layers with dynamic schema generation at runtime, Kysely's unopinionated query builder might be preferred.

### 11. Interview questions & answers
- **Basic:** *What is the role of `drizzle-zod` in this project?*
  - **Answer:** It automatically creates Zod schemas (such as `insertBotSchema` in `lib/db/schema.ts`) from Drizzle table definitions so we don't duplicate validation logic between frontend forms and the database.
- **Intermediate:** *How does Drizzle execute cascade deletions in AI Teammates?*
  - **Answer:** Foreign keys in `lib/db/schema.ts` define `.references(() => chats.id, { onDelete: "cascade" })`, delegating cascade deletion of `chat_members` and `group_memories` directly to PostgreSQL.
- **Advanced:** *Explain how Drizzle optimizes cold starts compared to Prisma in serverless functions.*
  - **Answer:** Prisma loads a 15–30MB Rust binary engine into memory on cold start. Drizzle is pure TypeScript that compiles down to simple SQL string concatenation, yielding near-zero cold start overhead.

---

## 8. Clerk & Clerk Billing

### 1. What is it?
- **Simple:** A complete authentication and user management service that also handles SaaS subscription payments.
- **Technical:** Identity-as-a-Service (IDaaS) providing multi-factor authentication, session token issuance, middleware verification (`proxy.ts`), private user metadata storage, and Stripe-backed subscription billing (Clerk Billing).

### 2. Where is it used in this project?
- `proxy.ts` (application middleware protecting routes via `clerkMiddleware`).
- `app/sign-in/[[...sign-in]]/page.tsx` and `app/sign-up/[[...sign-up]]/page.tsx`.
- `lib/billing.ts` & `lib/billing-agent.ts` (checking Pro plan access and feature flags `bots` and `sandboxes`).
- `actions/api-keys.ts` & `lib/ai/user-api-keys.ts` (storing personal API keys in Clerk `privateMetadata`).

### 3. Why did we use it?
- Replaces thousands of lines of security-critical code: password hashing, email verification, session cookie signing, CSRF protection, and OAuth providers.
- Clerk Billing ties subscription state directly to the user session, avoiding the need to build a custom Stripe webhook processor.

### 4. Why is it suitable for this project?
- Single vendor handles both authentication and monetization ($9/month Pro subscription).
- Private metadata allows securely storing user API keys on Clerk's servers without adding an encrypted credentials column to Neon.

### 5. What alternatives were available?
- NextAuth.js (Auth.js) + custom Stripe webhooks.
- Supabase Auth.
- Better Auth.

### 6. Why did we not choose those alternatives?
*(Retrospective architectural justification)*
- **Auth.js + Stripe:** Requires managing database session tables, email SMTP servers, and 500+ lines of fragile Stripe webhook sync code.
- **Supabase Auth:** Decoupled from Stripe billing; would still require custom billing logic.
- **Better Auth:** Newer entrant with less proven enterprise billing support at project inception.

### 7. What are its disadvantages?
- Strong vendor lock-in.
- Monthly active user (MAU) costs escalate if user volume scales significantly without conversion.

### 8. Could we build this ourselves?
- Building secure auth (bcrypt/argon2, session rotation, CSRF, rate-limiting) is possible but carries enormous legal and security liability for a small team.

### 9. What would we need to implement it from scratch?
- Password hashing service, secure cookie generator, JWT minting/verification, session revocation store (Redis), email verification worker, and Stripe webhook handler.

### 10. When would we choose another technology?
- If we needed self-hosted air-gapped authentication for on-premise government or enterprise deployments, we would use Keycloak or Ory Kratos.

### 11. Interview questions & answers
- **Basic:** *Where are the user's Gemini and OpenRouter API keys stored?*
  - **Answer:** In Clerk's `privateMetadata` for that user, retrieved via `clerkClient().users.getUser(userId)` and modified via `updateUserMetadata`.
- **Intermediate:** *How does `proxy.ts` protect dashboard routes?*
  - **Answer:** It uses `clerkMiddleware` with a route matcher. If an unauthenticated user attempts to access `/(dashboard)` or `/(account)`, they are redirected to `/sign-in`.
- **Advanced:** *How does the application prevent Free users from running bot turns?*
  - **Answer:** In `actions/chat.ts` and `trigger/chat.ts`, `requireUserPaidPlan(userId)` calls Clerk's billing API to ensure the user has an active Pro subscription with the `bots` and `sandboxes` feature entitlements.

---

## 9. Daytona SDK (`@daytona/sdk`) & noVNC

### 1. What is it?
- **Simple:** A service that spins up isolated Linux virtual computers (sandboxes) in seconds, allowing AI bots to execute code and control a visual desktop.
- **Technical:** An infrastructure SDK managing secure containerized development environments with CPU/RAM/disk resource limits, exposed via REST/gRPC for bash execution, file I/O, process management, and signed VNC streaming URLs.

### 2. Where is it used in this project?
- `lib/daytona.ts` and `lib/daytona-client.ts` (initializing Daytona client, creating sandboxes).
- `lib/ai/computer-tools.ts` (executing bash commands, reading/writing files, simulating mouse clicks, typing, taking screenshots).
- `lib/daytona-vnc.ts` (generating signed VNC URLs for noVNC viewer).
- `components/chat-desktop.tsx` & `components/chat-desktop-viewer.tsx` (rendering live desktop canvas in React).

### 3. Why did we use it?
- Running arbitrary user/AI-generated code on the main web server is a severe security risk. Daytona provides true kernel-level isolation in ephemeral cloud containers.
- Enables the "AI Teammate" metaphor: bots aren't just text generators; they have their own computer with terminal, disk, and screen.

### 4. Why is it suitable for this project?
- Sandboxes enforce strict boundaries (max 2 vCPU, 4 GiB RAM, 10 GiB disk).
- Daytona's built-in VNC server enables the user to watch the bot move the mouse and open browser tabs in real time.

### 5. What alternatives were available?
- Docker on AWS ECS / Fly.io machines.
- E2B (Code Interpreters).
- Modal.

### 6. Why did we not choose those alternatives?
*(Retrospective architectural justification)*
- **E2B:** Great for headless Python execution, but lacks Daytona's full visual desktop (X11/VNC) environment out-of-the-box.
- **Docker on Fly.io:** High operational burden of managing orchestrators, network bridges, volume mounts, and VNC websocket proxies manually.
- **Modal:** Geared towards batch Python ML workloads rather than persistent interactive developer environments.

### 7. What are its disadvantages?
- Daytona sandboxes take 5–15 seconds to provision on the first turn.
- Cloud compute costs accrue while sandboxes are active (mitigated by our 5-minute idle lease shutdown).

### 8. Could we build this ourselves?
- Building a multi-tenant cloud sandbox orchestrator with network sandboxing, gRPC file transfer, and web VNC streaming is a massive infrastructure undertaking.

### 9. What would we need to implement it from scratch?
- Kubernetes cluster with Firecracker microVMs or gVisor runtimes, custom daemon for command execution, WebRTC/WebSocket VNC gateway, and quota enforcer.

### 10. When would we choose another technology?
- If bots only needed to execute simple math or Python calculations without terminal tools or UI interaction, lightweight WASM or E2B would be used.

### 11. Interview questions & answers
- **Basic:** *How does a bot read or edit files in its computer?*
  - **Answer:** In `lib/ai/computer-tools.ts`, the bot calls tools that invoke Daytona's SDK methods: `sandbox.fs.downloadFile` and `sandbox.fs.uploadFile`.
- **Intermediate:** *How does the live desktop viewer work in the browser?*
  - **Answer:** `lib/daytona-vnc.ts` requests a signed VNC URL from Daytona. The client component `components/chat-desktop-viewer.tsx` connects to this stream using a noVNC RFB WebSocket client rendered into a `<canvas>`.
- **Advanced:** *How is sandbox cost controlled when a user closes their browser?*
  - **Answer:** The app enforces a 20-hour monthly quota via `lib/sandbox-usage.ts`. When a chat turn completes, Trigger.dev schedules `stop-sandbox-lease` 5 minutes in the future to stop the container if no further messages arrive.

---

## 10. Sentry (`@sentry/nextjs`)

### 1. What is it?
- **Simple:** An error and performance monitoring tool that alerts developers when bugs or crashes happen in production.
- **Technical:** Real-time error tracking and telemetry SDK instrumenting browser, Node.js server, Vercel Edge, and Trigger.dev worker runtimes with automated stack trace capture and privacy scrubbing.

### 2. Where is it used in this project?
- `instrumentation.ts` and `instrumentation-client.ts` (Next.js initialization).
- `sentry.server.config.ts`, `sentry.edge.config.ts`.
- `trigger/init.ts` (worker telemetry setup).
- `lib/sentry-privacy.ts` and `lib/logging.ts` (redacting user API keys and prompts before sending events).

### 3. Why did we use it?
- Catching exceptions across distributed systems (client browser -> Next.js server actions -> Trigger.dev background workers) is impossible without unified distributed tracing.

### 4. Why is it suitable for this project?
- Deep Next.js integration captures hydration errors, server action rejections, and edge runtime faults.
- Custom scrubbing ensures no private LLM prompts or personal API keys leak to third-party dashboards.

### 5. What alternatives were available?
- Datadog.
- LogRocket.
- OpenTelemetry + self-hosted SigNoz/Grafana.

### 6. Why did we not choose those alternatives?
*(Retrospective architectural justification)*
- **Datadog:** Prohibitively expensive for small-scale projects and prosumer SaaS.
- **Self-hosted Grafana:** Operational overhead of running collectors, databases, and alerting rules.
- **LogRocket:** Strong session replay, but Sentry has superior deep stack trace symbolication for Next.js source maps.

### 7. What are its disadvantages?
- Can add 20–50KB to the client-side JavaScript bundle.
- Excessive event volume if noisy network errors are not filtered.

### 8. Could we build this ourselves?
- A basic error webhook receiver can be built in an afternoon, but client source-map mapping, minified stack trace parsing, and grouping algorithms are very complex.

### 9. What would we need to implement it from scratch?
- Ingest pipeline, source map store, stack trace demangler, fingerprinting engine, and notification dispatcher.

### 10. When would we choose another technology?
- For high-volume microservice enterprise tracing across 50+ backend microservices, standard OpenTelemetry with Jaeger would be selected.

### 11. Interview questions & answers
- **Basic:** *Why is `lib/sentry-privacy.ts` critical in this project?*
  - **Answer:** Because users input their personal API keys and private conversation notes, `sentry-privacy.ts` scrubs authorization headers, API keys, and prompt contents before sending error reports to Sentry.
- **Intermediate:** *How does Sentry instrument the Trigger.dev background worker?*
  - **Answer:** In `trigger/init.ts`, Sentry is initialized inside the worker runtime, binding uncaught exception and unhandled rejection handlers to Trigger.dev tasks.
- **Advanced:** *How does Next.js 16 load Sentry without slowing down initial page requests?*
  - **Answer:** Next.js uses `instrumentation.ts` which runs once during server boot before request processing, registering Sentry hooks cleanly without wrapping every route handler manually.

---

## Summary Matrix: Current vs Alternative Stack

| Layer | AI Teammates Choice | Direct Alternative | Why Chosen |
|---|---|---|---|
| **Language** | TypeScript 5 (Strict) | JavaScript / Flow | End-to-end type safety from DB to UI |
| **Framework** | Next.js 16.4 App Router | Remix / Vite SPA | Native Server Components, Server Actions, Clerk hooks |
| **UI Primitives** | Base UI (`base-nova`) | Radix UI / MUI | Headless, zero CSS-in-JS runtime, modern accessibility |
| **Styling** | Tailwind CSS v4 | Tailwind v3 / CSS Modules | CSS-first `@theme`, no PostCSS config overhead |
| **AI Layer** | Vercel AI SDK v7 | LangChain | Clean tool typing, native SSE streaming, multi-provider |
| **Agent Worker** | Trigger.dev v4 | BullMQ / Temporal | Serverless long-lived agents (`chat.agent`), no Redis cluster |
| **Database** | Neon Serverless Postgres | Supabase / RDS | HTTP driver eliminates serverless TCP connection limits |
| **ORM** | Drizzle ORM | Prisma | Zero binary cold starts, SQL-like DX, `drizzle-zod` |
| **Auth & Billing** | Clerk + Clerk Billing | Auth.js + Stripe | Unified user management and $9/mo Pro feature gates |
| **Sandboxes** | Daytona SDK | Docker / E2B | Full Linux container with terminal and noVNC desktop |
| **Monitoring** | Sentry (with privacy) | Datadog | Deep Next.js error symbolication, scrubbed logging |
