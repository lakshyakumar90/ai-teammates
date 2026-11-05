# 06 — Database & Data Models

> Part of the AI Teammates project notes. Read after [05 — Feature & Code Walkthroughs](05-feature-and-code-walkthroughs.md).
> Maps directly to [`lib/db/schema.ts`](../../lib/db/schema.ts) and [`diagrams/database-er.mmd`](diagrams/database-er.mmd).

The persistence tier of AI Teammates is powered by **Neon Serverless PostgreSQL**, modeled code-first with **Drizzle ORM** and queried over the **Neon Serverless HTTP Driver** (`@neondatabase/serverless`). This document details every table, relationship, indexing strategy, concurrency pattern, and data integrity guarantee.

---

## 1. Database Architecture & Rationale

### Neon Serverless PostgreSQL
- **Storage/Compute Decoupling:** Compute instances spin down to 0 vCPU during periods of user inactivity, eliminating fixed hosting costs.
- **HTTP Query Driver:** Traditional TCP connection pools (such as PgBouncer) suffer from connection limits when thousands of ephemeral Vercel Server Actions or Trigger.dev worker tasks spawn concurrently. The Neon HTTP driver executes queries over stateless HTTP POST requests, eliminating connection pool exhaustion.

### Drizzle ORM
- **Zero Cold-Start Overhead:** Pure TypeScript with no external binary runtime engines (unlike Prisma), keeping serverless execution overhead under 5ms.
- **SQL-Like Mental Model:** Table definitions and query builders directly reflect PostgreSQL dialect primitives.
- **Runtime Zod Integration:** `drizzle-zod` generates runtime validation schemas directly from table definitions.

---

## 2. Table-by-Table Schema Inventory (13 Tables)

```text
┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐
│  usage_periods  │◄──────│  usage_entries  │       │  memory_prefs   │
└────────┬────────┘       └─────────────────┘       └─────────────────┘
         │
         │                ┌─────────────────┐       ┌─────────────────┐
         ├───────────────►│   worker_runs   │       │  user_memories  │
         │                └─────────────────┘       └─────────────────┘
         ▼
┌─────────────────┐
│ sandbox_leases  │
└─────────────────┘

┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐
│      chats      │◄─────►│  chat_members   │◄─────►│      bots       │
└────────┬────────┘       └─────────────────┘       └─────────────────┘
         │
         ▼
┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐
│ group_memories  │       │  bot_capacity   │       │ chatgpt_conns   │
└─────────────────┘       └─────────────────┘       └─────────────────┘
```

---

### 1. `bots`
- **Purpose:** Stores the configuration, persona, instructions, and container reference for user-created AI teammates.
- **Columns:**
  - `id` (`text`, Primary Key): Unique bot identifier, defaulted via `nanoid()`.
  - `userId` (`text`, Not Null): Clerk user ID owning this bot.
  - `name` (`text`, Not Null): Display name of the bot (max 100 characters).
  - `avatar` (`text`, Not Null): Seed string used to generate DiceBear 10 SVG avatars.
  - `job` (`text`, Not Null): Job title / functional role (e.g., "Full-Stack Engineer", max 200 characters).
  - `instructions` (`text`, Nullable): System instructions and behavioral guidelines (max 2,000 characters).
  - `sandboxId` (`text`, Nullable): Active or cached Daytona sandbox container ID.
  - `createdAt` (`timestamp`, Not Null): Defaulted to `now()`.
- **Indexes:** `index("bots_user_id_idx").on(table.userId)`.
- **Validation:** `insertBotSchema` generated via `drizzle-zod`.

### 2. `chats`
- **Purpose:** Stores chat room threads (both direct 1-on-1 chats and multi-bot group chats).
- **Columns:**
  - `id` (`text`, Primary Key): Unique chat identifier (`nanoid()`).
  - `userId` (`text`, Not Null): Clerk user ID owning the chat room.
  - `kind` (`pgEnum("chat_kind", ["direct", "group"])`, Not Null): Discriminator enum.
  - `name` (`text`, Nullable): Required for group chats; direct chats derive display name from bot.
  - `lastMessagePreview` (`text`, Nullable): Cached preview snippet for the sidebar.
  - `lastMessageAt` (`timestamp`, Not Null): Sort key for chat list ordering.
  - `createdAt` (`timestamp`, Not Null): Creation timestamp.
- **Indexes:** `index("chats_user_id_idx").on(table.userId)`.

### 3. `chat_members`
- **Purpose:** Junction table linking bots to chat rooms (Many-to-Many).
- **Columns:**
  - `chatId` (`text`, Not Null): Foreign key to `chats.id` (`onDelete: "cascade"`).
  - `botId` (`text`, Not Null): Foreign key to `bots.id` (`onDelete: "cascade"`).
  - `joinedAt` (`timestamp`, Not Null): Timestamp of addition.
