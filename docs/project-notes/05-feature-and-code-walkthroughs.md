# 05 — Feature and Code Walkthroughs

> Part of the AI Teammates project notes. Read after [04 — Folder & File Reference](04-folder-and-file-reference.md).
> Maps directly to [README](README.md) and repository test suites.

This document traces the complete end-to-end data lifecycle of every major application feature from user action in the browser down through server actions, background workers, databases, and container sandboxes.

---

## Feature 1: User Onboarding & Subscription Gating

### 1. What it does
Provides email/OAuth sign-up and sign-in via Clerk, and gates access to bots, sandboxes, and chat functionality behind a $9/month Pro subscription.

### 2. Why it exists
Protects costly container infrastructure (Daytona) and cloud worker hours from unauthorized abuse, ensuring only paying users consume resources.

### 3. Flow & Components
- **UI Starting Point:** `app/sign-in/[[...sign-in]]/page.tsx` or `app/pricing/page.tsx`.
- **Middleware:** `proxy.ts` executes `clerkMiddleware()`. Any unauthenticated request to `/(dashboard)` or `/(account)` is redirected to `/sign-in`.
- **Billing Evaluation:** When an authenticated user accesses the dashboard, Server Actions call `lib/billing.ts` -> `getPaidAccessError(userId)`.
- **Entitlement Check:** Clerk Billing API is queried for the `pro` subscription plan and feature flags (`bots`, `sandboxes`).
- **Gating Component:** If unpaid, `components/paid-access.tsx` renders an upgrade prompt with plan comparison and checkout button.
- **Security:** Invariants are double-checked on the backend inside Server Actions and worker tasks before any compute is provisioned.
- **Verified by Tests:** `tests/billing-policy.test.mjs`.

---

## Feature 2: Personal API Key Management (BYOK)

### 1. What it does
Allows users to save personal API keys for Google Gemini, OpenRouter, and OpenAI. Keys are verified live against vendor endpoints before saving.

### 2. Why it exists
Enforces the zero-model-cost business model. The platform never funds LLM tokens; all model invocations bill directly to the user's provider account.

### 3. Step-by-Step Execution Lifecycle
1. **User Action:** User navigates to `/api-keys` and submits their API key in `components/api-key-settings.tsx`.
2. **Form Validation:** React Hook Form validates syntax using `lib/api-key-schema.ts`.
3. **Server Action Invocation:** Calls `saveApiKey(provider, key)` in `actions/api-keys.ts`.
4. **Live Verification:** Before saving, `lib/ai/provider-key-validation.ts` performs a minimal live call (e.g., listing models or 1-token test prompt) against the provider.
5. **Secure Storage:** If valid, the key is written to Clerk's user record using `clerkClient().users.updateUserMetadata(userId, { privateMetadata: { ... } })`.
6. **Security & Privacy:** The key is never written to Neon database tables, never logged in Sentry, and never exposed in browser HTML props.
7. **Verified by Tests:** `tests/api-key-actions.test.tsx`, `tests/provider-key-validation.test.mjs`, and `tests/personal-api-keys.test.mjs`.

---

## Feature 3: Bot Creation & Customization

### 1. What it does
Allows users to create specialized AI bots with custom names, jobs, instructions, and unique visual avatars.

### 2. Why it exists
Gives identity, domain specialization, and persistent container sandboxes to individual AI agents.

### 3. Step-by-Step Execution Lifecycle
1. **UI Initiation:** User clicks "New Bot" in `components/app-sidebar.tsx`, opening `components/bot-dialog.tsx`.
2. **Preset Selection:** User can choose quick presets (Researcher, Code Reviewer, Tutor) from `lib/bot-presets.ts`.
3. **Avatar Generation:** The dialog requests avatars from DiceBear 10 using random seeds, rendered instantly in the preview.
4. **Quota Validation:** `actions/bot.ts` -> `createBot()` checks bot count in `lib/usage-policy.ts` to ensure the user does not exceed the maximum allowed bots (3 bots on standard Pro plan).
5. **Database Insert:** Drizzle inserts the new bot into the `bots` table in Neon (`lib/db/schema.ts`):
   ```typescript
   await db.insert(bots).values({ userId, name, job, instructions, avatar })
   ```
6. **Response & Revalidation:** Next.js revalidates the sidebar path (`revalidatePath('/')`), closing the dialog and showing the new bot immediately.
7. **Verified by Tests:** Unit-tested via `tests/usage-policy.test.mjs`.

