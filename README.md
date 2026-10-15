# Next.js template

## Gemini chat

Set `GOOGLE_GENERATIVE_AI_API_KEY` in `.env.local` to your Google AI Studio API
key. Open an existing chat, select a Gemini model, and send a message. Messages
are held in client memory and reset when you leave or reload the chat.

Available models and their labels are configured in `lib/ai/models.ts`.

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
