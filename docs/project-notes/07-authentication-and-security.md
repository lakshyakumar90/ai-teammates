# 07 — Authentication and Security

> Part of the AI Teammates project notes. Read after [06 — Database & Data Models](06-database-and-data-models.md).
> Maps directly to [README](README.md) and [`diagrams/authentication-flow.mmd`](diagrams/authentication-flow.mmd).

AI Teammates operates in a high-risk security domain: users supply personal AI API keys, and AI agents execute arbitrary shell commands and control desktop GUIs inside cloud containers. This document details the defense-in-depth security model protecting identity, secrets, compute, and user data.

---

## 1. Authentication Architecture

```text
Browser ──(HTTPS Request)──► [ proxy.ts: clerkMiddleware() ]
                                      │
                     ┌────────────────┴────────────────┐
                     ▼                                 ▼
           [ Public Route: / ]               [ Protected Route ]
           - Allowed immediately                     │
                                        (Valid Clerk Session Cookie?)
                                                     │
                                       ┌─────────────┴─────────────┐
                                       ▼                           ▼
                                  [ YES: Pass ]            [ NO: Redirect ]
                                       │                           │
                                       ▼                           ▼
                             [ Server Actions / RSC ]        [ /sign-in ]
```

### Identity Management: Clerk (`@clerk/nextjs`)
- **Authentication Handshake:** Handled via Clerk's hosted authentication engine, supporting email/password, social OAuth (Google, GitHub), and MFA.
- **Session Tokens:** Short-lived signed JWT session cookies transmitted exclusively with `HttpOnly`, `Secure`, and `SameSite=Lax` flags.
- **Edge Middleware (`proxy.ts`):** Next.js middleware executes `clerkMiddleware()` across all incoming requests:
  - Public routes: `/`, `/pricing`, `/sign-in/*`, `/sign-up/*`, and static assets.
  - Protected routes: `/(dashboard)/*`, `/(account)/*`, and internal API handlers.
  - Unauthenticated requests are immediately redirected to `/sign-in` with an HTTP 307.

---

## 2. Authorization & Entitlement Gating

Authentication confirms *who* the user is; authorization enforces *what* they can execute.

### Clerk Billing Entitlements
AI Teammates utilizes **Clerk Billing** with a mandatory Pro Tier ($9/month). Every compute-intensive operation verifies billing entitlements:
1. **Server Actions Gate:** `actions/chat.ts`, `actions/bot.ts`, and `actions/desktop.ts` execute `requireUserPaidPlan(userId)`.
2. **Feature Flags:** The billing plan must include `bots` and `sandboxes` entitlements.
3. **Trigger Worker Gate:** The Trigger.dev worker (`trigger/chat.ts`) independently verifies the user's active billing status before provisioning any Daytona sandbox or initiating model generation.

---

## 3. Secret Management & Personal API Keys (BYOK)

A foundational architectural invariant is that **no user API keys are stored in the application database**:

```text
┌─────────────────┐       ┌────────────────────────┐       ┌──────────────────────┐
│  Client Enters  │──────►│  actions/api-keys.ts   │──────►│  Vendor Test Call    │
│     API Key     │       │  saveApiKey()          │       │  (Gemini/OpenRouter) │
└─────────────────┘       └───────────┬────────────┘       └──────────┬───────────┘
                                      │                               │
                                (Valid Key?) ◄────────────────────────┘
                                      │
                                      ▼
                          ┌────────────────────────┐
                          │  Clerk privateMetadata │
                          │  (Encrypted at rest)   │
                          └────────────────────────┘
```

1. **Live Validation Before Save:** When a user enters a Gemini, OpenRouter, or OpenAI key, `lib/ai/provider-key-validation.ts` issues a zero-cost test request to the vendor. If rejected, the key is immediately discarded.
2. **Clerk `privateMetadata`:** Verified keys are saved to the user's `privateMetadata` in Clerk.
   - `privateMetadata` is **never exposed to client-side session tokens** or the browser.
   - Keys can only be read by server-side processes with the `CLERK_SECRET_KEY`.
3. **Decryption at Execution Time:** The Trigger.dev worker fetches the key via Clerk's backend SDK immediately before calling the model and holds it only in ephemeral worker memory for the duration of the turn.

---

## 4. OAuth Credential Encryption (ChatGPT Connections)

For users connecting ChatGPT Plus/Team via OAuth, tokens cannot be stored in Clerk metadata due to automated background token refresh loops.

### AES-256-GCM Encryption at Rest
- Tokens are stored in the `chatgpt_connections` table in Neon.
- The `credentials` column is encrypted using **AES-256-GCM** via `lib/connection-crypto.ts`.
- Encryption utilizes `CHATGPT_TOKEN_SECRET` (32-byte key) with a unique initialization vector (IV) and authentication tag per record.
- **PKCE State Hashes:** Ephemeral authorization codes are stored in `oauth_attempts` using SHA-256 hashed state tokens with a strict 10-minute time-to-live (TTL).