---

## Feature 4: Direct Chat Turn Execution & Sandbox Tools

### 1. What it does
A user chats with a bot. The bot can reply with markdown, write/run code in a Linux sandbox, read files, and manipulate a desktop GUI.

### 2. Step-by-Step Execution Lifecycle
```text
[ Browser ] ──(1. startChatTurn)──► [ actions/chat.ts ]
                                            │
                              (2. Verify Pro & Mint PAT)
                                            │
                                            ▼
[ Browser ] ◄──(3. SSE Stream)──── [ Trigger.dev: chat-agent ]
                                            │
                              (4. Load Key & Memory)
                                            │
                                            ▼
                                   [ Vercel AI SDK Loop ]
                                            │
                       ┌────────────────────┴────────────────────┐
                       ▼                                         ▼
            [ LLM: Gemini/OpenRouter ]               [ Daytona Sandbox ]
              - Streams text deltas                   - Executes bash commands
              - Generates tool calls                  - Writes files & moves mouse
```

1. **User Message:** User enters a prompt in `components/ai-elements/prompt-input.tsx` inside `components/chat.tsx`.
2. **Server Action:** Calls `startChatTurn(chatId, message, model)` in `actions/chat.ts`.
3. **Pre-flight Checks:**
   - Validates Pro subscription (`requireUserPaidPlan`).
   - Retrieves user's decrypted provider API key from Clerk `privateMetadata`.
   - Acquires sandbox lease via `acquireSandboxLease()` in `lib/sandbox-usage.ts`.
4. **Trigger Session Start:** Starts a run of `chat-agent` on Trigger.dev v4 and mints a 1-hour Public Access Token (PAT).
5. **Client SSE Hook:** Client component `components/chat.tsx` connects to Trigger.dev's SSE stream via `@trigger.dev/sdk/chat/react`.
6. **Worker Agent Execution (`trigger/chat.ts`):**
   - Synthesizes system instructions (`lib/ai/bot-instructions.ts`) and memories (`lib/ai/memory-manager.ts`).
   - Instantiates the AI model (`lib/ai/models.ts`).
   - Injects Daytona computer tools (`lib/ai/computer-tools.ts`).
7. **Tool Call Loop:** If the LLM requests a tool (e.g., `bash` or `writeFile`), the worker executes the command inside Daytona, captures stdout/stderr, and returns the result back to the model context.
8. **Memory Extraction:** Once the turn completes, `lib/ai/memory-capture.ts` extracts any grounded user preferences and commits them to `user_memories`.
9. **Lease Extension:** Schedules delayed task `stop-sandbox-lease` 5 minutes in the future.
10. **Verified by Tests:** `tests/personal-provider-routing.test.tsx`, `tests/chat-error.test.mjs`.

---

## Feature 5: Group Chat with Mentions & Bot Handoff

### 1. What it does
Enables multi-bot collaboration in a single chat room. Users can tag `@BotName`, pick who responds, or let bots hand off work to one another.

### 2. Step-by-Step Execution Lifecycle
1. **Creation:** User creates a group in `components/group-chat-dialog.tsx`, selecting $\ge 2$ bots. `actions/group-chat.ts` inserts into `chats` (`kind: "group"`) and creates rows in `chat_members`.
2. **Mention Parsing:** When a user types a prompt containing `@BotName`, `lib/ai/bot-mentions.ts` parses the tagged bot ID.
3. **Context Injection:** In `trigger/chat.ts`, the group context is formatted to show the roster of all participating bots, their job descriptions, and past message attributions (`lib/ai/group-message-segments.ts`).
4. **Handoff Tool Execution:**
   - The active bot has access to the `handoff` tool defined in `lib/ai/group-handoff.ts`.
   - If Bot A determines a task is outside its expertise (e.g., "This requires deep Python refactoring; handing off to CodeBot"), it invokes `handoff({ targetBotId, summary })`.
   - The worker records the handoff segment, swaps the active bot context, and triggers the next turn for Bot B within the same stream.
5. **Shared Group Memory:** Facts relevant to the group discussion are saved to `group_memories` in Neon and visible to all bots in that group.
6. **Verified by Tests:** `tests/group-workflow.test.mjs`, `tests/bot-mentions.test.mjs`, and `tests/group-handoff.test.mjs`.

---

## Feature 6: Live Linux Desktop Preview (noVNC)

