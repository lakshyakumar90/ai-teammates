# 13 — Scalability and Performance

> Part of the AI Teammates project notes. Read after [12 — Build-From-Scratch Guide](12-build-from-scratch-guide.md).
> Maps directly to [README](README.md) and system architecture.

This document evaluates the scalability characteristics, performance optimizations, throughput bottlenecks, and scaling roadmap of the AI Teammates architecture.

---

## 1. Layer-by-Layer Scalability Analysis

```text
┌───────────────────────┐  Scales Horizontally (Stateless CDN / Serverless)
│      Vercel Web       │  - Zero memory state; bounded only by Vercel concurrency.
└──────────┬────────────┘
           │
┌──────────▼────────────┐  Scales Independently (Managed Worker Nodes)
│   Trigger.dev Worker  │  - Durable execution queues on Node 24; no web timeouts.
└──────────┬────────────┘
           │
┌──────────▼────────────┐  Scales via Compute Decoupling
│     Neon Postgres     │  - Auto-scaling vCPU; HTTP queries eliminate TCP socket limits.
└──────────┬────────────┘
           │
┌──────────▼────────────┐  PRIMARY BOTTLENECK (Stateful Linux Containers)
│   Daytona Sandboxes   │  - 5–15s container boot; cluster container density limits.
└───────────────────────┘
```

---

### Layer 1: Next.js Web Tier (Vercel)
- **Scalability Characteristic:** Completely stateless. Scales automatically to handle tens of thousands of concurrent requests across global edge regions.
- **Latency Profile:**
  - Landing and static assets: Served from global edge cache in $< 20$ms.
  - Server Actions (`actions/*.ts`): Execute in $50–150$ms. Because actions only validate billing, mint Trigger tokens, and return, they never hold open connections.
- **Bottlenecks:** Vercel function concurrency limits on lower-tier accounts; bundle size if server-only dependencies accidentally leak into client bundles.

### Layer 2: Background Worker Tier (Trigger.dev v4)
- **Scalability Characteristic:** Managed worker pool executing long-lived `chat.agent` turns.
- **Latency Profile:** Task dispatch to execution start takes $100–300$ms. Streaming deltas over SSE has sub-50ms latency to the client.
- **Bottlenecks:** Trigger.dev concurrent task execution limits on free/pro tiers. Under high surge traffic, turns are queued rather than dropped.

### Layer 3: Database Tier (Neon PostgreSQL)
- **Scalability Characteristic:** Auto-scaling serverless compute with decoupled storage.
- **Latency Profile:**
  - Warm HTTP query latency: $\sim 20–35$ms.
  - Cold compute resume latency: $1–2$ seconds if Neon has scaled to 0 vCPU after inactivity.
- **Throughput Advantage:** The `@neondatabase/serverless` HTTP driver eliminates TCP connection pool exhaustion entirely. 5,000 serverless actions can query the database concurrently without exhausting socket limits.

### Layer 4: Container Sandbox Tier (Daytona) — Primary System Bottleneck
- **Scalability Characteristic:** Highly stateful compute containers running Ubuntu, X11 desktop, and noVNC servers.
- **Provisioning Latency:**
  - Warm/Running sandbox: Instant execution ($< 10$ms).
  - Cold container boot: $5–15$ seconds to allocate cgroup, boot kernel, and verify noVNC port availability.
- **Density Constraints:** Each container reserves up to 2 vCPU and 4 GiB RAM. A single Daytona host machine can only run 20–50 concurrent active sandboxes before memory saturation.

### Layer 5: External API Tier & Clerk Rate Limits
- **BYOK AI Models:** Because users supply their own API keys, AI model rate limits (RPM/TPM) are isolated per user. One user exhausting their Gemini quota does not impact any other user.
- **Clerk Management API:** Reading `privateMetadata` on every turn invokes Clerk's backend API. Under high concurrent volume, Clerk API rate limits (e.g., 20 requests/second on standard plans) could become a bottleneck without caching.

---

## 2. Implemented Performance Optimizations

1. **Decoupled Asynchronous Streaming:** Offloading agent loops to Trigger.dev prevents expensive Vercel serverless execution fees and eliminates gateway timeouts.
2. **Stateless HTTP Database Driver:** Using `@neondatabase/serverless` eliminates connection handshake latencies (saving $\sim 150$ms per request) and bypasses PgBouncer limits.
3. **Atomic Compare-And-Swap (CAS) Leasing:** Eliminates the operational latency and maintenance cost of dedicated Redis distributed locks by executing atomic SQL updates directly in PostgreSQL.
4. **Delayed 5-Minute Sandbox Lease Shutdown:** Instead of shutting down the container immediately after a turn (which would force a 10s cold start on the user's next message), the system keeps the sandbox warm for 5 minutes.
5. **Selective Memory Synthesis:** `lib/ai/memory-manager.ts` fetches and injects only validated, privacy-permitted memory records into the system prompt, keeping token payload size minimal.

---

## 3. High-Scale Architectural Roadmap (100k DAU)

If AI Teammates scales to 100,000 daily active users, the following architectural upgrades would be implemented:

```text
┌────────────────────────────────────────────────────────────────────────┐
│                        Scale Target: 100,000 DAU                       │
├────────────────────────────────┬───────────────────────────────────────┤
│ Bottleneck                     │ Architectural Solution                │
├────────────────────────────────┼───────────────────────────────────────┤
│ Daytona Sandbox Cold Starts    │ Pre-warmed container pool (hot standby│
│ (5–15s delay on initial turn)  │ containers pre-initialized with image)│
├────────────────────────────────┼───────────────────────────────────────┤
│ Clerk API Rate Limits on Keys  │ AES-256 encrypted keys in Neon DB     │
│ (20 req/s threshold)           │ cached in AWS ElastiCache Redis (1h)  │
├────────────────────────────────┼───────────────────────────────────────┤
│ noVNC WebSocket Bandwidth      │ Upgrade from RFB over WebSockets to   │
│ (High bandwidth per viewer)    │ WebRTC video encoding (H.264/VP9)     │
├────────────────────────────────┼───────────────────────────────────────┤
│ Repetitive Prompt Tokens       │ Enable LLM prompt prefix caching      │
│ (Large bot instructions)       │ (supported in Gemini 2.5 and Claude)  │
└────────────────────────────────┴───────────────────────────────────────┘
```
