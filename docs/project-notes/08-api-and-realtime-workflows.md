# 08 — API & Realtime Workflows

> Part of the AI Teammates project notes. Read after [07 — Authentication & Security](07-authentication-and-security.md).
> Maps directly to [`actions/`](../../actions/) and [`diagrams/realtime-workflow.mmd`](diagrams/realtime-workflow.mmd).

AI Teammates utilizes a hybrid communication architecture: **Next.js Server Actions** for transactional RPCs, **HTTP Route Handlers** for third-party OAuth handshakes, and **Server-Sent Events (SSE)** via **Trigger.dev v4** for real-time agent streaming.

---

## 1. Server Action API Surface

The application avoids REST and GraphQL in favor of type-safe Next.js Server Actions (`"use server"`).

```text
┌─────────────────┐                                  ┌──────────────────────────┐
│ React Component │──(Server Action RPC: HTTP POST)─►│ actions/*.ts             │
│ (Client Tree)   │◄─(Type-Safe Result / Error)──────│ - auth() check           │
└─────────────────┘                                  │ - Drizzle / SDK mutation │
                                                     └──────────────────────────┘
```

### Complete Action Inventory

| Action File | Function Name | Input Arguments | Return Type | Purpose |
|---|---|---|---|---|
| `actions/chat.ts` | `startChatTurn` | `chatId: string`, `message: string`, `modelId: string` | `{ publicAccessToken: string, sessionId: string }` | Validates billing, mints 1h Trigger.dev PAT, and launches agent turn. |
| `actions/chat.ts` | `createDirectChat` | `botId: string` | `{ chatId: string }` | Creates 1-on-1 chat row and registers bot membership. |
| `actions/chat.ts` | `deleteChat` | `chatId: string` | `void` | Cascade deletes chat, members, and group memories. |
| `actions/bot.ts` | `createBot` | `formData: FormData` | `{ botId: string }` | Validates schema, checks bot capacity, creates bot row. |
| `actions/bot.ts` | `updateBot` | `botId: string`, `formData: FormData` | `void` | Updates name, instructions, or avatar seed. |
| `actions/bot.ts` | `deleteBot` | `botId: string` | `void` | Deletes bot and triggers Daytona sandbox cleanup. |
| `actions/group-chat.ts`| `createGroupChat` | `formData: FormData` | `{ chatId: string }` | Validates $\ge 2$ bots, creates group chat and memberships. |
| `actions/api-keys.ts` | `saveApiKey` | `provider: string`, `key: string` | `{ success: boolean }` | Verifies key live with provider; writes to Clerk private metadata. |
| `actions/api-keys.ts` | `deleteApiKey` | `provider: string` | `void` | Removes key from Clerk private metadata. |
| `actions/desktop.ts` | `getDesktopStreamUrl` | `botId: string` | `{ vncUrl: string }` | Signs VNC WebSocket stream URL for noVNC canvas. |
| `actions/memory.ts` | `updateMemoryPreferences` | `preferences: FormSchema` | `void` | Updates privacy toggles in `memory_preferences`. |
| `actions/memory.ts` | `deleteUserMemoryFact` | `key: string` | `void` | Removes specific user memory fact from Neon. |
| `actions/usage.ts` | `getUsageSummary` | `void` | `UsageSummary` | Returns sandbox seconds used, quota remaining, active lease. |
| `actions/usage.ts` | `stopActiveSandboxAction` | `void` | `void` | User manual kill switch for running cloud sandbox. |

---

## 2. HTTP Route Handlers (OAuth Surface)

Three dedicated Route Handlers exist under `app/api/connections/chatgpt/*` to handle external redirect handshakes:

1. **`GET /api/connections/chatgpt/start`:**
   - Generates PKCE code challenge and state token.
   - Saves hashed state in `oauth_attempts` table.
   - Redirects user to OpenAI OAuth authorization endpoint.
2. **`GET /api/connections/chatgpt/callback`:**
   - Validates returning state against `oauth_attempts`.
   - Exchanges authorization code for access and refresh tokens.
   - Encrypts tokens with AES-256-GCM and persists them in `chatgpt_connections`.