### 1. What it does
Provides a side-by-side live video canvas of the bot's cloud computer desktop, allowing users to watch the bot launch browsers, click buttons, and manipulate windows.

### 2. Step-by-Step Execution Lifecycle
1. **Toggle Viewer:** User clicks the "Desktop" toggle button in `components/chat-header.tsx`.
2. **URL Generation:** Client calls `getDesktopStreamUrl(botId)` in `actions/desktop.ts`.
3. **VNC Token Signing:** Server verifies that the bot has an active, ready sandbox lease (`sandbox_leases` table) and calls `lib/daytona-vnc.ts` to request a signed VNC WebSocket URL from Daytona.
4. **WebSocket RFB Connection:** `components/chat-desktop-viewer.tsx` mounts a noVNC RFB (Remote FrameBuffer) client and connects directly to Daytona's secure WebSocket stream.
5. **Canvas Rendering:** Desktop frames are drawn live onto an HTML5 `<canvas>` element with support for fullscreen mode and responsive scaling.
6. **Desktop Progress Indicator:** While the bot moves the mouse or types, progress badges appear in `components/chat-desktop.tsx` tracking active actions (`tests/desktop-progress.test.mjs`).

---

## Feature 7: Three-Tier Memory System & Privacy Controls

### 1. What it does
Maintains long-term context across three distinct boundaries:
- Global User Memory (User-level facts across all chats).
- Group Memory (Facts specific to a group chat).
- Bot Memory (Working scratchpad notes private to a bot).

### 2. Step-by-Step Execution Lifecycle
1. **Capture:** When a turn completes in `trigger/chat.ts`, `lib/ai/memory-capture.ts` uses structured LLM output (`generateText`) to detect new facts.
2. **User Privacy Enforcement:** `memoryPreferences` table checks whether `automaticMemory` and `globalMemory` are enabled:
   - If enabled: Fact is inserted/updated in `user_memories` (Neon).
   - If in group chat and `groupMemory` is enabled: Fact is stored in `group_memories` (Neon).
3. **Bot Sandbox Storage:**
   - Bot memory is written to `~/MEMORY.md` inside the Daytona sandbox container (`lib/ai/bot-memory.ts`).
   - Content is strictly validated by `memoryContentSchema` (must be markdown fact bullets or headings, $\le$ 32KB).
4. **Context Assembly:** When starting subsequent turns, `lib/ai/memory-manager.ts` fetches and merges permitted memories into the system prompt.
5. **User Management:** Users can toggle memory permissions or delete individual facts on the `/memory` page (`app/(account)/memory/page.tsx`).
6. **Verified by Tests:** `tests/memory-manager.test.mjs`, `tests/memory-capture.test.mjs`, and `tests/bot-memory.test.mjs`.

---

## Feature 8: Usage Tracking & Sandbox Lease Reclamation

### 1. What it does
Enforces a 20-hour monthly sandbox quota, ensures $\le 1$ running sandbox per user at any time, and reclaims idle sandboxes after 5 minutes.

### 2. Step-by-Step Execution Lifecycle
1. **Turn Start:** `lib/sandbox-usage.ts` -> `acquireSandboxLease(userId, sandboxId)` executes an atomic CAS update on `sandbox_leases`.
2. **Quota Check:** Checks elapsed seconds in `usage_periods`. If $\ge 72,000$ seconds (20 hours), the turn is rejected with a quota error.
3. **Turn Completion:** The worker schedules a delayed Trigger.dev task: `stop-sandbox-lease` with a 5-minute delay.
4. **Delayed Shutdown:** If no new messages arrive within 5 minutes, `stop-sandbox-lease` executes:
   - Calls Daytona API to stop the container.
   - Updates `sandbox_leases` to set `ready = false`.
   - Records elapsed run seconds into `usage_entries`.
5. **Reconciliation Cron:** Every 1 minute, `recover-expired-sandbox-leases` runs on Trigger.dev. It finds any database lease whose `endsAt` timestamp has passed without being stopped and triggers container shutdown.
6. **UI Countdown & Kill Switch:** The Usage dashboard (`app/(account)/usage/page.tsx`) displays live remaining sandbox time and provides a "Stop Sandbox Now" button (`components/usage-countdown.tsx`).
7. **Verified by Tests:** `tests/usage-integration.test.ts`, `tests/worker-usage-integration.test.ts`, and `tests/usage-policy.test.mjs`.
