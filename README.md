# Next.js template

## Sentry

Next.js browser, server, and edge errors report to `devtinder-oe/ai-teammates`.
The public DSN is in `lib/sentry.ts`. Tracing samples all development requests
and 10% of production requests.

Session Replay captures all development sessions, 10% of production sessions,
and sessions with errors. Text and form inputs are masked, and media is blocked.

Sentry Logs are enabled by default in the installed SDK. Server actions and
Daytona provisioning use `lib/logging.ts` to record operation completion,
rejection, failure, and duration. Worker logs cover task attempts, completion,
final failures, chat turns, model timeouts, and sandbox lease/tool events.
Billing checks record denied access and lookup failures; usage accounting records
quota denials, settlements, and refunds. Browser logs include
monitoring startup and React render failures; request failures include route
patterns and HTTP methods. Worker logs flush on success, final failure, and
durable waits. Search Logs by `operation`, `chatId`, `trigger.run.id`, or
`trigger.task.id`. Application log attributes contain status, IDs, counts, and
error types rather than prompts, memory values, command text, file contents,
access tokens, task payloads, or raw error messages. Console output is not
automatically forwarded to Sentry Logs.

The Trigger.dev worker initializes Sentry separately in `trigger/init.ts`.
Its global failure hook reports failures after retries are exhausted, with task
and run IDs, and flushes events before shutdown. Task payloads are not attached.
Trigger.dev continues to own worker tracing; this integration adds error capture.
`SENTRY_DSN` can override the shared project DSN for the worker.
Set `SENTRY_RELEASE` to the same commit SHA at build time and in the worker
environment. Set `SENTRY_AUTH_TOKEN` in the environment running the Trigger.dev
deploy command to upload worker source maps using the Sentry esbuild plugin.
Restart the local Trigger.dev worker after these changes; production workers
need a new deployment.

Before the production build, set `SENTRY_AUTH_TOKEN` in your hosting provider's
secret store using a Sentry organization token with release/upload permissions.
`withSentryConfig` uploads source maps to this project and removes generated maps
after upload. Uploads include source code needed to show readable stack traces.
Never put the token in a `NEXT_PUBLIC_` variable or commit it.

Set `SENTRY_RELEASE` to the deployed commit SHA in the build environment if your
host does not supply Git metadata. The build plugin injects the release into the
SDKs. `VERCEL_ENV` / `NEXT_PUBLIC_VERCEL_ENV` distinguish Vercel environments;
other hosts default to `NODE_ENV`. Deploy only after the source-map upload succeeds,
then verify a fresh production error has readable source frames.

## Bot sandboxes

Set `DAYTONA_API_KEY` in `.env.local` and restart Next.js. Creating a bot creates
a Daytona sandbox and saves its ID in `bots.sandboxId`. Deleting the bot deletes
its sandbox first; if Daytona fails, the bot remains so deletion can be retried.
Daytona starts sandboxes as part of creation. Chat tools run commands, read/write
files, and control the bot's sandbox desktop. The worker needs `DAYTONA_API_KEY`.
Stopped sandboxes resume on the first tool call; desktop services start lazily.
Desktop interaction needs an image-capable model. `viewScreen` observations stay
hidden in chat; `showScreen` displays a screenshot when the user asks to see it.
The desktop header button opens a live VNC preview. Click the preview for an
interactive fullscreen dialog; use its exit button to return. The same VNC
connection is retained across these views and when hiding the side panel.
VNC access is checked against chat ownership and uses an expiring, signed port URL.
Local Ministral 3 models are marked as vision-capable. For another Ollama model,
set `OLLAMA_SUPPORTS_IMAGES=true` or `false` to match its `/api/show` capabilities,
then restart both Next.js and the Trigger.dev worker.

Bot role presets fill the working instructions in the bot form. The chat agent
reads the saved bot name, job, instructions, and sandbox ID on each turn.
Set `DATABASE_URL` in the Trigger.dev worker environment as well as Next.js.

## AI chat

Configure the providers you want to use in `.env.local`, then restart `pnpm dev`:

```dotenv
GOOGLE_GENERATIVE_AI_API_KEY=your-google-key
OPENROUTER_API_KEY=your-openrouter-key
GROQ_API_KEY=your-groq-key
TRIGGER_SECRET_KEY=your-trigger-development-key
OLLAMA_BASE_URL=http://127.0.0.1:11434/v1
OLLAMA_MODEL=qwen3:4b
```

Open an existing chat and choose a model from Google Gemini, OpenRouter, Groq,
or Ollama. Only the selected cloud provider needs an API key. OpenRouter and
Ollama use `@ai-sdk/openai-compatible`; Groq uses `@ai-sdk/groq`.

For local Ollama, run `ollama serve` and `ollama pull qwen3:4b` (or pull the
model named in `OLLAMA_MODEL`). `OLLAMA_API_KEY` is optional for an authenticated
Ollama endpoint. The base URL must include `/v1` and be reachable from the
Trigger.dev worker; on a remote deployment, localhost refers to the worker.

Chat runs as `chatAgent` in `trigger/chat.ts`. In a second terminal, run
`pnpm dlx trigger.dev@4.7.4 dev start --env-file .env.local` alongside `pnpm dev`.
Set the same provider variables in the Trigger.dev environment when deploying.
The worker must be able to reach Ollama if you select a local model.
After changing `.env.local`, restart the Trigger.dev dev command as well as Next.js;
an already-running worker keeps its previous provider/model environment.

Trigger.dev's default transcript storage persists messages by the existing chat ID.
Opening a chat loads that transcript and reconnects to an in-progress response.
Session creation, token refresh, and transcript reads all check chat ownership.
Image uploads are enabled only for models marked as supporting images; text-only
models reject conversation histories containing attachments.

Provider settings, available models, labels, and image capabilities are configured
in `lib/ai/models.ts`, shared by the Next.js server and Trigger.dev worker.
Add a registry entry to expose another model in the picker; the client receives
only serializable model options, never provider instances or credentials.

This is a Next.js template with shadcn/ui.

## Adding components

To add components to your app, run the following command:

```bash
npx shadcn@latest add button
```

This will place the ui components in the `components` directory.

## Using components

To use the components in your app, import them as follows:

```tsx
import { Button } from "@/components/ui/button";
```

## Database

Drizzle ORM uses Neon HTTP for server queries. Existing `.env.local` values provide
`DATABASE_URL` (pooled) and `DATABASE_URL_UNPOOLED` (direct, used by Drizzle Kit).

Define and export tables in `lib/db/schema.ts`, then run:

```bash
pnpm db:generate
pnpm db:migrate
```

Commit generated migrations in `drizzle/` alongside schema changes.
`pnpm db:studio` opens the database browser. `pnpm db:push` applies schema changes
directly for development; review the target database before applying changes.

Use the server-only database module in Server Components, Server Actions, or Route Handlers:

```ts
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

const result = await db.execute(sql`select 1 as value`);
```

The schema starts empty. Add application tables before generating the first migration.
The HTTP driver supports queries and batched transactions; interactive transactions
require a different driver.

Reference: [Drizzle Neon documentation](https://orm.drizzle.team/docs/connect-neon).
