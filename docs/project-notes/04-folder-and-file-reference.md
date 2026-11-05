# 04 — Folder & File Reference

> Part of the AI Teammates project notes. Read after [03 — Architecture & Design Decisions](03-architecture-and-design-decisions.md).
> Maps directly to [README](README.md) and repository code.

This document serves as the complete technical dictionary of the repository. Every architectural directory and significant file is cataloged with its layer, purpose, exports, dependencies, and role in the system.

*(Note: Generated directories such as `.next/`, `node_modules/`, `.trigger/`, and build cache artifacts like `tsconfig.tsbuildinfo` are excluded from this inventory as they represent ephemeral build outputs).*

---

## 1. Directory Inventory

| Directory | Layer | Purpose & Responsibility | Depends On | Used By |
|---|---|---|---|---|
| `app/` | Frontend / Web API | Next.js App Router: RSC pages, nested layouts, client boundaries, OAuth route handlers. | `components/`, `actions/`, `lib/` | Browser clients |
| `app/(account)/` | Frontend | Account management routes (`/api-keys`, `/billing`, `/memory`, `/profile`, `/usage`). | `components/`, `actions/` | User settings |
| `app/(dashboard)/` | Frontend | Core workspace routes (`/dashboard`, `/chats/[chatId]`). | `components/`, `actions/` | User chat flow |
| `app/api/connections/`| Backend / API | Route handlers for ChatGPT OAuth handshake (PKCE callbacks, start, community). | `lib/chatgpt.ts`, `lib/db/` | External OAuth providers |
| `actions/` | Backend (RPC) | Next.js Server Actions (`"use server"`). Type-safe remote procedure calls from UI. | `lib/`, `trigger/` | `components/`, `app/` |
| `components/` | Frontend (UI) | Reusable React components, dialogs, sidebars, desktop viewers, and theme providers. | `components/ui/`, `actions/` | `app/` |
| `components/ui/` | Frontend (Primitives) | Headless Base UI (`base-nova`) wrapped with Tailwind v4 styling (buttons, cards, dialogs). | External CSS | `components/` |
| `components/ai-elements/`| Frontend (AI UI) | AI-specific display primitives: code blocks, message bubbles, prompt input, tool call cards. | `components/ui/` | `components/chat.tsx` |
| `lib/` | Shared Core | Agnostic domain logic, database client, schema definitions, billing rules, Daytona client. | External SDKs | `actions/`, `app/`, `trigger/` |
| `lib/ai/` | Shared (AI) | Tool definitions, memory extractors, instruction composers, multi-provider model factories. | `lib/db/`, `lib/daytona.ts` | `trigger/chat.ts`, `actions/` |
| `lib/db/` | Shared (Data) | Neon PostgreSQL connection client, Drizzle schema, entity relations, and Zod validators. | Neon, Drizzle | Entire application |
| `trigger/` | Background Worker | Long-lived Trigger.dev tasks (`chat-agent`, sandbox lease reclamation, Sentry worker init). | `lib/` | Trigger.dev Cloud |
| `tests/` | Quality Assurance | Vitest UI unit tests and Node:test backend integration/unit suites. | Entire codebase | Local development / QA |

---

## 2. Root Configuration Files

### `package.json` & `pnpm-workspace.yaml`
- **Purpose:** Declares dependencies, scripts, engines, and pnpm workspace configuration.
- **Key Scripts:**
  - `dev`: Starts Next.js development server (`next dev`).
  - `build`: Production Next.js compilation (`next build`).
  - `check`: Type-checks entire repository (`tsc --noEmit`).
  - `lint`: Runs ESLint 9 flat configuration.
  - `db:push`: Synchronizes Drizzle schema directly to Neon DB (`drizzle-kit push`).
  - `test`: Runs both Vitest and `node:test` suites.

### `proxy.ts`
- **Layer:** Edge / Middleware.
- **Purpose:** Clerk authentication gatekeeper for incoming HTTP requests.
- **Key Exports:** Default export executing `clerkMiddleware()`.
- **Workflow Role:** Intercepts requests to `/dashboard`, `/chats/*`, and `/usage`. If the request lacks a valid Clerk session token, it triggers an HTTP 307 redirect to `/sign-in`.

### `drizzle.config.ts`
- **Layer:** Database tooling.
- **Purpose:** Configures Drizzle Kit CLI for schema reflection and migrations.
- **Key Settings:** `dialect: "postgresql"`, `schema: "./lib/db/schema.ts"`, points to `process.env.DATABASE_URL`.

