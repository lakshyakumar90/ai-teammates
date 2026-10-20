# ChatGPT subscription connections

## Experimental community connection

`@openai-oauth/core` and `@openai-oauth/web` are pinned to 2.0.0. This is a
separate adapter for https://github.com/EvanZhouDev/openai-oauth, not the approved
hosted flow below. Enable `CHATGPT_COMMUNITY_ENABLED=true` on both Vercel and
Trigger.dev, with the same existing `CONNECTION_ENCRYPTION_KEY`. No OpenAI client
secret is required. Clerk remains the application identity provider.

Users open API keys, install the project's Chrome or Firefox extension from the
linked browser store, return to the app, and choose Connect ChatGPT (experimental).
The SDK uses PKCE and browser state, the extension forwards the fixed Codex
localhost callback, and the browser exchanges the code. The app does not store
tokens in localStorage or IndexedDB: its custom session store sends them once to
an authenticated same-origin endpoint. That endpoint bounds the payload, checks
the selected account against the live Codex catalog, and saves owner-bound AES-GCM
ciphertext. Tokens never appear in component props or Trigger task payloads.

Background requests read that owner's session and renew it under a database lease
and revision check. Terminal refresh errors remove the connection; temporary
failures preserve it. Reconnecting replaces the selected connection. Disconnect
removes it locally and attempts public-client revocation, reporting when remote
revocation cannot be confirmed. Turning off the flag disables inference and new
connections while leaving disconnect available.

The SDK 7 adapter uses this package's core transport rather than its SDK 6 adapter.
It discovers the connected account's Codex models, streams full history and tools
with store=false, and rejects truncated streams. Model IDs use the distinct
`chatgpt-community:` prefix. This never falls back to app credentials or charges
AI credits. Pro remains $9/month; only worker and sandbox usage are metered by
the app, and ChatGPT/Codex limits remain controlled by OpenAI.

### Requirements and limitations

- Chrome or Firefox plus the third-party extension is required; Safari is unsupported.
- An account with Codex access and remaining usage is required. This exposes Codex
  models, not every model available in the ChatGPT website.
- The connection reuses Codex's public OAuth client and the private
  `chatgpt.com/backend-api/codex` endpoint. It is unofficial, can break without
  notice, and is not evidence of OpenAI approval for a paid hosted service. The
  repository's Apache license licenses its code, not the upstream service. Review
  applicable OpenAI account/service terms before relying on it commercially.
- The browser extension handles the redirect and can see authorization data; users
  must decide whether to trust it. Refresh tokens are also held by this app,
  encrypted at rest, to support unattended workers.
- FedRAMP accounts are rejected. Organization policy, CORS/token exchange behavior,
  extension availability and upstream changes may prevent sign-in.
- Automated checks cover encrypted storage against a real database and mocked
  upstream catalog/refresh/inference, including SDK 7 tool transport. A real
  extension sign-in must be completed by a user; automated tests do not establish
  service approval or guarantee future access.

## Approved hosted integration (separate, disabled pending access)

Hosted ChatGPT plan usage requires access from OpenAI. The public OSS instructions
are for locally hosted tools; a paid hosted app must use the interest form linked
at https://developers.openai.com/siwc/token-sharing-open-source and receive its
approved client and deployment requirements first. Identity-only sign-in does not
permit subscription inference. The feature is disabled unless all required hosted
configuration is present; do not enable it merely because a client ID exists.

## Required configuration (web and worker)

- CHATGPT_HOSTED_ENABLED=true only after OpenAI enables plan usage for this hosted app.
- CHATGPT_CLIENT_ID: approved hosted OAuth client ID.
- CHATGPT_CLIENT_SECRET: approved confidential-client secret (client_secret_basic authentication).
- CHATGPT_REDIRECT_URI: exact registered HTTPS callback, for example
  https://ai-teammates.lakshyakumar.in/api/connections/chatgpt/callback.
- CONNECTION_ENCRYPTION_KEY: the same base64-encoded 32-byte key on web and worker.
  Generate with a cryptographic random generator; never commit it or rotate it
  without disconnecting existing encrypted sessions.

Apply the database schema, deploy both services with matching configuration, and
verify that the scopes and grant behavior above are enabled for the issued client.
If OpenAI supplies a different hosted grant contract, update the adapter before
enabling; the public OSS dynamic-registration flow must not be used as a workaround.

## Implemented flow

The signed-in Clerk owner initiates POST /api/connections/chatgpt/start. OAuth uses
state, nonce and S256 PKCE. A ten-minute encrypted attempt is bound to that owner
and an HTTP-only state cookie. The callback atomically consumes the attempt,
exchanges the code, discovers OpenAI signing keys, validates ID-token claims, and
requires chatgpt.tokens.use.direct before saving encrypted credentials.
Reconnecting replaces the selected ChatGPT account after validation. Tokens never
reach browser props. Refresh uses a database lease and revision check across web
and Trigger.dev. Disconnect attempts remote session revocation and reports when
only local removal could be confirmed.

Models come from the connected account's catalog. Eligible inference uses public
POST /v1/responses with store=false and stream=true, full input history, and app
function tools grouped in a namespace. Internal memory extraction also streams.
Truncated or failed streams cannot be recorded as successful completion. No
provider key is used as a fallback. Image support is advertised only if the account
catalog provides image capability metadata; verify the approved catalog contract
before enabling desktop screenshots for ChatGPT models.

## Required live acceptance checks before enabling

1. Approved user/workspace completes consent and one streamed text response.
2. Account-specific model list, structured memory output, function tools and
   group handoffs work under the hosted client's supported capabilities.
3. Two processes attempting renewal do not reuse a rotating refresh token.
4. Revocation, expired credentials, missing scope, usage limits and mid-stream
   failures stop inference and show a recovery path without switching billing.
5. Disconnect and reconnect cannot overwrite a newer connection from an older refresh.

The implementation can be tested locally with mocked transports. Live subscription
inference cannot be verified until OpenAI provides the hosted access and credentials.