- **Constraints & Indexes:**
  - Composite Primary Key: `primaryKey({ columns: [table.chatId, table.botId] })`.
  - Index: `index("chat_members_bot_id_idx").on(table.botId)`.

### 4. `user_memories`
- **Purpose:** Stores persistent, grounded key-value facts about the user across all chats.
- **Columns:**
  - `userId` (`text`, Not Null): Clerk user identifier.
  - `key` (`text`, Not Null): Normalized fact category or topic.
  - `value` (`text`, Not Null): Fact statement (e.g., "Prefers TypeScript over Python").
  - `updatedAt` (`timestamp`, Not Null): Timestamp of last modification.
- **Constraints:** Composite Primary Key: `primaryKey({ columns: [table.userId, table.key] })`.

### 5. `group_memories`
- **Purpose:** Stores persistent facts scoped specifically to a group chat room.
- **Columns:**
  - `chatId` (`text`, Not Null): Foreign key to `chats.id` (`onDelete: "cascade"`).
  - `key` (`text`, Not Null): Topic key.
  - `value` (`text`, Not Null): Fact content.
  - `updatedAt` (`timestamp`, Not Null): Timestamp of last modification.
- **Constraints:** Composite Primary Key: `primaryKey({ columns: [table.chatId, table.key] })`.

### 6. `memory_preferences`
- **Purpose:** User privacy toggles controlling autonomous memory capture.
- **Columns:**
  - `userId` (`text`, Primary Key): Clerk user ID.
  - `automaticMemory` (`boolean`, Not Null, Default: `true`): Master toggle for AI fact extraction.
  - `globalMemory` (`boolean`, Not Null, Default: `true`): Enables sharing user memories with bots.
  - `groupMemory` (`boolean`, Not Null, Default: `true`): Enables shared group memories.
  - `botMemoryInGroups` (`boolean`, Not Null, Default: `false`): Controls whether private bot memories are surfaced in group turns.

### 7. `sandbox_leases`
- **Purpose:** Enforces the strict invariant of $\le 1$ running Daytona sandbox per user and tracks expiration.
- **Columns:**
  - `userId` (`text`, Primary Key): Ensures only one active lease can exist per user.
  - `id` (`text`, Not Null, Unique): Unique lease operation identifier.
  - `sandboxId` (`text`, Not Null): ID of the running Daytona container.
  - `entryId` (`text`, Nullable): Reference to the active `usage_entries` record.
  - `startsAt` (`timestamp`, Not Null): Start of container lease.
  - `endsAt` (`timestamp`, Not Null): Expiration deadline (extended on active turns).
  - `ready` (`boolean`, Not Null, Default: `false`): True once container finishes boot and port check.
  - `stoppingUntil` (`timestamp`, Nullable): Grace period lock during container teardown.

### 8. `usage_periods`
- **Purpose:** Tracks monthly billing cycles and cumulative quota consumption.
- **Columns:**
  - `id` (`text`, Primary Key): Period identifier.
  - `userId` (`text`, Not Null): Clerk user ID.
  - `startsAt` (`timestamp`, Not Null): Period start.
  - `endsAt` (`timestamp`, Not Null): Period end.
  - `sandboxSeconds` (`integer`, Not Null, Default: 0): Cumulative container runtime in seconds (capped at 72,000s / 20 hours).
  - `botCreations` (`integer`, Not Null, Default: 0): Count of bot creations in period.
- **Indexes:** `index("usage_periods_user_idx").on(t.userId)`.

### 9. `usage_entries`
- **Purpose:** Granular ledger tracking individual sandbox sessions and token consumption.
- **Columns:**
  - `id` (`text`, Primary Key): Ledger entry ID.
  - `periodId` (`text`, Not Null): Foreign key to `usage_periods.id` (`onDelete: "cascade"`).
  - `kind` (`text`, Not Null): Event type (e.g., `sandbox_lease`, `turn_tokens`).
  - `modelId` (`text`, Nullable): Identifier of model used.
  - `amount` (`bigint`, Not Null): Quantity metric.
  - `durationMs` (`bigint`, Not Null, Default: 0): Runtime duration in milliseconds.
  - `inputTokens` / `outputTokens` (`integer`, Nullable): LLM token usage counters.
  - `settled` (`boolean`, Not Null, Default: `false`): Flag indicating session finalized.
  - `createdAt` (`timestamp`, Not Null): Creation timestamp.
