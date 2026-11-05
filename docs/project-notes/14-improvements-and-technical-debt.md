# 14 — Improvements & Technical Debt

> Part of the AI Teammates project notes. Read after [13 — Scalability & Performance](13-scalability-and-performance.md).
> Maps directly to [README](README.md) and repository inspection findings.

This document catalogs technical debt, architectural limitations, and prioritized engineering improvements identified through direct analysis of the AI Teammates codebase. Every finding is backed by concrete file evidence, risk analysis, and recommended remediation steps.

---

## Priority Matrix

| Priority | Area | Finding / Limitation | Codebase Evidence |
|---|---|---|---|
| **P0 (Critical)** | Quality / CI | Absence of automated CI/CD pipeline | No `.github/workflows/` directory in repo |
| **P0 (Critical)** | Database | Schema pushed without committed migrations | `package.json` (`drizzle-kit push`) |
| **P1 (High)** | Scalability | Clerk API rate limit risk for API keys | `actions/api-keys.ts` & `trigger/chat.ts` |
| **P1 (High)** | Security | Unrestricted sandbox outbound internet access | `lib/daytona.ts` |
| **P2 (Medium)** | Integration | Hosted ChatGPT OAuth disabled in production | `lib/chatgpt.ts` (`DISABLED_NOTICE`) |
| **P2 (Medium)** | Testing | Dual test runner maintenance overhead | `vitest.config.mts` vs `node:test` |
| **P2 (Medium)** | Cost / Token | Lack of prompt prefix caching | `trigger/chat.ts` system prompt assembly |
| **P3 (Low)** | Streaming | Bandwidth intensity of noVNC RFB streaming | `components/chat-desktop-viewer.tsx` |

---

## 1. High-Priority Technical Debt (P0 / P1)

### Finding 1: Absence of Automated CI/CD Pipeline
- **Evidence:** The repository contains no `.github/workflows/` or CI configuration files.
- **Risk:** Code quality gates (`tsc --noEmit`, `eslint`, `vitest`, `node:test`) rely entirely on developer discipline running manual pre-flight checks before executing `vercel deploy` or `trigger deploy`. A broken commit can be pushed directly to production.
- **Recommended Remediation:**
  - Create `.github/workflows/ci.yml`.
  - Trigger runs on pull requests and commits to `main`:
    ```yaml
    name: CI Quality Gate
    on: [push, pull_request]
    jobs:
      verify:
        runs-on: ubuntu-latest
        steps:
          - uses: actions/checkout@v4
          - uses: pnpm/action-setup@v3
          - uses: actions/setup-node@v4
            with: { node-version: 24, cache: 'pnpm' }
          - run: pnpm install --frozen-lockfile
          - run: pnpm check
          - run: pnpm lint
          - run: pnpm test
    ```

---

### Finding 2: Direct Schema Push (`db:push`) Without Migration History
- **Evidence:** `package.json` specifies `"db:push": "drizzle-kit push"`. No `migrations/` directory exists.
- **Risk:** `drizzle-kit push` alters the production database schema in-place based on TypeScript schema diffs. While fast in development, in multi-developer production workflows it risks accidental column drops, table renames, or locking timeouts on live tables.
- **Recommended Remediation:**
  - Switch to formal migrations using `drizzle-kit generate`.
  - Store committed SQL migration files in `lib/db/migrations/`.
  - Apply migrations automatically via a dedicated release step or Trigger.dev initialization task.

---

### Finding 3: Clerk API Rate Limits on Key Fetching
- **Evidence:** `trigger/chat.ts` calls `clerkClient().users.getUser(userId)` on every chat turn to read `privateMetadata`.
- **Risk:** Clerk enforces management API rate limits (typically 20–50 requests/second). A surge of concurrent agent turns could trigger HTTP 429 errors, causing chat turns to fail unexpectedly.
- **Recommended Remediation:**
  - Introduce an encrypted table in Neon PostgreSQL (`user_provider_keys`) using AES-256-GCM.
  - Or wrap Clerk API calls with an in-memory Redis cache (e.g., Upstash Redis) with a 15-minute TTL.

---

### Finding 4: Sandbox Outbound Internet Egress Filtering
- **Evidence:** Sandboxes created via `lib/daytona.ts` inherit standard public outbound internet access.
- **Risk:** If a malicious prompt tricks a bot into executing a bash fork bomb or scanning external networks, the Daytona cluster's IP address could be blacklisted or flagged for abuse.
- **Recommended Remediation:**
  - Configure Daytona network policies to restrict outbound container traffic to approved package registries (npm, PyPI) and model endpoints, blocking raw socket connections to arbitrary external IPs.

---

## 2. Medium-Priority Improvements (P2)

### Finding 5: Hosted ChatGPT OAuth Flow Disabled
- **Evidence:** In `lib/chatgpt.ts`, the hosted ChatGPT OAuth integration is marked disabled due to OpenAI's strict OAuth application review requirements. The app falls back to an experimental community OAuth flow (`lib/community-chatgpt.ts`).
- **Impact:** Users connecting ChatGPT Plus accounts must use an experimental flow that carries a higher risk of token revocation by OpenAI.
- **Remediation:** Complete OpenAI's official application review process to enable the native hosted OAuth handler in `app/api/connections/chatgpt/*`.

---

### Finding 6: Dual Test Runner Fragmentation
- **Evidence:** The codebase maintains both Vitest (`tests/*.test.tsx`) and `node:test` (`tests/*.test.mjs`).
- **Impact:** Developers must remember two distinct test commands (`pnpm vitest` vs `node --test`), and assertions differ slightly (`expect()` in Vitest vs `assert` in `node:test`).
- **Remediation:** Configure Vitest with two projects/workspaces (`ui` using `happy-dom` and `backend` using `node` environment) to run all 29 suites under a unified runner while preserving fast execution.

---

### Finding 7: Lack of Prompt Prefix Caching
- **Evidence:** `trigger/chat.ts` re-assembles bot instructions, formatting guidelines, and memory blocks into system prompts on every single message turn.
- **Impact:** In long group chats, transmitting 2,000–5,000 tokens of static bot instructions repeatedly incurs avoidable provider latency and burns user token quotas.
- **Remediation:** Enable prompt caching (e.g., Anthropic Prompt Caching or Gemini Context Caching) for static system instruction prefixes.

---

## 3. Low-Priority Optimizations (P3)

### Finding 8: Bandwidth Intensity of noVNC WebSocket Streaming
- **Evidence:** `components/chat-desktop-viewer.tsx` connects to Daytona via noVNC over WebSockets (RFB protocol).
- **Impact:** The RFB protocol transmits desktop frame rectangles. When watching a bot scroll or stream video, network bandwidth can reach 2–5 Mbps per viewer.
- **Remediation:** Transition to a WebRTC video streaming gateway (H.264 / VP9 video encoding) for the desktop viewer, reducing streaming bandwidth by up to 80%.
