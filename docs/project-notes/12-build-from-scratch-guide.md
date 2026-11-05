# 12 — Build-From-Scratch Guide

> Part of the AI Teammates project notes. Read after [11 — Interview Questions & Answers](11-interview-questions-and-answers.md).
> Maps directly to [README](README.md) and repository source code.

This guide provides a comprehensive, phased blueprint for rebuilding the **AI Teammates** application from an empty directory up to a fully deployed production system.

---

## Stage 0: External Service Provisioning

Before writing code, provision the necessary infrastructure accounts:
1. **Clerk:** Create an application. Enable Google/GitHub auth and Clerk Billing with a `$9/month` Pro plan (entitlements: `bots`, `sandboxes`).
2. **Neon:** Create a serverless PostgreSQL database. Copy the pooled HTTP connection string.
3. **Trigger.dev:** Create a v4 project. Obtain your `TRIGGER_SECRET_KEY`.
4. **Daytona:** Obtain your `DAYTONA_API_KEY` and target cluster URL.
5. **Sentry:** Create a Next.js project to obtain your DSN and Auth Token.

---

## Stage 1: Repository Scaffolding & Configuration

1. **Initialize Project:**
   ```bash
   mkdir ai-teammates && cd ai-teammates
   pnpm init
   pnpm add next@16.4.0 react@19.3.0 react-dom@19.3.0 typescript @types/node @types/react -E
   ```
2. **Configure TypeScript:** Create `tsconfig.json` with `target: "ES2017"`, `strict: true`, and path alias `"@/*": ["./*"]`.
3. **Install Styling & UI Primitives:**
   ```bash
   pnpm add tailwindcss @tailwindcss/postcss @base-ui-components/react lucide-react next-themes class-variance-authority clsx tailwind-merge
   ```
4. **Setup CSS-First Tailwind v4:** In `app/globals.css`, import Tailwind with `@import "tailwindcss";` and define theme CSS variables.

---

## Stage 2: Database Modeling (Neon & Drizzle ORM)

1. **Install Database Packages:**
   ```bash
   pnpm add drizzle-orm @neondatabase/serverless drizzle-zod nanoid zod
   pnpm add -D drizzle-kit
   ```
2. **Define Connection Client (`lib/db/client.ts`):**
   ```typescript
   import { neon } from "@neondatabase/serverless"
   import { drizzle } from "drizzle-orm/neon-http"
   import * as schema from "./schema"

   const sql = neon(process.env.DATABASE_URL!)
   export const db = drizzle(sql, { schema })
   ```
3. **Define Table Schemas (`lib/db/schema.ts`):**
   - Create 13 tables: `bots`, `chats`, `chat_members`, `user_memories`, `group_memories`, `memory_preferences`, `sandbox_leases`, `usage_periods`, `usage_entries`, `worker_runs`, `bot_capacity`, `chatgpt_connections`, `oauth_attempts`.
   - Export insert Zod schemas using `createInsertSchema()` from `drizzle-zod`.
4. **Push Schema to Neon:** Configure `drizzle.config.ts` and run `pnpm db:push`.

---

## Stage 3: Authentication & Subscription Gating (Clerk)

1. **Install Clerk:**
   ```bash
   pnpm add @clerk/nextjs
   ```
2. **Create Middleware (`proxy.ts`):**
   - Implement `clerkMiddleware()`. Redirect unauthenticated requests targeting `/(dashboard)` and `/(account)` to `/sign-in`.
3. **Implement Billing Gate (`lib/billing.ts`):**
   - Write `requireUserPaidPlan(userId)`. Check Clerk user entitlements for the `pro` subscription plan and feature flags `bots` and `sandboxes`.
   - Create `components/paid-access.tsx` to render upgrade pricing prompts for Free accounts.

---

## Stage 4: Personal API Key Management (BYOK)

1. **Implement Verification Logic (`lib/ai/provider-key-validation.ts`):**
   - Write live validation functions making lightweight zero-cost API requests to Google Gemini, OpenRouter, and OpenAI.
2. **Create Server Actions (`actions/api-keys.ts`):**
   - In `saveApiKey(provider, key)`: Verify key against vendor API. If valid, save directly to Clerk user `privateMetadata` via `clerkClient().users.updateUserMetadata`.
   - Ensure keys never touch the Neon database or client session tokens.
3. **Build Settings UI (`components/api-key-settings.tsx`):**
   - Build form with masked inputs, validation badges, and delete actions.

---

## Stage 5: Bot Creation & Daytona Sandbox Infrastructure

1. **Install Daytona SDK & DiceBear:**
   ```bash
   pnpm add @daytona/sdk @dicebear/core @dicebear/styles
   ```