- **Indexes:** `index("usage_entries_period_idx").on(t.periodId)`.

### 10. `bot_capacity`
- **Purpose:** Enforces maximum simultaneous bot allocation per user.
- **Columns:**
  - `userId` (`text`, Primary Key): Clerk user ID.
  - `count` (`integer`, Not Null, Default: 0): Total active bot count.

### 11. `worker_runs`
- **Purpose:** Reconciles Trigger.dev worker task runs against user billing periods.
- **Columns:**
  - `id` (`text`, Primary Key): Run ID.
  - `userId` (`text`, Not Null): Clerk user ID.
  - `periodId` (`text`, Not Null): Foreign key to `usage_periods.id`.
  - `taskId` (`text`, Not Null): Trigger.dev task identifier (`chat-agent`).
  - `costMicros` (`bigint`, Not Null, Default: 0): Worker compute cost.
  - `durationMs` (`bigint`, Not Null, Default: 0): Execution duration.
  - `complete` (`boolean`, Not Null, Default: `false`): Completion status.
  - `syncedAt` (`timestamp`, Nullable): Last reconciliation sync.
- **Indexes:** `index("worker_runs_period_idx").on(t.periodId)`.

### 12. `chatgpt_connections`
- **Purpose:** Stores encrypted OAuth tokens for ChatGPT Plus/Team connections.
- **Columns:**
  - `userId` (`text`, Primary Key): Clerk user ID.
  - `subject` / `clientId` / `label` (`text`, Not Null): Provider account identifiers.
  - `credentials` (`text`, Not Null): **AES-256 encrypted** refresh & access token blob.
  - `scopes` (`text`, Not Null): Approved OAuth scopes.
  - `expiresAt` (`timestamp`, Not Null): Token expiration.
  - `refreshLockUntil` (`timestamp`, Nullable): Mutex lock preventing concurrent refresh races.
  - `revision` (`integer`, Not Null, Default: 0): Optimistic locking version.

### 13. `oauth_attempts`
- **Purpose:** Ephemeral storage for PKCE state validation during OAuth authorization flows.
- **Columns:**
  - `stateHash` (`text`, Primary Key): SHA-256 hash of OAuth state parameter.
  - `userId` (`text`, Not Null): User initiating authorization.
  - `secrets` (`text`, Not Null): Encrypted PKCE code verifier and nonce.
  - `expiresAt` (`timestamp`, Not Null): 10-minute expiration deadline.

---

## 3. Concurrency Control & Compare-And-Swap (CAS)

In serverless distributed systems, race conditions can easily create duplicate sandboxes. AI Teammates avoids distributed locking services by executing **atomic Compare-And-Swap (CAS)** SQL statements in `lib/sandbox-usage.ts`.

### Atomic Lease Acquisition Pattern
```typescript
// Atomic CAS update: Only succeed if no lease exists, or existing lease has expired
const result = await db
  .insert(sandboxLeases)
  .values({
    userId,
    id: leaseId,
    sandboxId,
    startsAt: now,
    endsAt: leaseDeadline,
    ready: false,
  })
  .onConflictDoUpdate({
    target: sandboxLeases.userId,
    set: {
      id: leaseId,
      sandboxId,
      startsAt: now,
      endsAt: leaseDeadline,
      ready: false,
    },
    where: or(
      lt(sandboxLeases.endsAt, now), // Existing lease has expired
      eq(sandboxLeases.id, leaseId)  // Existing lease is already owned by this task
    ),
  })
```
If another process holds an unexpired lease, the `where` clause fails, the row is not updated, and the caller is blocked from launching a duplicate container.

---

## 4. Referential Integrity & Cascade Deletes

PostgreSQL enforces relational cascades directly:
- When a `chats` record is deleted:
  - All linked `chat_members` records are immediately cascade deleted.
  - All linked `group_memories` records are cascade deleted.
- When a `usage_periods` record is deleted:
  - All associated `usage_entries` and `worker_runs` are cascade deleted.
- When a `bots` record is deleted:
  - All linked `chat_members` records are cascade deleted.

---

## 5. Migration Strategy: `db:push` vs Migrations

AI Teammates adopts **`drizzle-kit push`** (`pnpm db:push`) rather than committing sequential SQL migration scripts.

### Rationale
- Fast iteration during feature expansion.
- Drizzle Kit automatically introspects Neon PostgreSQL, generates the schema diff in memory, warns if data loss could occur (e.g., dropping columns), and executes the alter commands atomically.
- Eliminates migration merge conflicts across Git branches.

*(Note: For enterprise environments with multiple database replicas, moving to checked-in migration scripts with `drizzle-kit generate` is recommended).*
