# 16 — Improvements Playbook: What To Build, How To Build It, And How To Defend It

> Part of the AI Teammates project notes. Companion to [14 — Improvements & Technical Debt](14-improvements-and-technical-debt.md) and [13 — Scalability & Performance](13-scalability-and-performance.md).
> This file is written for two moments: when you sit down to implement, and when an interviewer asks *"So what would you improve, and why haven't you done it yet?"*

Every improvement below follows the same structure:

1. **What & why** — the problem, where it lives in the code (evidence), who feels it.
2. **How to implement it** — concrete steps, files to touch, commands, effort, risks. Nothing here is vague.
3. **Pros / Cons** — the trade-offs you accept by doing it.
4. **Interview script** — a 30–60 second simple answer, a technical deep-dive, the follow-up "why didn't you implement it?", and the follow-ups after that.

---

## How to read this file (and how to answer "why didn't you implement it?")

A good interview answer to *"why didn't you implement it?"* never sounds like an excuse. It follows a three-part frame:

1. **Scope sequencing** — *"We had to ship the core loop first: auth → billing → chat → sandbox. CI and migrations are what you add the week after you have paying users, not before."*
2. **Cost/risk asymmetry** — *"The benefit is real but the failure mode is worse than the status quo. `db:push` can drop a column silently; migrations can lock a table in production. The safe version needs a staging branch and a rollback drill, which is a sprint, not an afternoon."*
3. **Explicit deferral** — *"We documented it as known debt with an owner and a trigger condition — e.g. 'adopt when the second engineer joins' — rather than pretending it didn't exist."*

If you can name the **trigger condition** that would make you implement it today, you sound senior. If you just say "I didn't have time," you sound like you don't prioritize.

---

## Roadmap at a glance

| # | Improvement | Type | Effort | Priority |
|---|---|---|---|---|
| 1 | GitHub Actions CI (typecheck, lint, tests, build) | Quality gate | 1–2 days | **Do first** |
| 2 | Committed Drizzle migrations (replace `db:push`) | Data safety | 3–5 days + staging drill | **Do first** |
| 3 | Startup env validation (fail-fast, typed) | Reliability | ~1 day | Quick win |
| 4 | Rate limiting + security headers (CSP/HSTS/etc.) | Security | 1–2 days | Quick win |
| 5 | Move/stop polling provider keys from Clerk metadata (encrypted Neon table or cache) | Scale/cost | 1–2 weeks | Medium |
| 6 | Clerk webhooks for billing events (stop per-turn polling) | Scale/cost | 3–5 days | Medium |
| 7 | Prompt prefix caching (Gemini context caching) | Cost/latency | 2–4 days | Medium |
| 8 | Semantic memory (embeddings + `pgvector`) | Product quality | 2–3 weeks | Long term |
| 9 | Unified test runner + coverage gate + Playwright e2e | Quality | 1–2 weeks | Medium |
| 10 | Hosted ChatGPT OAuth in production (OpenAI approval) | Product/compliance | External dependency | Blocked |
| 11 | Sandbox egress filtering + key rotation | Security | 1 week | Medium |
| 12 | WebRTC desktop streaming (replace raw noVNC) | UX/bandwidth | 2–4 weeks | Long term |

**Suggested order of attack:** 1 → 2 → 3 → 4 (one "production hardening" sprint), then 5/6/7 (one "scale & cost" sprint), then 8/9/12 as product grows.

---

## 1. GitHub Actions CI

### What & why

**Problem:** There is no `.github/workflows/` directory in the repo. Quality gates (`typecheck` = `tsc --noEmit`, `lint`, `test:ui` = `vitest run`, plus the `node:test` suites, plus `next build`) run only if a human remembers to run them. A red commit can be pushed and Vercel will happily build it.

**Who feels it:** Every future contributor, and you during any demo — a broken `main` discovered at deploy time instead of at PR time.

### How to implement it

1. Add `package.json` scripts if they don't exist (see [10 — Development & Deployment](10-development-and-deployment-guide.md)): you will need a `check` (typecheck + lint), a `test` that runs both runners, and a `build`. Example:
   ```json
   "check": "tsc --noEmit && eslint .",
   "test": "vitest run && node --test tests/",
   "test:node": "node --test tests/"
   ```
   Note: the four integration suites (`usage-integration`, `worker-usage-integration`, `chatgpt-integration`, `community-chatgpt-integration`) need a live `DATABASE_URL`. In CI either (a) run only the hermetic suites, or (b) provide a Neon branch URL via secrets and run all of them against a throwaway branch with `neon checkout`. Start with (a), add (b) later.
