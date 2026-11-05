# 10 — Development & Deployment Guide

> Part of the AI Teammates project notes. Read after [09 — Testing & Code Quality](09-testing-and-code-quality.md).
> Maps directly to [README](README.md) and [`DEPLOYMENT.md`](../../DEPLOYMENT.md).

This guide provides instructions for setting up, developing, testing, deploying, and troubleshooting the AI Teammates application.

---

## 1. Prerequisites

- **Node.js:** v24.x (matching Trigger.dev worker runtime).
- **Package Manager:** `pnpm` v9+.
- **External Platform Accounts:**
  - **Neon:** Serverless PostgreSQL database.
  - **Clerk:** Authentication & Clerk Billing ($9/mo Pro plan).
  - **Trigger.dev:** Cloud account for v4 background worker tasks.
  - **Daytona:** Cloud provider for isolated Linux sandboxes.
  - **Sentry:** Error tracking and performance monitoring.

---

## 2. Environment Variable Reference

*(Note: In accordance with repository ground rules, environment variables are listed by name and purpose only — no secret values are reproduced).*

| Variable Name | Required By | Scope | Purpose |
|---|---|---|---|
| `DATABASE_URL` | Neon DB / Drizzle | Web & Worker | PostgreSQL connection string (pooled HTTP endpoint). |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk | Client (Browser) | Public key for Clerk frontend components and hooks. |
| `CLERK_SECRET_KEY` | Clerk | Web & Worker | Secret key for server-side auth checks, user metadata, and billing APIs. |
| `TRIGGER_SECRET_KEY` | Trigger.dev | Web & Worker | Authentication key to dispatch tasks and mint session PATs. |
| `DAYTONA_API_KEY` | Daytona SDK | Web & Worker | API key to provision, stop, and execute tools in cloud sandboxes. |
| `DAYTONA_SERVER_URL` | Daytona SDK | Web & Worker | Base URL of the Daytona management cluster. |
| `DAYTONA_TARGET` | Daytona SDK | Worker | Deployment target region for container sandboxes. |
| `CHATGPT_TOKEN_SECRET` | AES-256 Crypto | Web & Worker | 32-byte secret used to encrypt/decrypt OAuth refresh tokens. |
| `NEXT_PUBLIC_SENTRY_DSN` | Sentry | Client (Browser) | DSN for frontend browser exception tracking. |
| `SENTRY_DSN` | Sentry | Web & Worker | DSN for server-side Next.js and Trigger worker telemetry. |
| `SENTRY_AUTH_TOKEN` | Sentry CLI | Build / Tooling | Used during `next build` to upload minified source maps. |

---

## 3. Local Development Setup

### 1. Install Dependencies
```bash
pnpm install
```

### 2. Configure Environment Variables
Create `.env.local` in the project root and populate the required keys defined above.

### 3. Synchronize Database Schema
Push the Drizzle schema directly to your Neon PostgreSQL instance:
```bash
pnpm db:push
```

### 4. Start Development Processes
Running the complete system locally requires **two terminal processes**:

- **Terminal 1: Next.js Web Application:**
  ```bash
  pnpm dev
  ```
  Starts Next.js on `http://localhost:3000`.

- **Terminal 2: Trigger.dev Background Worker:**
  ```bash
  npx trigger.dev@latest dev
  ```
  Connects your local machine to Trigger.dev Cloud, executing `chat-agent` and lease tasks triggered from your local web app.

---

## 4. Manual Quality Gates (Pre-Flight Checklist)

The repository intentionally has **no automated CI workflow** (`.github/workflows` does not exist). Developers must run the pre-flight checklist locally before deploying to production:

```bash
# 1. Type check
pnpm check

# 2. Lint check
pnpm lint

# 3. Unit & Integration tests
pnpm test
```

---

## 5. Production Deployment

AI Teammates utilizes a **dual-host deployment architecture**:

```text
┌─────────────────────────┐          ┌─────────────────────────┐
│       Vercel Web        │          │    Trigger.dev Cloud    │
│  - Next.js RSC & Pages  │          │  - Node 24 Workers      │
│  - Server Actions       │          │  - chat-agent tasks     │
│  - OAuth Handlers       │          │  - Lease recovery crons │
└─────────────────────────┘          └─────────────────────────┘
```

### 1. Deploy Web Application to Vercel
```bash
pnpm run build
vercel deploy --prod
```
- Ensure all environment variables from Section 2 are configured in the Vercel Project Settings.
- Sentry source maps are automatically generated and uploaded during `next build`.

### 2. Deploy Background Workers to Trigger.dev
```bash
npx trigger.dev@latest deploy
```
- Deploys the tasks defined in `trigger/` (`chat-agent`, `stop-sandbox-lease`, `recover-expired-sandbox-leases`) to Trigger.dev's managed Node 24 infrastructure.

---

## 6. Troubleshooting & Common Failure Modes

### Issue 1: "User is missing required paid plan" on Chat Start
- **Symptom:** User submits a prompt but receives an error dialog asking to upgrade.
- **Cause:** Clerk Billing has not synchronized subscription metadata, or user is on Free tier.
- **Fix:** Navigate to `/billing`, confirm Pro subscription status, and verify that feature flags `bots` and `sandboxes` are active in Clerk Dashboard.

### Issue 2: "Sandbox Lease Conflict / Limit Reached"
- **Symptom:** Error stating another sandbox lease is active or expired.
- **Cause:** A previous sandbox turn did not shut down cleanly, and the 1-minute recovery cron has not yet executed.
- **Fix:** Navigate to `/usage` and click "Stop My Sandbox" to invoke `stopActiveSandboxAction`, immediately resetting the `sandbox_leases` table.

### Issue 3: Stream Disconnects After Exactly 1 Hour
- **Symptom:** Long-running chat session suddenly terminates.
- **Cause:** The Trigger.dev Public Access Token (PAT) minted in `actions/chat.ts` has a strict 1-hour expiration.
- **Fix:** Refresh the browser page to mint a new token and resume viewing the conversation history.

### Issue 4: Neon Database Cold Start Timeout
- **Symptom:** First request after hours of inactivity experiences a 1–2 second delay.
- **Cause:** Neon compute endpoint auto-suspended to 0 vCPU to save costs.
- **Behavior:** Expected behavior; subsequent queries execute over HTTP in ~20ms once compute wakes.
