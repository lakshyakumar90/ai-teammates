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

Clerk manages personal subscriptions. Pro is USD 20 per month and unlocks all bot and sandbox features. Free accounts can sign in and view plans, but cannot create or use bots or sandboxes. Server actions check the live Clerk subscription, and agent turns enforce access. The free workspace shows a centered upgrade screen instead of chat and desktop panels; blocked actions open a centered pricing dialog. Pricing is linked from the landing page and upgrade controls, not a sidebar item. The user menu includes Billing & plans, opening `/billing` for Clerk account and subscription management. There are no custom usage ledgers, wallets, or unit economics layers. `clerk-billing.json` contains the plan and feature configuration.