---

## 5. Daytona Cloud Sandbox Security & Isolation

Allowing AI models to execute shell commands (`bash`) and browse the web represents a high-risk security surface. AI Teammates prevents lateral movement through complete container virtualization:

```text
┌────────────────────────────────────────────────────────┐
│             Daytona Multi-Tenant Cluster               │
│                                                        │
│  ┌────────────────────────┐  ┌───────────────────────┐ │
│  │   Bot Sandbox (User A) │  │  Bot Sandbox (User B) │ │
│  │  - Isolated cgroup     │  │  - Isolated cgroup    │ │
│  │  - Max 2 vCPU          │  │  - Max 2 vCPU         │ │
│  │  - Max 4 GiB RAM       │  │  - Max 4 GiB RAM      │ │
│  │  - Max 10 GiB Disk     │  │  - Max 10 GiB Disk    │ │
│  │  - Ephemeral lifetime  │  │  - Ephemeral lifetime │ │
│  └────────────────────────┘  └───────────────────────┘ │
└────────────────────────────────────────────────────────┘
```

1. **Kernel-Level Sandboxing:** Sandboxes run in hardened Linux containers with dedicated cgroups, namespaces, and seccomp profiles.
2. **Hard Resource Limits:** Every sandbox is capped at:
   - $\le 2$ vCPUs.
   - $\le 4$ GiB RAM.
   - $\le 10$ GiB ephemeral disk.
3. **Network Isolation:** Sandboxes have no access to the application's internal Neon database, Vercel servers, or Clerk endpoints.
4. **Signed VNC Tokens:** The noVNC desktop stream is accessible only through time-limited cryptographic tokens generated by `lib/daytona-vnc.ts`.

---

## 6. Observability Privacy & PII Scrubbing (Sentry)

Logging error traces in an AI application risks capturing user prompts, private code, and API keys.

### Scrubbing Implementation (`lib/sentry-privacy.ts`)
- All Sentry events (Next.js server, client, and Trigger.dev worker) pass through `beforeSend` sanitization filters:
  - **Header Scrubbing:** Strips `authorization`, `cookie`, `x-api-key`, and `set-cookie`.
  - **Secret Redaction:** Regular expressions redact patterns matching `AIza*` (Gemini), `sk-or-*` (OpenRouter), and `sk-*` (OpenAI).
  - **Prompt Redaction:** Message payload bodies in error contexts are sanitized to prevent conversation leakage.

---

## 7. Threat Model & Control Matrix

| Threat | Attack Vector | Security Control | Verification |
|---|---|---|---|
| **Unauthorized Compute Abuse** | Attacker signs up for Free tier and invokes expensive Daytona sandboxes. | Clerk Billing check (`requireUserPaidPlan`) halts execution in Server Actions and Trigger worker. | `tests/billing-policy.test.mjs` |
| **API Key Theft via XSS** | Injected browser script attempts to steal stored Gemini/OpenRouter keys. | Keys are stored in Clerk `privateMetadata`, which is never sent to the browser DOM or session tokens. | Architecture invariant |
| **Sandbox Jailbreak / Fork Bomb** | Malicious bot command attempts CPU starvation or host escape. | Daytona cgroups enforce strict 2 vCPU / 4 GiB limits and seccomp isolation. | Daytona infrastructure |
| **Database Injection** | Attacker injects raw SQL through chat inputs or bot names. | Drizzle ORM uses parameterized queries exclusively; no raw string concatenation. | `lib/db/schema.ts` |
| **OAuth CSRF / State Hijacking** | Attacker intercepts ChatGPT OAuth return redirect. | `oauth_attempts` table stores SHA-256 hashed state parameters with 10-minute TTL. | `tests/chatgpt-routes.test.tsx` |
| **VNC Stream Snooping** | Third party attempts to view another user's live desktop. | Daytona issues authenticated, signed WebSocket URLs bound to active session leases. | `actions/desktop.ts` |
| **Concurrent Resource Exhaustion** | Multiple rapid requests launch dozens of parallel cloud sandboxes. | Neon PostgreSQL CAS updates on `sandbox_leases` enforce $\le 1$ running sandbox per user. | `lib/sandbox-usage.ts` |

---

## 8. Security Hardening & Trade-Offs

1. **`drizzle-kit push` vs. Formal Migrations:**
   - *Current trade-off:* Uses `db:push` for speed.
   - *Hardening recommendation:* Transition to committed migration files (`drizzle-kit generate`) before enterprise multi-region deployment.
2. **Sandbox Network Egress:**
   - *Current:* Sandboxes have standard outbound internet access to download npm packages and browse websites.
   - *Hardening recommendation:* Implement domain-whitelisting proxy to prevent bots from participating in DDoS attacks.