3. **`POST /api/connections/chatgpt/community`:**
   - Handles the experimental `@openai-oauth` community connection flow.

---

## 3. Realtime Chat Streaming Lifecycle

Traditional web serverless functions cannot hold open streaming connections during long-running tool executions. AI Teammates delegates the streaming pipeline directly to Trigger.dev:

```text
[ Browser: components/chat.tsx ]
       │
       │ 1. startChatTurn(chatId, message, model)
       ▼
[ Server Action: actions/chat.ts ]
       │
       │ 2. auth.getUser() & requireUserPaidPlan()
       │ 3. chat.agent.startSession()
       │ 4. mintChatAccessToken() (1h TTL)
       ▼
[ Browser receives PAT ]
       │
       │ 5. Connect SSE stream directly to Trigger.dev
       ▼
[ Trigger.dev Cloud: chat-agent (Node 24 Worker) ]
       │
       │───► [ SSE Chunk: text-delta ("Thinking...") ] ──────────► [ Browser UI ]
       │───► [ SSE Chunk: tool-call ("bash: npm test") ] ────────► [ Tool Card ]
       │───► [ SSE Chunk: tool-result ("Passing: 12") ] ─────────► [ Tool Output ]
       │───► [ SSE Chunk: text-delta ("All tests passed!") ] ────► [ Message Bubble ]
       ▼
[ Turn Complete: Schedule delayed stop-sandbox-lease (5m) ]
```

### Key Realtime Steps

1. **Session & Token Minting:**
   - `actions/chat.ts` verifies that the user has an active Pro subscription and valid provider key.
   - It initializes a Trigger.dev session and mints a short-lived Public Access Token (PAT) restricted exclusively to that session.
2. **Direct Browser SSE Connection:**
   - The browser component (`components/chat.tsx`) uses the `@trigger.dev/sdk/chat/react` hook to establish a Server-Sent Events (SSE) connection directly with Trigger.dev Cloud.
   - Vercel serverless functions are completely freed from holding open the connection.
3. **Delta Streaming & Tool Invocations:**
   - The worker streams text deltas, tool call events (`tool-call`), and tool results (`tool-result`) as structured JSON chunks over SSE.
   - The UI reassembles these deltas in real-time, rendering syntax-highlighted code blocks (`components/ai-elements/code-block.tsx`) and expandable tool execution cards (`components/ai-elements/tool.tsx`).
4. **Reconnection & Resilience:**
   - If the user's browser temporarily disconnects (e.g., network hiccup or tab switch), the `@trigger.dev/sdk/chat/react` client reconnects using the session ID and PAT.
   - Trigger.dev's durable task engine replays missed message segments.

---

## 4. Multi-Bot Group Handoff Protocol

In group chats (`kind: "group"`), multiple bots collaborate in a single shared conversation.

```text
[ User Prompt: "@Planner plan this feature" ]
                     │
                     ▼
             [ Active: Planner ]
                     │
         (Executes plan in sandbox)
                     │
       (Invokes handoff({ targetBotId: "coder-id", summary: "..." }))
                     │
                     ▼
         [ Stream Injects Handoff Divider ]
                     │
                     ▼
              [ Active: Coder ]
                     │
         (Receives handoff summary)
                     │
         (Writes code in sandbox)
```

1. **Mention Detection:** `lib/ai/bot-mentions.ts` parses `@BotName` from the user's message to designate the initial responder. If no mention exists, the user's selected responder in the UI receives the turn.
2. **Handoff Tool Declaration:** When the active bot runs, the worker provides the `handoff` tool from `lib/ai/group-handoff.ts`:
   ```typescript
   tool({
     description: "Hand off the conversation to another bot in the group.",
     parameters: z.object({
       targetBotId: z.string(),
       summary: z.string().describe("Context and instructions for the receiving bot"),
     }),
     execute: async ({ targetBotId, summary }) => { ... }
   })
   ```
3. **Context Transition:** When the tool executes, the worker:
   - Appends a handoff divider message to the chat stream.
   - Switches the active persona, instructions, and Daytona sandbox context to the target bot.
   - Automatically kicks off the next execution turn inside the existing Trigger.dev stream.
