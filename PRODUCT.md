# AI Teammates

## Platform

web

## Product purpose

Create AI bots with names, avatars, jobs, instructions, and individual computers. Talk to bots privately or bring them together in a group chat, select a responder, and hand work to another bot when its job is better suited.

## Capabilities

- Individual bot conversations and group chats with mentions and handoffs.
- Global user memory, group shared memory, and individual bot memory, controlled through Memory & privacy settings.
- Each bot has a Daytona sandbox. Desktop access is available in individual chats; group chats do not offer a desktop panel.
- Clerk authentication protects the dashboard and chats.

## Landing page

The user requested a public landing page at `/`, inspired by https://www.skydive.com/. Its header offers Sign in to visitors and Dashboard to signed-in users. The application entry is `/dashboard`; chat URLs remain `/chats/[chatId]`.

## Evidence and claims

The landing page may demonstrate the features above. No customer counts, testimonials, integration catalog, autonomous scheduling, or external messaging channels have been established.

## Billing

Clerk manages personal subscriptions. Pro is USD 20 per month. Free accounts can sign in and view plans, but cannot create or use bots or sandboxes. Server actions check the live Clerk subscription, and agent turns enforce access. The free workspace shows a centered upgrade screen instead of chat and desktop panels; blocked actions open a centered pricing dialog. Pricing is linked from the landing page and upgrade controls, not a sidebar item. The sidebar footer always shows Usage & Billing (`/usage`, with Manage plan linking to `/billing`), Memory & privacy (`/memory`), and Profile (`/profile`), with consistent icons and active states. Only the bot/group list scrolls; the header and footer stay fixed. Account pages share the workspace sidebar and remain accessible without Pro. The user menu also includes Billing & plans and Usage. `clerk-billing.json` contains the plan and feature configuration.

## Usage allowances

Pro includes $5 estimated AI cost per Clerk subscription period, with no provider-call count cap, 20 sandbox hours per period, three bot slots, and one running sandbox per user. Defaults live in `lib/usage-policy.ts`. There are no wallets, top-ups, automatic overage charges, or usage-based customer invoices. The Neon tables `usage_periods` and `usage_entries` are the source of truth for reservations and settled usage; `bot_capacity` serializes bot provisioning; `sandbox_leases` serializes sandbox starts across Next.js and Trigger workers.

AI SDK middleware meters every underlying model call, including memory extraction, retries, tool steps and handoffs. It checks settled spend before each call and records confirmed token usage afterward. There are no app-imposed conversation byte, screenshot-count, or output-token caps in the billing middleware. Provider context and output limits still apply. In-flight requests can finish after the spending allowance is reached; later calls stop. Failed calls without confirmed token usage remain pending at zero cost. Unsupported or unpriced models fail closed. Rates are estimates without cache discounts, not reconciled provider invoices. Reviewed October 16, 2026: [Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing), [Groq models](https://console.groq.com/docs/models); Qwen uses the published $0.80/$4 per million input/output token rates. OpenRouter prices come from its live `/api/v1/models` catalog; local Ollama has zero external token cost and has no call-count cap. Recheck static pricing when changing models or provider rates.

Sandbox starts reserve up to 15 minutes, capped at the subscription period end. A delayed Trigger task is armed before provisioning/start, and a minute schedule recovers expired leases. Confirmed stops return unused reserved time, while unconfirmed stops retain the lease and allowance. Switching bots stops the old sandbox first. Every computer tool rechecks its lease; memory access and VNC starts use the same manager. Five-minute idle stop and one-hour stopped auto-archive are additional safeguards. CPU/RAM/disk are limited to 2 vCPU / 4 GiB / 10 GiB with no GPUs; up to three retained sandboxes bound storage. Never expose the Daytona API key to bots. Stop deadlines depend on healthy Trigger/Daytona services: outages can delay enforcement, so monitor failed stop tasks and infrastructure billing.

Deploy/register `stop-sandbox-lease` and `recover-expired-sandbox-leases` along with `chat-agent`, and provide the same DATABASE_URL, CLERK_SECRET_KEY, DAYTONA_API_KEY and TRIGGER_SECRET_KEY to the web app and worker. Run `pnpm db:push` for the schema. Usage has no historical backfill. Limits reset by selecting a new ledger row from Clerk's actual period start/end, never the browser clock. Run ledger concurrency tests explicitly with `pnpm dlx tsx --env-file=.env.local --test tests/usage-integration.test.ts`.
