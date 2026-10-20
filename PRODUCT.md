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
- API keys (`/api-keys`) is linked beside Usage & Billing in the sidebar and in the account menu. Users can save, replace, or remove Gemini, OpenRouter and OpenAI keys, with independent provider status, masked inputs, and provider verification before saving. Profile also links to this page. Keys live in Clerk private metadata and only saved-status flags reach the settings UI. The worker resolves keys per user each turn, including memory processing. Personal-key calls use direct provider billing and bypass the app AI allowance; subscriptions and sandbox limits still apply. Removing a key disables that provider. App-owned AI credentials are never used. ChatGPT plan usage offers an experimental Codex connection through the openai-oauth browser extension. Its unofficial status and account limits are disclosed before connecting. The separate approved hosted OAuth flow remains disabled pending access.
- Desktop scrolling observes the screen before and after the wheel event and returns a private observation. Unchanged screens block repeated scrolling at the same target and direction. The agent also bounds repeated actions and scroll attempts, keeps recovery tools available, and reserves the final step for a response. Screen changes alone do not prove scrolling or a page boundary.

## Landing page

The user requested a public landing page at `/`, inspired by https://www.skydive.com/. Its header offers Sign in to visitors and Dashboard to signed-in users. The application entry is `/dashboard`; chat URLs remain `/chats/[chatId]`.

## Evidence and claims

The landing page may demonstrate the features above. No customer counts, testimonials, integration catalog, autonomous scheduling, or external messaging channels have been established.

## Billing

Clerk manages personal subscriptions. Pro is USD 9 per month. Free accounts can sign in and view plans, but cannot create or use bots or sandboxes. Server actions check the live Clerk subscription, and agent turns enforce access. The free workspace shows a centered upgrade screen instead of chat and desktop panels; blocked actions open a centered pricing dialog. Pricing is linked from the landing page and upgrade controls, not a sidebar item. The sidebar footer always shows Usage & Billing (`/usage`, with Manage plan linking to `/billing`), Memory & privacy (`/memory`), and Profile (`/profile`), with consistent icons and active states. Only the bot/group list scrolls; the header and footer stay fixed. Account pages share the workspace sidebar and remain accessible without Pro. The user menu also includes Billing & plans and Usage. `clerk-billing.json` contains the plan and feature configuration.

## Usage allowances

Pro includes 20 sandbox hours per Clerk subscription period, three bot slots, and one running sandbox per user. AI is supplied exclusively through the signed-in user's Gemini, OpenRouter, or OpenAI API key, or an eligible ChatGPT plan connection. No app AI credits, app-funded fallback, AI request-count allowance, wallets, top-ups, or automatic overage charges exist.

Trigger.dev run IDs are registered to their owning user and billing period. Vendor-reported compute duration and compute plus invocation cost are reconciled from the Runs API after turns and every minute by the existing sandbox recovery task. Ledger updates use compare-and-swap and cumulative deltas so retries and overlapping reconciliation cannot double count. Durable chats move to the current subscription period on their next turn after reconciling the preceding period. General platform maintenance has no per-user owner and is not allocated to users. Daytona continues to use confirmed lease runtime, including reservations until stops are confirmed. Worker costs are informational infrastructure accounting, not usage-based customer invoices.

Every model call checks the user's current paid plan, including memory extraction, tool steps and retries. Credentials are resolved by owner; no AI is debited from app usage. ChatGPT HTTP inference streams with store=false, includes history, includes app tools, and requires a completed terminal event. Its credential refresh is serialized in the database and uses encrypted owner-bound storage.

Sandbox starts reserve up to 15 minutes, capped at the subscription period end. A delayed Trigger task is armed before provisioning/start, and a minute schedule recovers expired leases. Confirmed stops return unused reserved time, while unconfirmed stops retain the lease and allowance. Switching bots stops the old sandbox first. Every computer tool rechecks its lease; memory access and VNC starts use the same manager. Five-minute idle stop and one-hour stopped auto-archive are additional safeguards. CPU/RAM/disk are limited to 2 vCPU / 4 GiB / 10 GiB with no GPUs; up to three retained sandboxes bound storage. Never expose the Daytona API key to bots. Stop deadlines depend on healthy Trigger/Daytona services: outages can delay enforcement, so monitor failed stop tasks and infrastructure billing.

Deploy/register `stop-sandbox-lease` and `recover-expired-sandbox-leases` along with `chat-agent`, and provide the same DATABASE_URL, CLERK_SECRET_KEY, DAYTONA_API_KEY and TRIGGER_SECRET_KEY to the web app and worker. Run `pnpm db:push` for the schema. Usage has no historical backfill. Limits reset by selecting a new ledger row from Clerk's actual period start/end, never the browser clock. Run ledger concurrency tests explicitly with `pnpm dlx tsx --env-file=.env.local --test tests/usage-integration.test.ts`.
