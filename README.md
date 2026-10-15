# Next.js template

## AI chat

Configure the providers you want to use in `.env.local`, then restart `pnpm dev`:

```dotenv
GOOGLE_GENERATIVE_AI_API_KEY=your-google-key
OPENROUTER_API_KEY=your-openrouter-key
GROQ_API_KEY=your-groq-key
OLLAMA_BASE_URL=http://127.0.0.1:11434/v1
OLLAMA_MODEL=qwen3:4b
```

Open an existing chat and choose a model from Google Gemini, OpenRouter, Groq,
or Ollama. Only the selected cloud provider needs an API key. OpenRouter and
Ollama use `@ai-sdk/openai-compatible`; Groq uses `@ai-sdk/groq`.

For local Ollama, run `ollama serve` and `ollama pull qwen3:4b` (or pull the
model named in `OLLAMA_MODEL`). `OLLAMA_API_KEY` is optional for an authenticated
Ollama endpoint. The base URL must include `/v1` and be reachable from the Next.js
server; on a remote deployment, localhost refers to the deployment server.

Messages are held in client memory and reset when you leave or reload the chat.
Image uploads are enabled only for models marked as supporting images; text-only
models reject conversation histories containing attachments.

Provider settings, available models, labels, and image capabilities are configured
in the server-only `lib/ai/models.ts`. Add a registry entry to expose another model
in the picker; provider instances and credentials stay on the server.

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
