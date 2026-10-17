# Deployment

Deployed on October 17, 2026.

- App: https://ai-teammates-black.vercel.app
- Vercel project: https://vercel.com/lakshyakumar90s-projects/ai-teammates
- Trigger.dev: https://cloud.trigger.dev/projects/v3/proj_sssnetbqmvjbwyyailic
- Database: existing Neon project `blue-mountain-02858188`, main branch.
- Authentication and billing: existing Clerk application, development instance.
- Sandboxes: existing Daytona account.
- Monitoring: Sentry project `devtinder-oe/ai-teammates`.

## Environment variables

Vercel Production and Preview have the four existing Clerk sign-in/sign-up URL
and fallback settings, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`,
`DATABASE_URL`, `GOOGLE_GENERATIVE_AI_API_KEY`, `GROQ_API_KEY`,
`OPENROUTER_API_KEY`, `DAYTONA_API_KEY`, `DAYTONA_API_URL`,
`TRIGGER_SECRET_KEY`, `SENTRY_AUTH_TOKEN`, and `SENTRY_RELEASE`.

The deployed app uses a **production** Trigger.dev key. Keep the local
development key in `.env.local` for local development.

Trigger's deploy config synchronizes database, Clerk, Daytona, AI provider,
and optional Sentry runtime settings from the deployment process. Credentials
load before Sentry's build plugin is configured. `SENTRY_AUTH_TOKEN` is a
build credential and is not synchronized into worker runtime variables.

Preview currently shares the database, Clerk instance, and production worker
with Production. It is not an isolated test environment.

## Deploy again

From the project directory, with authenticated CLIs and `.env.local` populated:

```powershell
pnpm exec tsc --noEmit --pretty false
pnpm dlx trigger.dev@4.7.4 deploy --env prod --env-file .env.local --skip-update-check
vercel deploy --prod --yes
```

Set `SENTRY_RELEASE` to the same unique release identifier for both deployments.
Vercel is connected to the GitHub repository; pushes to its production branch
trigger web builds using the committed source.
Trigger worker changes require their own deployment.

## Verification and limits

- Vercel production build and TypeScript checks passed.
- Homepage, sign-in, and pricing returned HTTP 200.
- Signed-out dashboard requests redirected to sign-in.
- Neon query succeeded and found the existing ten public tables.
- Daytona sandbox listing authenticated successfully.
- Google, Groq, and OpenRouter credential checks returned HTTP 200.
- A production `hello-world` task completed successfully.
- Vercel uploaded its Sentry source maps successfully. The worker's Sentry
  plugin warned that it found no matching sources for debug ID upload;
  worker source-map upload remains unverified.

Clerk is intentionally still using its development instance because no custom
domain was supplied. Production Clerk authentication and live billing have not
been configured. Full signed-in bot creation, paid-plan checkout, and AI chat
have not been tested end to end.

Local Ollama is not hosted by this deployment. Use a configured cloud provider;
Ollama requires an endpoint reachable from Trigger.dev, with matching settings
on both Vercel and the worker.

No database schema changes were required.

## Chat failure investigation (October 17)

Original run: `run_06gkjtrhlu1jfrid63lf9e0a01`, worker version `20261017.2`.
The first turn encountered a sandbox startup already in progress. Subsequent
turns failed before calling the model: Daytona's `downloadFile` could not load
`busboy` while reading the bot's memory file.

The worker now explicitly installs Daytona, busboy, and form-data with Trigger's
`additionalPackages` build extension. The sandbox lease path waits up to 30
seconds for another startup request to finish. Sandbox errors are classified
separately from model errors, without exposing raw internal details.

A deployed runtime check confirmed memory access and upload/download work, then
exposed a separate upstream Nvidia overload (503) for the free Nemotron model.
OpenRouter returned that error inside an HTTP-200 JSON envelope. Error formatting
now recognizes the envelope's provider status. No API keys were changed.

`verify-chat-runtime` is an operator smoke-test task. It accepts a chat ID and
model ID, checks authorized memory access, round-trips and deletes a uniquely
named temporary file, and tests memory extraction plus a short model response.
It returns check results without returning user messages or memory. Tests use
the chat owner's existing metered provider and sandbox allowance.

Worker version `20261017.5` passed the complete runtime check using
`groq-gpt-oss-20b` in run `run_06gkk1hm2acnokl45iok2pq601`: memory read,
file upload/download, memory extraction, and model response all succeeded.
All 22 focused tests and the Vercel production build passed.
Gemini 3 Flash passed the same checks in run `run_06gkk1jt83tm21d8fserfg6u01`.

## AI allowance policy update

Removed the middleware's 100 KB conversation ceiling, screenshot-budget estimate,
4,096 output-token cap, and 1,000-call allowance. Each provider request now checks
recorded AI spending, starts a zero-cost pending ledger entry, and settles actual
reported tokens afterward. Requests stop at the $5 period allowance; in-flight
requests can complete past that point. Provider context limits still apply.
The Usage page displays request count as information rather than a quota.
Regression tests cover large prompts, multiple screenshots, explicit output
budgets, more than 1,000 calls, exact-budget rejection, and settlement.

## Authentication recovery

Sentry issue `AI-TEAMMATES-E` showed successful chat session/transcript actions
followed about 20 seconds later by a missing server session on the desktop
subscription check. The original event did not capture Clerk's rejection reason.

Missing sessions now return `AUTHENTICATION_REQUIRED` before subscription checks
or mutations. Clients refresh Clerk's token once and retry only that explicit
pre-operation rejection. Successes, subscription denials, thrown/network failures,
and ordinary mutation failures are never automatically replayed. Chat waits for
Clerk initialization and disconnects its client transport when signed out.
Access feedback distinguishes sign-in from subscription requirements. Other
server actions use Clerk's protection instead of generic authentication throws.

Authentication diagnostics record only a bounded Clerk reason code and whether
a session cookie exists, never the cookie or token. Web release:
`auth-recovery-20261017`. Eleven focused tests, TypeScript, and Vercel's build
passed. A live signed-in recovery flow remains unverified; a direct action smoke
request could not use the local build's different Server Action ID.

Clerk's deployment status still reports no production instance. Production
authentication/live billing require the Clerk production setup and a domain
owned by the project owner. The current Vercel deployment uses development keys.

## OpenRouter free-model verification

The OpenRouter list now contains only Dots3-Note Preview, LFM2.5-2.6B, and
Nemotron 3 Super 120B A12B, all using explicit `:free` IDs. Live key-based tests
covered memory extraction, streamed tool execution, grounded facts, and visible
streaming replies. Dots3 also passed a screenshot-tool image check. Strict JSON
schemas, multipart tool images, and streaming usage reporting are enabled in
the OpenRouter adapter. See `OPENROUTER_MODELS.md` for all exclusions.

Deployed to Vercel and Trigger.dev worker version `20261017.7`. Eight focused
tests, TypeScript, and the production build passed. An idle older chat run was
stopped after checking its trace for an active turn, allowing its next message
to continue on the new worker without deleting its transcript.