2. **Create Sandbox Helper (`lib/daytona.ts`):**
   - Initialize Daytona client with resource limits: $\le 2$ vCPU, 4 GiB RAM, 10 GiB disk.
3. **Build Bot CRUD Action (`actions/bot.ts`):**
   - Validate form input using `insertBotSchema`. Check capacity ($\le 3$ bots).
   - Generate unique DiceBear avatar seed and insert into `bots` table.

---

## Stage 6: Background Worker & Realtime Streaming (Trigger.dev v4)

1. **Install Trigger.dev SDK:**
   ```bash
   pnpm add @trigger.dev/sdk@latest ai @ai-sdk/react
   ```
2. **Define Agent Task (`trigger/chat.ts`):**
   - Define `chat.agent` named `"chat-agent"`.
   - Ingest user message, load active bot instructions, assemble memories, and invoke the model loop using Vercel AI SDK.
3. **Implement Start Action (`actions/chat.ts`):**
   - In `startChatTurn()`: Check paid plan, fetch decrypted API key from Clerk, launch Trigger.dev session, and mint a 1-hour Public Access Token (PAT).
4. **Implement Client Chat Hook (`components/chat.tsx`):**
   - Connect client directly to Trigger.dev SSE stream using `@trigger.dev/sdk/chat/react`. Render streaming message chunks and tool execution cards.

---

## Stage 7: Computer Tools & Live Desktop (noVNC)

1. **Define Computer Tools (`lib/ai/computer-tools.ts`):**
   - Implement `bash` (runs commands via `sandbox.process.execute`).
   - Implement `readFile` / `writeFile` (via `sandbox.fs`).
   - Implement `mouseClick`, `mouseMove`, `keyboardType`, and `takeScreenshot`.
2. **Generate Signed VNC URLs (`lib/daytona-vnc.ts` & `actions/desktop.ts`):**
   - Request signed WebSocket VNC stream URL from Daytona.
3. **Build Canvas Viewer (`components/chat-desktop-viewer.tsx`):**
   - Mount noVNC RFB WebSocket client rendering desktop frames onto an HTML5 `<canvas>`.

---

## Stage 8: Three-Tier Memory Implementation

1. **Global & Group Memory:**
   - Store in Neon tables `user_memories` and `group_memories`.
   - Implement `lib/ai/memory-capture.ts` using structured `generateText` to extract user preference facts at turn completion.
2. **Bot Memory (`lib/ai/bot-memory.ts`):**
   - Read/write `~/MEMORY.md` directly inside the bot's Daytona sandbox filesystem. Enforce markdown bullet schema ($\le 32$KB).
3. **Synthesize System Prompt (`lib/ai/memory-manager.ts`):**
   - Merge permitted global facts, group facts, and bot scratchpad notes into the LLM system prompt.

---

## Stage 9: Multi-Bot Group Chats & Handoffs

1. **Group Chat Creation (`actions/group-chat.ts`):**
   - Validate $\ge 2$ bots, create `chats` row (`kind: "group"`), and insert into `chat_members`.
2. **Mention Parsing (`lib/ai/bot-mentions.ts`):**
   - Parse `@BotName` tags to assign initial responder.
3. **Bot Handoff Tool (`lib/ai/group-handoff.ts`):**
   - Inject `handoff` tool into active bot context. When invoked, append a handoff divider message, swap active bot persona and sandbox, and continue execution within the existing stream.

---

## Stage 10: Usage Metering, CAS Leases & Automated Cleanup

1. **Atomic CAS Lease Acquisition (`lib/sandbox-usage.ts`):**
   - Execute atomic SQL update on `sandbox_leases` ensuring $\le 1$ running sandbox per user.
2. **Delayed Lease Termination (`trigger/sandbox-usage.ts`):**
   - Schedule delayed Trigger.dev task `stop-sandbox-lease` firing 5 minutes after last message.
3. **1-Minute Reclamation Cron:**
   - Implement recurring cron task `recover-expired-sandbox-leases` to stop orphaned Daytona containers whose `endsAt` timestamp has passed.

---

## Stage 11: Testing & Deployment

1. **Write Unit & Integration Tests (`tests/`):**
   - Vitest for UI components (`*.test.tsx`).
   - `node:test` for domain logic, memory validation, and CAS leases (`*.test.mjs`).
2. **Pre-flight Quality Checklist:**
   ```bash
   pnpm check && pnpm lint && pnpm test
   ```
3. **Deploy:**
   - Deploy web app to Vercel: `vercel deploy --prod`.
   - Deploy background worker to Trigger.dev: `npx trigger.dev@latest deploy`.