### `trigger.config.ts`
- **Layer:** Worker configuration.
- **Purpose:** Defines Trigger.dev v4 project settings, build flags, and instrumentations.
- **Key Settings:** Configures project slug, runtime target (`node:24`), and Sentry build instrumentation.

### `instrumentation.ts` & `instrumentation-client.ts`
- **Layer:** Observability.
- **Purpose:** Initializes Sentry for Next.js server runtime (`instrumentation.ts`) and browser client runtime (`instrumentation-client.ts`) before request processing.

---

## 3. Server Actions (`actions/*.ts`)

Every file in `actions/` starts with `"use server"` and provides type-safe endpoints invoked directly by React UI components:

### `actions/chat.ts`
- **Purpose:** Manages chat creation, message dispatch, and Trigger.dev session initialization.
- **Key Functions:**
  - `startChatTurn(chatId, message, model)`: Verifies user paid plan (`requireUserPaidPlan`), verifies API key existence, starts `chat.agent` session on Trigger.dev, and returns a 1-hour Public Access Token (PAT).
  - `createDirectChat(botId)`: Creates a direct chat record in `chats` table and associates the bot in `chat_members`.
  - `deleteChat(chatId)`: Deletes chat from database; cascades deletion to messages and members.

### `actions/bot.ts`
- **Purpose:** CRUD operations for AI bots.
- **Key Functions:**
  - `createBot(formData)`: Validates input against `insertBotSchema`, checks bot capacity limit (`lib/usage-policy.ts`), generates DiceBear avatar, and inserts into `bots` table.
  - `updateBot(botId, formData)`: Modifies bot name, instructions, or avatar.
  - `deleteBot(botId)`: Deletes bot and triggers Daytona sandbox cleanup.

### `actions/group-chat.ts`
- **Purpose:** Manages group chat lifecycle and bot membership.
- **Key Functions:**
  - `createGroupChat(formData)`: Validates that at least 2 distinct bots are selected (`groupChatFormSchema`), creates group chat row, and links bots in `chat_members`.

### `actions/api-keys.ts`
- **Purpose:** Secure management of user personal API keys.
- **Key Functions:**
  - `saveApiKey(provider, key)`: Validates key against external provider API (`lib/ai/provider-key-validation.ts`). If valid, saves key to Clerk user `privateMetadata`.
  - `deleteApiKey(provider)`: Removes key from Clerk metadata.

### `actions/desktop.ts`
- **Purpose:** Generates live VNC connection URLs for sandboxes.
- **Key Functions:**
  - `getDesktopStreamUrl(botId)`: Checks active sandbox lease in `sandbox_leases`, calls `lib/daytona-vnc.ts`, and returns signed WebSocket RFB URL.

### `actions/memory.ts`
- **Purpose:** Manages user memory preferences and grounded facts.
- **Key Functions:**
  - `updateMemoryPreferences(preferences)`: Updates `memory_preferences` record for the user.
  - `deleteUserMemoryFact(key)`: Deletes specific key from `user_memories`.

### `actions/usage.ts` & `actions/billing.ts`
- **Purpose:** Provides metrics and billing status to the UI.
- **Key Functions:**
  - `getUsageSummary()`: Calculates total sandbox seconds used in current period vs 20-hour limit.
  - `stopActiveSandboxAction()`: Allows user to manually release their running sandbox lease immediately.

---

## 4. Shared Core Library (`lib/`)

### `lib/db/schema.ts`
- **Layer:** Database Schema.
- **Purpose:** Definitive single source of truth for the Neon PostgreSQL database.
- **Exports:** 13 Drizzle pgTable definitions (`bots`, `chats`, `chat_members`, `user_memories`, `group_memories`, `memory_preferences`, `sandbox_leases`, `usage_periods`, `usage_entries`, `worker_runs`, `bot_capacity`, `chatgpt_connections`, `oauth_attempts`). Also exports Drizzle relations and Zod insert schemas (`insertBotSchema`, `groupChatFormSchema`).

### `lib/db/client.ts`
- **Layer:** Database Connection.
- **Purpose:** Instantiates Neon serverless HTTP client and Drizzle query builder.
- **Exports:** `db` singleton instance.

### `lib/billing.ts` & `lib/billing-policy.ts`
- **Layer:** Monetization & Entitlements.
- **Purpose:** Evaluates Clerk Billing status and feature gates.
- **Key Functions:**
  - `getPaidAccessError(userId)`: Returns an error object if user does not hold an active Pro plan ($9/mo).
  - `requireUserPaidPlan(userId)`: Throws error or halts action if user is on Free plan.

