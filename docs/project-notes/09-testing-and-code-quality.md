# 09 — Testing & Code Quality

> Part of the AI Teammates project notes. Read after [08 — API & Realtime Workflows](08-api-and-realtime-workflows.md).
> Maps directly to [`tests/`](../../tests/) and package test scripts.

AI Teammates employs a dual-framework testing architecture: **Vitest** for React UI components, and Node's native test runner (**`node:test`**) for backend services, mathematical lease calculations, and domain logic.

---

## 1. Dual Testing Architecture: Why Two Frameworks?

| Concern | Vitest (`tests/*.test.tsx`) | `node:test` (`tests/*.test.{mjs,ts}`) |
|---|---|---|
| **Primary Domain** | React 19 UI components, hooks, DOM assertions. | Backend policies, AI parsing, CAS leases, DB operations. |
| **Environment** | `happy-dom` / `jsdom` with JSX/TSX transforms. | Native Node.js 24 runtime. |
| **Execution Speed** | Fast (with bundling overhead for JSX). | Instant (zero external framework overhead). |
| **Test Suites** | 7 suites. | 22 suites (including 4 requiring a live Neon DB). |
| **Execution Command** | `pnpm vitest run` | `node --test tests/*.test.mjs` |

### Architectural Rationale
- **Vitest** provides the DOM environment and React component mocking necessary to test interactive components like `api-key-settings.tsx` and `chatgpt-routes.tsx`.
- **`node:test`** provides a dependency-free, ultra-fast test harness that mirrors the exact Node 24 environment running in Trigger.dev background workers.

---

## 2. Complete Test Suite Inventory (29 Suites)

### Vitest UI Test Suites (7 Suites)

| Test File | Target Component / Area | What It Proves |
|---|---|---|
| `tests/api-key-actions.test.tsx` | `actions/api-keys.ts` | Proves API keys are validated before saving and properly passed to Clerk metadata. |
| `tests/api-key-settings.test.tsx` | `components/api-key-settings.tsx` | Verifies form inputs, masking, validation errors, and submission states. |
| `tests/api-key-sidebar.test.tsx` | `components/app-sidebar.tsx` | Verifies warning indicators when user is missing required API keys. |
| `tests/personal-provider-routing.test.tsx`| Model Routing UI | Proves the UI properly enables/disables models based on saved user keys. |
| `tests/chatgpt-routes.test.tsx` | OAuth Route Handlers | Tests redirect URLs and PKCE state validation logic. |
| `tests/community-chatgpt-routes.test.tsx`| Community OAuth Handler | Tests callback handling and session cookie creation. |
| `tests/community-chatgpt-ui.test.tsx` | Community Connection UI | Verifies connection status badges and disconnect confirmation dialogs. |

### Node:test Backend & Logic Suites (22 Suites)

| Test File | Target Subsystem | What It Proves | Live DB? |
|---|---|---|---|
| `tests/auth-recovery.test.mjs` | `lib/auth-policy.ts` | Validates session error recovery and expired token redirects. | No |
| `tests/billing-policy.test.mjs` | `lib/billing-policy.ts` | Proves Pro plan checks gate features while Free accounts receive upgrade errors. | No |
| `tests/bot-memory.test.mjs` | `lib/ai/bot-memory.ts` | Validates markdown bullet formatting and the 32KB memory size limit. | No |
| `tests/bot-mentions.test.mjs` | `lib/ai/bot-mentions.ts` | Tests regex parsing of `@BotName` tags in message strings. | No |
| `tests/chat-error.test.mjs` | `lib/ai/chat-error.ts` | Verifies graceful error formatting for missing keys or quota limits. | No |
| `tests/chatgpt-integration.test.ts`| `lib/chatgpt.ts` | Verifies token refresh and AES-256-GCM encryption roundtrips. | **Yes** |
| `tests/community-chatgpt-integration.test.ts`| `lib/community-chatgpt.ts`| Tests community OAuth token storage and decryption. | **Yes** |
| `tests/computer-scroll.test.mjs`| `lib/ai/computer-tools.ts` | Validates coordinate calculation and bounds checking for mouse tools. | No |
| `tests/desktop-progress.test.mjs`| `lib/ai/desktop-progress.ts`| Tests UI badge updates during active mouse/keyboard actions. | No |
| `tests/group-handoff.test.mjs` | `lib/ai/group-handoff.ts` | Proves handoff tool generates valid target bot transitions. | No |
| `tests/group-message-segments.test.mjs`| `lib/ai/group-message-segments.ts`| Verifies chat stream chunk splitting across multiple bots. | No |
| `tests/group-workflow.test.mjs` | Group Chat Orchestrator | End-to-end integration test of multi-bot conversation turns. | No |
| `tests/memory-capture.test.mjs` | `lib/ai/memory-capture.ts` | Verifies regex and JSON extraction of user preference facts. | No |
| `tests/memory-manager.test.mjs` | `lib/ai/memory-manager.ts` | Proves 3-tier memory synthesis properly merges permitted facts. | No |
| `tests/openrouter-models.test.ts`| `lib/ai/models.ts` | Verifies model ID resolution and OpenRouter endpoint mapping. | No |
| `tests/personal-api-keys.test.mjs`| `lib/ai/user-api-keys.ts` | Tests key formatting and redaction rules. | No |
| `tests/provider-key-validation.test.mjs`| `lib/ai/provider-key-validation.ts`| Mocks vendor endpoints to test key rejection/acceptance. | No |
| `tests/response-timeout.test.mjs`| `lib/ai/response-timeout.ts`| Validates execution timeout thresholds for AI tool calls. | No |
| `tests/usage-integration.test.ts`| `lib/usage.ts` | Verifies quota rollups and period boundary resets. | **Yes** |
| `tests/usage-model.test.ts` | `lib/ai/usage-model.ts` | Validates token counting and calculation logic. | No |
| `tests/usage-policy.test.mjs` | `lib/usage-policy.ts` | Enforces 20-hour sandbox and 3-bot capacity limits. | No |
| `tests/worker-usage-integration.test.ts`| `lib/worker-usage.ts` | Tests worker reconciliation against Neon `worker_runs`. | **Yes** |

---

## 3. Running Test Suites Locally

```bash
# Run all unit and integration tests (Vitest + Node:test)
pnpm test

# Run Vitest UI tests in watch mode
pnpm vitest

# Run only Node native backend tests
node --test tests/*.test.mjs

# Run live database integration tests (requires DATABASE_URL in .env.local)
pnpm test:integration
```

---

## 4. Code Quality & Static Analysis

AI Teammates enforces three layers of static quality gates before any code is deployed:

1. **TypeScript Strict Type Check:**
   ```bash
   pnpm check # Runs tsc --noEmit
   ```
   Enforces `strict: true`, preventing implicit `any`, unhandled `null`/`undefined`, and broken schema typings.

2. **ESLint 9 Flat Configuration (`eslint.config.mjs`):**
   - Utilizes Next.js recommended rules, React Hooks rules, and TypeScript-ESLint.
   - Enforces React 19 hook dependency correctness and disallows unused variables.

3. **Prettier Formatting (`.prettierrc`):**
   - Enforces consistent code formatting: no semicolons (`semi: false`), single quotes (`singleQuote: true`), and 2-space indentation.