2. Create `.github/workflows/ci.yml`:
   ```yaml
   name: CI
   on: [push, pull_request]
   jobs:
     verify:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v4
         - uses: pnpm/action-setup@v3
         - uses: actions/setup-node@v4
           with: { node-version: 24, cache: pnpm }
         - run: pnpm install --frozen-lockfile
         - run: pnpm check
         - run: pnpm lint
         - run: pnpm test:ui
         - run: pnpm test:node
         - run: pnpm build
   ```
   Set dummy env vars (`DATABASE_URL=postgresql://...`, `CLERK_SECRET_KEY=...`) so `next build` doesn't fail on import-time throws (`lib/db/client.ts` throws if `DATABASE_URL` is missing). Use a CI-only dummy URL — the build doesn't connect.
3. Add branch protection on `main`: require the `verify` check to pass before merge.

**Effort:** 1–2 days (half of it is making the build pass with dummy env). **Risk:** low.

### Pros / Cons

| Pros | Cons |
|---|---|
| Red commits become impossible; PRs get automatic signal | Small CI minutes cost (free tier is fine at this scale) |
| Makes the two test runners discoverable instead of tribal knowledge | You must keep the CI config in sync with local scripts |
| Interview gold: "we added CI after noticing no gate existed" is a great story | Doesn't fix tests that need a live DB unless you add Neon branches |

### Interview script

- **30–60s simple answer:** *"The repo has no CI — quality gates are manual. That's my first fix: a GitHub Actions workflow on every PR running typecheck, lint, both test suites, and a production build with dummy env vars, plus branch protection so nothing merges red. It's unglamorous, but it's the change that makes every other improvement safe to attempt."*
- **Deep dive:** Explain the dummy-env trick (import-time throws in `lib/db/client.ts`), Node 24 matching the Trigger runtime, `--frozen-lockfile` for reproducibility, and why the DB-backed suites start excluded with a Neon-branch plan rather than being skipped forever.
- **"Why didn't you implement it?"** — *"Sequencing. The product went from zero to a working chat loop with billing and sandboxes; the binding constraint was getting the core user journey real. CI is the first thing you add once you have more than one contributor or paying users — and in fact the trigger condition I'd set is exactly that: second engineer or first paying customer, whichever comes first. Until then, the manual pre-deploy checklist in `DEPLOYMENT.md` was the gate."*
- **Follow-up: "Would you block deploys on tests?"** — *"Yes for typecheck/lint/build, and for the hermetic suites. The four DB integration suites I'd initially run non-blocking against a Neon branch, then promote to blocking once they're stable, because a flaky blocking test trains people to bypass CI — which is worse than no CI."*

---

## 2. Committed Drizzle migrations (replace `db:push`)

### What & why

**Problem:** `package.json` has `db:push: drizzle-kit push`. There is no `migrations/` or `drizzle/` directory with committed SQL. Schema changes are applied by diffing the TypeScript schema against the live database and mutating it in place. That is fine for one developer on a dev branch; it is dangerous the moment production has data you care about: a renamed field can look like a column drop, and a long-running change can lock a table with no rollback story.

### How to implement it

1. Run `pnpm db:generate` once to produce the baseline migration from the current schema; commit the SQL under `drizzle/` (the folder `drizzle.config.ts` already points at via `out: "./drizzle"` — it was planned, just never populated).
2. Switch the workflow: `pnpm db:generate` on every schema change, review the generated SQL like code, commit it with the schema change.
3. Production application: apply migrations as an explicit release step (`pnpm db:migrate` against the production `DATABASE_URL_UNPOOLED`) *before* the Vercel deploy, or fold it into a one-off Trigger task. Never auto-migrate on app boot.
4. Rehearse a rollback: `drizzle-kit check` and a manual downgrade in a Neon branch. Neon branches make this cheap — every branch is a copy-on-write snapshot.
5. Keep `db:push` documented for local dev only, with a comment in `drizzle.config.ts` saying so.

**Effort:** 3–5 days including the rehearsal and the "first real migration" on a branch. **Risk:** medium — the risk is in the transition, not the end state.

### Pros / Cons

| Pros | Cons |
|---|---|
| Reviewable, versioned, reproducible schema history; `git log` == schema history | Slower than `push` for throwaway schema experiments |
| Safe production deploys with explicit apply step and rollback | You must maintain migration discipline (no editing an applied migration) |
| Neon branches make migration testing nearly free | One more concept for contributors to learn |

### Interview script

- **30–60s simple answer:** *"Today schema changes go through `drizzle-kit push`, which diffs TypeScript against the live DB. That's perfect for a single-dev pre-production app, but there's no reviewable history and a rename can silently drop data. The fix is committed migrations: `db:generate`, review the SQL, apply explicitly at release time after testing on a Neon branch. I'd keep `push` for local development only."*
- **Deep dive:** Why explicit-apply beats boot-time migration (you control the deploy order and can freeze writes), how the `DATABASE_URL`/`DATABASE_URL_UNPOOLED` split already supports this, and how Neon copy-on-write branches turn "test your migration" into a one-command operation.
- **"Why didn't you implement it?"** — *"Two reasons. One, there was effectively one environment and one developer; the cost of the safer workflow (review steps, rehearsal) exceeded the risk it removed. Two — and more important — the AGENTS.md data policy says this is a development project where data is disposable and `db:push` clean slates are accepted. The moment we take real user data in production, that's the trigger: switch before the first production migration matters."*
- **Follow-up: "Migrations vs `db:push` — isn't Drizzle's whole pitch fast iteration?"** — *"Yes, and push stays in my local loop. The distinction is dev vs prod: push for speed where data loss is fine, migrations for anything with users. Plenty of teams do exactly this split."*