### `lib/sandbox-usage.ts`
- **Layer:** Sandbox Orchestration & Lease Management.
- **Purpose:** Enforces 1-sandbox-per-user constraint and handles lease timeouts.
- **Key Functions:**
  - `acquireSandboxLease(userId, sandboxId)`: Executes atomic CAS query on `sandbox_leases`.
  - `releaseSandboxLease(userId)`: Marks lease ready for termination.
  - `settleSandboxUsage(userId)`: Writes elapsed duration to `usage_entries`.

### `lib/daytona.ts` & `lib/daytona-client.ts`
- **Layer:** Sandbox Infrastructure.
- **Purpose:** Wraps `@daytona/sdk` to create, start, stop, and manage Linux sandboxes.
- **Resource Constraints Enforced:** 2 vCPU, 4 GiB RAM, 10 GiB disk.

### `lib/ai/computer-tools.ts`
- **Layer:** AI Execution Tools.
- **Purpose:** Defines the Vercel AI SDK `tool()` collection exposed to bots.
- **Exported Tools:**
  - `bash`: Runs shell commands inside the Daytona sandbox.
  - `readFile` & `writeFile`: Transfers files between bot and sandbox filesystem.
  - `mouseClick`, `mouseMove`, `keyboardType`: Controls X11 desktop.
  - `takeScreenshot`: Captures current desktop screen buffer.

### `lib/ai/memory-manager.ts`
- **Layer:** Context Synthesis.
- **Purpose:** Combines memories across all 3 tiers into the system prompt.
- **Key Functions:**
  - `assembleChatContext({ userId, chatId, botId, sandbox })`: Merges global user memories, group memories, and sandbox `~/MEMORY.md` into formatted prompt context.

### `lib/ai/models.ts`
- **Layer:** Multi-Provider AI Factory.
- **Purpose:** Returns Vercel AI SDK language model instances initialized with user-provided keys.
- **Supported Providers:** Google Generative AI (Gemini 2.5 Flash), OpenRouter (various models), OpenAI (GPT-4o), and ChatGPT OAuth session streams.

---

## 5. Background Worker (`trigger/`)

### `trigger/chat.ts`
- **Layer:** Execution Worker.
- **Purpose:** Houses the main `chat-agent` (`chat.agent`) definition for Trigger.dev v4.
- **Workflow:**
  1. Receives incoming user message, chat ID, and active bot metadata.
  2. Acquires or extends sandbox lease via `lib/sandbox-usage.ts`.
  3. Loads prompt instructions and synthesized memory.
  4. Runs Vercel AI SDK execution loop with `computerTools`.
  5. Streams delta chunks and tool invocation cards back to the client over SSE.
  6. Schedules delayed lease shutdown task (`stop-sandbox-lease`).

### `trigger/sandbox-usage.ts`
- **Layer:** Worker Lifecycle.
- **Purpose:** Hosts background lifecycle tasks:
  - `stop-sandbox-lease`: Delayed task firing 5 minutes after last message to stop idle sandboxes.
  - `recover-expired-sandbox-leases`: 1-minute recurring cron task querying Neon for expired leases and terminating orphaned Daytona containers.

---

## 6. Frontend Components (`components/`)

### `components/chat.tsx`
- **Layer:** Interactive UI.
- **Purpose:** Main conversation interface for both direct and group chats.
- **Key Features:**
  - Consumes `@trigger.dev/sdk/chat/react` hook to stream live responses.
  - Displays message bubbles, markdown code snippets, and expandable tool execution cards.
  - Handles bot `@mentions` and responder selection in group mode.
  - Toggles side-by-side desktop viewer panel.

### `components/chat-desktop.tsx` & `components/chat-desktop-viewer.tsx`
- **Layer:** Interactive UI.
- **Purpose:** Renders live Daytona sandbox Linux desktop.
- **Key Features:** Uses noVNC HTML5 canvas client to stream the bot's visual display over secure WebSockets.

### `components/bot-dialog.tsx`
- **Layer:** Interactive UI.
- **Purpose:** Modal dialog for creating and editing bots with live avatar preview and job preset selection (`lib/bot-presets.ts`).

### `components/app-sidebar.tsx` & `components/workspace-layout.tsx`
- **Layer:** Navigation Layout.
- **Purpose:** Renders fixed responsive sidebar containing direct chat list, group chat list, Quick Switcher (⌘K), usage meter indicators, and profile settings.
