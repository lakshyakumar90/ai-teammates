# Next.js template

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