---

## 3. Startup env validation

### What & why

**Problem:** There is no env-validation module (`lib/env*` doesn't exist). `lib/db/client.ts` throws if `DATABASE_URL` is missing, `drizzle.config.ts` throws if `DATABASE_URL_UNPOOLED` is missing, `CONNECTION_ENCRYPTION_KEY` is checked deep inside crypto helpers, and `OLLAMA_SUPPORTS_IMAGES` is documented in the README but never read by code. Misconfiguration surfaces as a stack trace at the first request instead of a clear error at boot.

### How to implement it

1. Add a validated env module (e.g. `lib/env.ts`) using `zod` (already a dependency) or `@t3-oss/env-nextjs`. Define a schema: required vs optional, types, defaults (`DAYTONA_API_URL` fallback chain lives here).
2. Import it at the top of `lib/db/client.ts` and other early modules so the process fails at startup with a readable message: `DATABASE_URL is required (Neon connection string)`.
3. Export typed access (e.g. `env.DAYTONA_API_URL`) and replace direct `process.env.*` reads over time.
4. Add a `pnpm check:env` that loads `.env.local` and validates only, so you can run it in CI without booting Next.

**Effort:** ~1 day for the schema + the two current throw sites; a few days to migrate all call sites. **Risk:** low — but fail-fast means a bad deploy fails loudly, which is the point.

### Pros / Cons

| Pros | Cons |
|---|---|
| Boot failures become one clear line, not a Drizzle stack trace | A missing optional var can block startup if the schema is too strict |
| Typed env access ends `process.env.X!` non-null assertions | One more convention to teach contributors |
| Documentation-by-schema: the schema *is* the env reference | — |

### Interview script

- **30–60s simple answer:** *"There's no env validation today — two modules throw if their var is missing, everything else fails at first use. I'd add one `lib/env.ts` with a Zod schema imported at startup so misconfiguration fails fast with a readable message, and the schema doubles as the env reference doc."*
- **Deep dive:** Which vars are truly required vs optional, the `DAYTONA_API_URL → DAYTONA_SERVER_URL → app.daytona.io` fallback chain, and why validation belongs in a module imported before connections are made, not scattered at call sites.
- **"Why didn't you implement it?"** — *"Honestly this one I would have done earlier — it's a day of work. The reason it lagged is that the two truly fatal vars already fail fast at import time, so nothing was silently broken; the gap was error quality and the un-read `OLLAMA_SUPPORTS_IMAGES` variable. It's a quick win I'd do in the same sprint as CI."*
- **Follow-up: "Zod or a library like `@t3-oss/env`?"** — *"Zod, because it's already in the tree and the schema is only ~25 vars. I'd reach for `@t3-oss/env-nextjs` if I needed client/server env splitting — here `NEXT_PUBLIC_*` is only Clerk, so it's overkill."*

---

## 4. Rate limiting + security headers

### What & why

**Problems:**
- **No rate limiting** on sign-in retries, API key saves, or chat turns. A user (or an attacker with a stolen session) can hammer `saveApiKey` (which makes a live provider call), the community ChatGPT connect endpoint, or turn initiation. The only throttles today are AI timeouts and step caps.
- **No security headers** — `next.config.ts` sets only `devIndicators: false` and wraps with Sentry. No CSP, no HSTS, no `X-Frame-Options`/frame-ancestors — meaning the app can be iframed by any origin (clickjacking), and script injection has no second line of defense. (The community route already does careful Origin checks and 45,000-byte body caps — the pattern exists but isn't complete.)

### How to implement it

**Headers** (half a day) — in `next.config.ts`:
```ts
async headers() {
  return [{
    source: "/(.*)",
    headers: [
      { key: "Content-Security-Policy", value: "default-src 'self'; frame-ancestors 'none'; ..." },
      { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    ],
  }]
}
```
CSP needs care: Clerk and Vercel inject scripts, and Sentry Replay needs `connect-src`. Start with `frame-ancestors 'none'` + HSTS + nosniff (zero-risk), then add CSP in `report-only` mode, fix violations, then enforce.

**Rate limiting** (1–2 days) — options:
- **Upstash Redis** (`@upstash/ratelimit`) — serverless-friendly, no infra to run. Limit by userId/IP on: sign-in-adjacent actions, `saveApiKey`, chat session start, ChatGPT connect/disconnect.
- Or Clerk's built-in protections for auth endpoints (free, no code) + a simple in-DB counter for the AI actions (a `rate_limit_buckets` table updated with the same CAS pattern already used in `lib/usage.ts`).

**Effort:** headers 0.5 day; Upstash limiting 1–2 days. **Risk:** low for headers (staged), medium for limiting (a wrong limit can lock out real users — always apply per-user first, with a visible upgrade path).

### Pros / Cons

| Pros | Cons |
|---|---|
| Closes real abuse paths (key-save hammering, turn spam, clickjacking) | Rate limits create a new failure mode: false positives |
| Headers are cheap, mostly zero-risk | CSP needs iteration against Clerk/Sentry/Vercel inlines |
| Upstash = no infra to babysit | Redis adds a third-party dependency and a network hop |

### Interview script

- **30–60s simple answer:** *"Two gaps: no rate limiting and no security headers. I'd add HSTS, frame-ancestors, and nosniff first since they're free of risk, then CSP in report-only mode before enforcing, and Upstash Redis rate limits on the expensive endpoints — `saveApiKey` and chat turn start, keyed by user."*
- **Deep dive:** Why the community OAuth route is already the template (Origin check, 45 KB body cap, timing-safe state comparison), why CSP must be staged because Clerk Vercel and Sentry Replay inject scripts, and why per-user limits beat global limits for a BYOK app (your cost is the user's provider account, not yours — but your worker still pays).
- **"Why didn't you implement it?"** — *"Headers: because CSP against Clerk's injected scripts is fiddly and low-priority while the product was pre-launch — the zero-risk headers (HSTS, frame-ancestors) are the part I should have shipped immediately. Rate limiting: because on a BYOK model, the expensive resource is the user's own API key, which already has provider-side limits; the app-side cost is worker compute, which the 20-hour sandbox cap and paid-plan gates already bound. The abuse that still matters — credential stuffing sign-in retries — is Clerk's responsibility. The trigger to add app-level limiting: public abuse signals (unexpected worker spend) or a free tier."*
- **Follow-up: "Isn't no rate limiting a security hole?"** — *"It's a cost hole more than a data hole: every sensitive path is already ownership-checked and plan-gated, so an attacker can only spend their own money and your worker minutes. Worker spend is bounded by the paid plan and the sandbox-hour cap. That's why I rank it below headers and CI."*

---

## 5. Stop polling Clerk for provider keys (encrypted storage or cache)

### What & why

**Problem:** `trigger/chat.ts` calls `clerkClient().users.getUser(userId)` to read `privateMetadata.providerApiKeys` on every chat turn (and again inside `meteredModel` wrappers per generate/stream call). Clerk Management API has rate limits; a burst of concurrent turns can 429 and fail chats. It also means a user's Gemini key lives in Clerk's metadata, which is a fine store but not one you can query, index, or audit efficiently.

### How to implement it

**Option A — encrypted Neon table (recommended long term):**
1. New table `user_provider_keys(user_id PK, provider, ciphertext, updated_at)` — ciphertext is AES-256-GCM with AAD = userId, reusing `lib/connection-crypto.ts` exactly like `chatgpt_connections.credentials` (already proven in the codebase).
2. `saveApiKey` / `removeApiKey` write to both stores during a transition, then read from the table; migrate existing users lazily on next turn (read Clerk, encrypt, write, then stop reading Clerk).
3. Worker reads become a single indexed Postgres lookup — no external API, no rate limit.

**Option B — cache (faster, scrappier):** Upstash Redis cache keyed `apikeys:{userId}` with a short TTL (e.g. 60s) + invalidation on save/remove. Keeps Clerk as source of truth.

**Effort:** Option A ~1–2 weeks (migration + backfill + cutover). Option B ~2–3 days. **Risk:** medium for A (key material handling); low for B (staleness window).

### Pros / Cons

| Pros | Cons |
|---|---|
| A: Removes the Clerk rate-limit ceiling; keys become queryable/auditable; one less external dependency in the hot path | A: You now custody live provider keys — rotation, audit, and breach implications are yours; the codebase already does this for OAuth tokens, but provider keys are more sensitive |
| A: Works offline of Clerk for the worker | A: Migration/backfill must be careful not to lose keys |
| B: Fast, reversible, no custody change | B: TTL staleness (a removed key works for ≤60s); still a network hop and a new vendor |

### Interview script

- **30–60s simple answer:** *"Every chat turn reads the user's API key from Clerk private metadata through the Management API, which is rate-limited and in the hot path. The fix I'd actually ship is an encrypted table in Neon — same AES-GCM pattern we already use for ChatGPT OAuth credentials — with a lazy migration off Clerk. Short term, a 60-second Redis cache buys the same headroom with less custody risk."*
- **Deep dive:** How `lib/connection-crypto.ts` already does owner-bound AES-256-GCM, why the lazy backfill (read Clerk → encrypt → write → flip flag) avoids a flag day, and the exact Clerk limit you're avoiding.
- **"Why didn't you implement it?"** — *"Custody is the honest answer. Today keys live with Clerk; the moment I store them encrypted in my own DB, I own rotation, audit, and the blast radius of a leak. Doing that properly — key versioning, access audit log — is a week of careful work, and the Clerk limit only bites at concurrency the product hasn't reached yet. Storing keys in Clerk was a deliberate 'borrow the vault until scale forces the question' decision. The trigger: sustained 429s, or a compliance requirement (SOC 2 customers will ask exactly this)."*
- **Follow-up: "Isn't per-turn Clerk reads also a latency problem?"** — *"Yes — that's the cheaper argument for the cache option. A turn already makes several Clerk calls (billing check + key fetch); caching billing status per turn is the smallest change with the biggest latency win."*

---

## 6. Clerk webhooks for billing (stop per-turn polling)

### What & why

**Problem:** The paid-plan check runs constantly: `getPaidAccessError()` in server actions, `requireUserPaidPlan()` at the top of `chatAgent.run()`, and again inside every `wrapGenerate`/`wrapStream` in the `meteredModel` middleware. Each check is a Clerk Billing API call. That's correct for security (never trust a cached plan for a paid action) but it's N API calls per turn, and it means a subscription change takes effect only on the next call — there's no pushed state.

### How to implement it

1. Add a Clerk webhook route (`app/api/webhooks/clerk/route.ts`) handling `subscription.updated` / `subscription.deleted` (verify with Svix — Clerk signs webhooks).
2. Mirror the minimal entitlement state into Neon (e.g. extend `usage_periods` generation or a `billing_status` table: `{userId, hasPro, periodEndsAt, updatedAt}`).
3. Keep the *live* Clerk check for the first action after a webhook gap (defense in depth), but let the common path read the mirror with a freshness check (e.g. mirror age < 5 min, else refresh live).
4. Add a reconciler: the existing `recover-expired-sandbox-leases` cron pattern is the template — a scheduled task that re-syncs anyone whose mirror is stale.

**Effort:** 3–5 days including Svix verification and the reconciler. **Risk:** medium — a missed webhook must never silently extend or revoke access; the reconciler is what makes it safe.

### Pros / Cons

| Pros | Cons |
|---|---|
| Turns per-turn API calls into a local row read; removes a Clerk-outage failure mode from chat | Webhooks are eventually-consistent; you must design for missed/duplicate events |
| Subscription changes take effect in seconds, not at next turn | Svix verification + idempotency is new surface area |
| Cheaper at scale | A mirror that's wrong is a billing bug — reconciler is mandatory, not optional |

### Interview script

- **30–60s simple answer:** *"We check the live Clerk subscription on every model call — correct, but it's an API call in the hot path. I'd add a Clerk webhook that mirrors entitlement into Postgres, with the live check kept as a freshness backstop and a scheduled reconciler for missed events."*
- **Deep dive:** Why you can't just trust the mirror (missed webhook = someone keeps access after canceling), how the existing per-minute recovery cron is the exact pattern for the reconciler, and how Svix signing prevents forged entitlement updates.
- **"Why didn't you implement it?"** — *"Because the live check is the safe default and the volume didn't justify the machinery. Every check is correct today; the problem is cost and latency at scale, which is a 'have users' problem, not a 'build the product' problem. I'd also rather ship the webhook mirror when I can spend the week on the reconciler and failure testing, not as a shortcut."*
- **Follow-up: "Would you remove the live check once the mirror exists?"** — *"No. The live check stays as the backstop for stale mirrors — same reason `meteredModel` re-checks per call. Defense in depth on money paths is cheap insurance; the mirror is an optimization, not a replacement."*

---

## 7. Prompt prefix caching

### What & why

**Problem:** `trigger/chat.ts` re-assembles the system prompt — bot instructions, formatting rules, and the memory block — on every turn. In a long group chat, 2–5k tokens of largely static prefix are resent at full price and full latency on every message.

### How to implement it

1. Gemini supports **context caching** and OpenAI supports **automatic prompt caching** for repeated prefixes. The AI SDK passes provider options through — confirm per provider: `google: { cachedContent }` / OpenRouter cache directives / OpenAI's automatic prefix caching (no code needed, but minimum token thresholds apply).
2. Split the system prompt into a stable prefix (bot instructions + rules) and a variable suffix (memory snapshot + preferences). Cache keys depend on the prefix staying byte-identical — so stop re-serializing it with timestamps or per-turn JSON above the stable part.
3. Measure: log `cachedInputTokens` from usage metadata (the `usage_entries.input_tokens` columns already exist in the schema — currently unused, which makes this measurable from day one).

**Effort:** 2–4 days (mostly prompt restructuring + measuring). **Risk:** low — caching is transparent; worst case you pay what you pay today.

### Pros / Cons

| Pros | Cons |
|---|---|
| Up to ~75–90% discount on the cached prefix on some providers; lower TTFT | Provider-specific behavior; Google context caching has its own lifecycle/API |
| Directly reduces users' token spend (they pay their own keys) | Minimum-cache thresholds mean short chats see no benefit |
| The schema already has the columns to prove it | Prefix must be byte-stable — constrains prompt tinkering |

### Interview script

- **30–60s simple answer:** *"The system prompt is rebuilt every turn and it's mostly static. Since users pay for their own keys, caching the stable prefix is a direct cost save for them — I'd split the prompt into a byte-stable cached prefix and a variable suffix, and verify with the input-token columns that already exist unused in our schema."*
- **Deep dive:** Which providers cache automatically vs need an explicit cached-content object, why byte-stability matters (any per-turn edit above the prefix invalidates), and how `minCachedTokens` thresholds change the math for short chats.
- **"Why didn't you implement it?"** — *"Because the savings show up after conversations get long, and early usage didn't have long conversations. The prompt was still being tuned — caching a prompt you're editing weekly is churn. The trigger is average tokens-per-turn crossing the provider's cache threshold, which the unused token columns let me measure exactly."*

---

## 8. Semantic memory (embeddings + `pgvector`)

### What & why

**Problem:** Memory capture (`lib/ai/memory-capture.ts`) is extractive and grounded — a fact is only saved if its evidence appears verbatim in the user's last message. Recall is a keyword problem: the bot remembers `home_city: Pune` if you said it, but it can't find "that place I mentioned last week" semantically. `~/MEMORY.md` in the sandbox is a flat file — fine at 20 facts, noisy at 200.

### How to implement it

1. Enable `pgvector` on the Neon database (it's a supported extension — no new vendor).
2. New table `memory_embeddings(memory_ref, embedding vector(1536), updated_at)`; on `memory.remember()`, embed the fact (small model — e.g. Gemini `text-embedding-004` via the user's own key) and upsert.
3. Retrieval: at prompt build time, embed the latest user message, cosine-similarity search top-k facts, inject those instead of (or in addition to) the full memory dump. Keep the grounded-extraction write path as-is (it's the trust boundary).
4. Backfill lazily on read; delete embeddings when a fact is `[forgotten]`.

**Effort:** 2–3 weeks including evaluation (you need a small eval set of "did it recall the right thing" examples or you'll never know if it helped). **Risk:** medium — embeddings in the recall path can surface irrelevant or private facts in the wrong scope; scope partitioning (global/group/bot) must be part of the index, not an afterthought.

### Pros / Cons

| Pros | Cons |
|---|---|
| Recall quality jumps for large/long-lived memories | New cost: an embedding call per fact + per turn |
| `pgvector` keeps it in the existing database — no new infra | Evaluation burden: without a test set you're guessing |
| Reduces prompt size (top-k beats full dump) | Scope leaks across global/group/bot are a privacy bug class |

### Interview script

- **30–60s simple answer:** *"Memory today is exact-match grounded extraction — trustworthy but shallow. At scale I'd add embeddings with pgvector on Neon, keep the grounded write path as the trust boundary, and retrieve top-k by similarity per scope, with a small recall eval set so I can prove it helps."*
- **Deep dive:** Why writes stay extractive (grounding prevents confabulation), why scope must be in the index predicate, the lazy backfill, and how the eval set is built from real conversations.
- **"Why didn't you implement it?"** — *"Because with tens of facts per user, exact recall is already near-perfect and embeddings add a failure mode (wrong-scope recall) plus an eval burden. Semantic search is the answer to a problem the product doesn't have yet — the trigger is memory size per user, roughly when top-k stops being 'everything'."*
- **Follow-up: "Why not just put everything in the prompt?"** — *"Context is finite and paid per token by the user. Top-k retrieval is both cheaper and more accurate once memory grows — that's the scaling crossover."*

---

## 9. Unified test runner, coverage gate, and e2e tests

### What & why

**Problems:**
- Two frameworks: Vitest for `tests/*.test.tsx` (7 files) and `node:test` for 22 `.ts`/`.mjs` files — two commands, two assertion styles, one tribal-knowledge bundle.
- No coverage measurement at all (`coverage/` is gitignored but no reporter exists anywhere).
- No end-to-end test: nothing drives the real journey (sign in → create bot → chat turn) without a human.

### How to implement it

1. **Unify:** Vitest `projects` config — a `ui` project (jsdom, `.test.tsx`) and a `node` project (node env, `.test.mjs`/`.test.ts`) — one `pnpm test` runs all 29 suites. Keep the good parts: `MockLanguageModelV4` from `ai/test`, fetch stubbing with `*.neon.tech` pass-through.
2. **Coverage:** `vitest run --coverage` with v8 provider; start with a *ratchet*, not a target: `--coverage.thresholds.lines=40` (or whatever the baseline is), then raise it 5 points per quarter. A coverage gate that starts at 90% gets disabled in a week.
3. **E2E:** Playwright with the existing `verify-chat-runtime` task as the spirit guide — run it in CI against a Neon branch + Clerk test instance; one golden path only: sign in → create bot → send a message → assert a reply streams. Mock the provider at the HTTP layer (stub fetch) so e2e doesn't spend real API credits.

**Effort:** unification 2–3 days; coverage ratchet 1 day; Playwright e2e 1–2 weeks (mostly environment plumbing). **Risk:** low for 1–2; medium for 3 (flaky e2e is worse than none — hence exactly one golden path, well isolated).

### Pros / Cons

| Pros | Cons |
|---|---|
| One command, one mental model; coverage ratchet makes the quality trend visible | Vitest projects are a newer API — docs are thinner |
| E2E catches the "works on my machine" class of bugs that unit tests can't | E2E needs seeded Clerk/Neon environments — real plumbing work |
| The existing test quality is high; this scales it | Diminishing returns if the ratchet is set too aggressively |

### Interview script

- **30–60s simple answer:** *"We have 29 good tests split across two runners and no coverage number and no e2e. I'd unify them under Vitest projects so one command runs everything, add a coverage ratchet that only ever goes up, and one Playwright golden-path test with the provider stubbed so it costs nothing."*
- **Deep dive:** Why a ratchet instead of a target, why e2e must stub the provider (cost + determinism), and how `MockLanguageModelV4` is the existing pattern to extend.
- **"Why didn't you implement it?"** — *"The split happened organically — Vitest for component tests because that's where React Testing Library lives, node:test because the backend tests are pure logic and don't want a bundler. Unifying is refactor with no user-visible payoff, so it comes after CI (which makes the split visible and annoying enough to fix). E2E was deferred because I didn't have disposable Clerk/Neon environments yet — a flaky e2e suite is net-negative, so the trigger was getting the test environments, not writing the test."*
- **Follow-up: "What coverage number would you set?"** — *"Whatever the baseline measures, minus nothing — the point of a ratchet is it starts at reality and only moves up. The more useful number I'd gate on is change coverage: new code can't drop the total."*

---

## 10. Hosted ChatGPT OAuth in production

### What & why

**Problem:** `lib/chatgpt.ts` implements the hosted ChatGPT OAuth flow (PKCE S256, `jose` JWKS verification, encrypted owner-bound credentials) but it's env-gated off — `chatGPTEnabled()` requires `CHATGPT_HOSTED_ENABLED === "true"` and that variable is deliberately unset. Users get the experimental community flow (`lib/community-chatgpt.ts`, `@openai-oauth/*`) instead, which carries revocation risk.

### How to implement it

1. Submit to OpenAI's OAuth application review (the blocker — this is a process, not code).
2. Set `CHATGPT_HOSTED_ENABLED=true` plus `CHATGPT_CLIENT_ID`, `CHATGPT_CLIENT_SECRET`, `CHATGPT_REDIRECT_URI` in Vercel + Trigger `syncEnvVars`.
3. Run the five live acceptance checks from `CHATGPT_SETUP.md` against production.
4. Prefer the hosted connection in `userModelOptions` ordering (it already does — hosted wins when enabled and connected).

**Effort:** code is done; the effort is the external review (weeks, unpredictable). **Risk:** low once approved; compliance surface (Google's "risky" OAuth patterns, FedRAMP notes in the community flow docs) is the thing to handle carefully.

### Pros / Cons

| Pros | Cons |
|---|---|
| Supported, stable connection; no experimental revocation risk | Blocked on an external approval you don't control |
| Cleaner UX (no browser extension dance) | New attack surface: real OAuth client credentials, redirect URI hygiene |
| Code already exists and is tested | Approval can demand changes (branding, verification, privacy policy) |

### Interview script

- **30–60s simple answer:** *"The hosted OAuth flow is fully implemented — PKCE, JWKS verification, encrypted storage — and gated off by an env flag because it needs OpenAI's application approval. The community flow is the interim. Turning it on is a config change the day approval lands."*
- **Deep dive:** The token-refresh serialization (DB lock + revision CAS), why credentials are AES-GCM encrypted with the userId as AAD, and the five acceptance checks that gate production.
- **"Why didn't you implement it?"** — *"It's implemented — it's not enabled. 'Implemented but disabled pending approval' is a different status from 'not done,' and claiming the approval is mine to schedule would be dishonest. The trigger is purely external."*

---

## 11. Sandbox egress filtering & credential hygiene

### What & why

**Problem:** Sandboxes created in `lib/daytona.ts` get standard outbound internet. A prompt-injected or jailbroken bot can reach arbitrary hosts from Daytona's IP space (reputation risk), and the Daytona API key in the worker env can only be used as-is (no rotation runbook).

### How to implement it

1. Daytona network policies: allowlist outbound destinations (package registries, model endpoints) and deny raw sockets to arbitrary IPs. Start in audit/log mode to see what the bots actually reach.
2. Confirm the Daytona key is scoped as narrowly as the API allows, and document a rotation runbook (rotate in the Daytona dashboard → update env in Vercel + Trigger `syncEnvVars` → restart worker).
3. Add Daytona API error classification to `chatErrorMessage` (partially exists) so sandbox abuse signals surface in Sentry with the bot/chat IDs.

**Effort:** ~1 week including the audit period. **Risk:** breaking legitimate bot workflows that need the open internet — hence audit-first.

### Pros / Cons

| Pros | Cons |
|---|---|
| Bounds the blast radius of a jailbroken bot to an allowlist | Bots that legitimately browse the web lose that ability until an entry is added |
| Protects shared IP reputation | Allowlist tuning is ongoing maintenance |
| Rotation runbook is free once written | Daytona plan features may gate network policies |

### Interview script

- **30–60s simple answer:** *"Sandboxes have open egress today. I'd move to a Daytona network allowlist, starting in audit mode so I can see what bots actually reach before denying anything, plus a documented key-rotation runbook."*
- **Deep dive:** The threat model — the bot is an LLM with a shell; egress is the exfiltration channel; and why the sandbox already can't see the app's secrets (Daytona key never leaves the worker).
- **"Why didn't you implement it?"** — *"Because open internet is a feature for a coding/research bot — `curl` the docs, `pip install` the package. Restricting it before knowing the real traffic would break the core use case. The trigger is an abuse signal, and the audit-first approach is how you avoid turning a security win into a product regression."*

---

## 12. WebRTC desktop streaming (replace raw noVNC)

### What & why

**Problem:** `components/chat-desktop-viewer.tsx` streams the sandbox desktop over noVNC/WebSockets (RFB). RFB sends frame rectangles — watching a bot scroll or play video can hit 2–5 Mbps per viewer, and the parked-DOM-node trick that keeps the connection alive across preview/fullscreen is clever but fragile.

### How to implement it

1. Put a WebRTC gateway in front of the sandbox framebuffer (H.264/VP9 encode of the X display — e.g. a small service using `x264` + `aiortc`, or a Daytona-supported streaming endpoint if offered).
2. Keep the existing signed-URL authorization model (`getSandboxVncUrl` → signed preview URL), just change the transport; keep noVNC as fallback for text-heavy sessions.
3. Measure before/after bandwidth and latency with the same session so the win is provable.

**Effort:** 2–4 weeks (a new streaming service is real work). **Risk:** high — this is the most infrastructure-heavy item here; a flaky video path is worse than a laggy VNC path.

### Pros / Cons

| Pros | Cons |
|---|---|
| 60–80% less bandwidth for video-like content; smoother motion | A new service to run, monitor, and scale |
| Better mobile experience | Encoding costs CPU in the sandbox budget |
| — | RTP/ICE through Vercel's edge needs a relay (TURN) for some networks |

### Interview script

- **30–60s simple answer:** *"Desktop viewing is noVNC over WebSockets, which is frame rectangles — fine for reading, expensive for video. At scale I'd front the sandbox with a WebRTC gateway and keep VNC as the fallback, but that's the last item on my list because it's a new service, not a library swap."*
- **Deep dive:** Why the current code parks one DOM node to preserve the RFB connection, the signed-URL auth model that a WebRTC path would inherit, and the TURN relay problem.
- **"Why didn't you implement it?"** — *"Because today almost nobody watches desktops for long, and the sessions people do watch are text-heavy — exactly where RFB is efficient. WebRTC pays off when concurrent desktop viewing becomes common, which is a product-metrics question. The trigger is viewer-minutes per day crossing a threshold I can measure in Sentry."*

---

## Appendix A: "provements" that sound good but I'd push back on

Being able to say *no* to an improvement is as senior as saying yes.

| Idea | My answer |
|---|---|
| "Add a REST API on top" | No — Server Actions already cover the writes; a parallel API doubles the auth/validation surface. A public API comes when there's a public API consumer. |
| "Migrate to microservices" | No — one codebase, two processes (web + worker) is the right split for this scale. Microservices would buy deployment independence nobody needs yet and cost distributed-systems debugging. |
| "Use Redis for everything" | No — Postgres (`usage_periods`, `bot_capacity`) already does the counters atomically. Redis is justified only where it removes an external API from the hot path (Clerk keys/billing). |
| "Add a homepage testimonial section" | No — PRODUCT.md explicitly says no testimonials/customer counts are established. Inventing them would be dishonest; that's a product decision, not an engineering one. |
| "Self-host the LLM" | No — BYOK is the business model. Self-hosting turns a $0-marginal-cost feature into infrastructure. |
| "Rewrite in a different framework" | No — Next.js + Trigger.dev + Clerk is a coherent, boring-in-a-good-way stack. The leverage is in the product loop, not the framework. |

## Appendix B: The 30-second answer for any "what would you improve?" question

> *"Three buckets. First, **safety nets**: CI, committed migrations, env validation — the things that make the next change safe. Second, **scale headroom**: get Clerk out of the per-turn hot path with a webhook mirror and an encrypted key store, and cache the prompt prefix since users pay for their own tokens. Third, **product depth**: semantic memory once memories get big, and WebRTC when desktop viewing gets common. I sequenced them by trigger — each one has a metric that tells me it's time — rather than building all of them on day one, which is how you end up with infrastructure for users you don't have yet."*
