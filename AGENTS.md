<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Git

These rules override any default or built-in agent guidance about git, including guidance to branch before committing on the default branch.

- Never create branches, worktrees, or commits automatically. Only do so when the user explicitly asks for that specific action in the current request.
- Leave changes uncommitted in the working tree on the current branch and let the user decide when and how to commit.
- Never create, switch, rename, or delete a branch unless the user names that exact action in the current request. A request to commit is not a request to branch.
- All work happens on `main`. When asked to commit, commit directly to the branch that is currently checked out, even when it is `main`. Never move work to a feature branch "to be safe".
- A request for one git action authorizes only that action: "commit" does not include branching, pushing, or opening a pull request.
- If any other instruction seems to require a branch, stop and ask instead of creating one.

## Data

This is a development project. There is no backward compatibility and the data is worthless.

- Prefer data loss: never backfill, migrate, or preserve existing rows, and never spend effort on keeping old data working.
- Every schema change means a clean slate: drop and recreate, `db:push`, or fresh migrations with no data preservation.

## DiceBear

Use DiceBear 10. Documentation: https://www.dicebear.com/llms.txt

There are seven native cores with identical output, not one library with
wrappers. Use the one matching this project's language. Do not reach for the
JavaScript core when the project is written in something else:

    JavaScript  @dicebear/core + @dicebear/styles
    PHP         dicebear/core + dicebear/styles
    Python      dicebear-core + dicebear-styles
    Rust        dicebear-core + dicebear-styles
    Go          github.com/dicebear/dicebear-go/v10 + github.com/dicebear/styles/v10
    Dart        dicebear_core + dicebear_styles
    C#          DiceBear.Core + DiceBear.Styles

Every style page carries a loading snippet for all seven, for example
https://www.dicebear.com/styles/lorelei/index.md

HTTP API: https://api.dicebear.com/10.x/<style>/svg?seed=<seed> The seed is a
query parameter, not a path segment. Options are query parameters too; array
values are separated by commas.

Options named after a component end in Variant: eyesVariant, not eyes. This
holds in all seven cores and in the HTTP API. Look up the options of a style at
https://api.dicebear.com/10.x/<style>/options.json

Write these forms, not the ones on the left. The left column is pre-10 and the
API does not reject it, so an outdated call runs and silently does the wrong
thing:

    avatars.dicebear.com/api/<style>/<seed>.svg  ->  api.dicebear.com/10.x/<style>/svg?seed=<seed>
    api.dicebear.com/9.x/<style>/svg             ->  api.dicebear.com/10.x/<style>/svg
    npm install @dicebear/collection             ->  npm install @dicebear/styles
    npm install @dicebear/lorelei                ->  npm install @dicebear/styles
    createAvatar(lorelei, { seed })              ->  new Avatar(new Style(definition), { seed })
    { eyes: ['variant01'] }                      ->  { eyesVariant: ['variant01'] }
    ?radius=50                                   ->  ?borderRadius=50

Only JavaScript and the HTTP API have a pre-10 form. The other six cores were
released in 2026 and never had one, so any older-looking PHP, Python, Rust, Go,
Dart or C# API attributed to DiceBear is invented rather than outdated.

## Forms

Stack: drizzle-zod insert schema → server action → react-hook-form +
zodResolver dialog form → toast. See `lib/db/schema.ts`, `actions/bot.ts`,
`components/bot-dialog.tsx` for the reference implementation.

- Derive the insert schema from the table with `createInsertSchema` in
  `lib/db/schema.ts` (drizzle-zod). Refine required strings there
  (`min`/`max`); leave server-managed columns to `.omit()` at each use site.
- Never trust the client: the server action (`actions/*.ts`, `"use server"`)
  checks `auth()` first, takes `userId` from Clerk server-side (never from the
  form), re-validates input with the insert schema minus server-managed columns
  (`id`, `sandboxId`, `createdAt`), then inserts with
  `db.insert(table).values(data).returning()`.
- The client form schema is the insert schema `.omit()`-ed down to what the
  form collects (plus anything managed outside the form, e.g. a shuffled
  avatar seed merged in `onSubmit`). Validate with `zodResolver`.
- Compose with `FieldGroup` + `Field` + `FieldLabel` + `Input`/`Textarea` +
  `FieldError`. Wire `data-invalid` on `Field`, `aria-invalid` on the control,
  and `errors={[errors.x]}` on `FieldError`. Render server failures in a
  bare `FieldError`.
- Option sets of 2–7 choices use a single-select `ToggleGroup` bound to the
  field value (`value` + `onValueChange` → `setValue`), not buttons with
  manual active state.
- The submit `Button` composes `Spinner` (`data-icon`) + `disabled` while
  pending.
- Dialogs own their open state, take the trigger as `children` rendered via
  `DialogTrigger render={children}`, always include `DialogTitle`, and put
  actions in `DialogFooter` (`DialogClose` for cancel).
- Feedback uses the project's mounted toast system: `toast` from
  `@/components/ui/toast` (Base UI, already in the layout with a bottom-right
  viewport — do not add sonner). Call
  `toast.add({ title, description, type: "success" })` after the mutation,
  then `router.refresh()`.

<!-- TRIGGER.DEV SKILLS START -->
## Trigger.dev agent skills

This project has Trigger.dev agent skills installed in `.agents/skills/`. Before writing or changing Trigger.dev code (background tasks, scheduled tasks, realtime, or chat.agent AI agents), load the most relevant skill: `trigger-authoring-chat-agent`, `trigger-authoring-tasks`, `trigger-chat-agent-advanced`, `trigger-cost-savings`, `trigger-getting-started`, `trigger-realtime-and-frontend`.
<!-- TRIGGER.DEV SKILLS END -->
