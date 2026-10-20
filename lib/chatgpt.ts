import { createHash, randomBytes } from "node:crypto"
import { createRemoteJWKSet, jwtVerify } from "jose"
import { and, eq, lt, or, isNull, sql } from "drizzle-orm"
import { db } from "./db/client"
import { chatgptConnections, oauthAttempts } from "./db/schema"
import { encryptConnection, decryptConnection } from "./connection-crypto"
import { ModelConfigurationError } from "./ai/models"

const issuer = "https://auth.openai.com"
const resource = "https://api.openai.com/v1"
const scopes =
  "openid profile email offline_access resource.invoke chatgpt.tokens.use.direct"
let jwks: ReturnType<typeof createRemoteJWKSet> | undefined
async function signingKeys() {
  if (!jwks) {
    const response = await fetch(`${issuer}/.well-known/openid-configuration`, {
      signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok) throw new Error("OpenAI discovery unavailable")
    const discovery = await response.json()
    const uri = new URL(discovery.jwks_uri)
    if (discovery.issuer !== issuer || uri.origin !== issuer)
      throw new Error("Invalid OpenAI discovery")
    jwks = createRemoteJWKSet(uri)
  }
  return jwks
}
type Tokens = { access_token: string; refresh_token: string; id_token?: string }
type TokenResponse = Tokens & {
  expires_in: number
  scope: string
  token_type: string
}

export function chatGPTEnabled() {
  return (
    process.env.CHATGPT_HOSTED_ENABLED === "true" &&
    !!process.env.CHATGPT_CLIENT_ID &&
    !!process.env.CHATGPT_CLIENT_SECRET &&
    !!process.env.CHATGPT_REDIRECT_URI &&
    !!process.env.CONNECTION_ENCRYPTION_KEY
  )
}

function config() {
  if (!chatGPTEnabled())
    throw new ModelConfigurationError(
      "ChatGPT connection is not enabled for this hosted app. Use an OpenAI"
    )
  const redirect = new URL(process.env.CHATGPT_REDIRECT_URI!)
  if (
    redirect.protocol !== "https:" &&
    !(redirect.protocol === "http:" && redirect.hostname === "127.0.0.1")
  )
    throw new Error("ChatGPT redirect must use HTTPS")
  return {
    clientId: process.env.CHATGPT_CLIENT_ID!,
    clientSecret: process.env.CHATGPT_CLIENT_SECRET!,
    redirect: redirect.href,
  }
}
const hash = (value: string) =>
  createHash("sha256").update(value).digest("base64url")

function clientAuthorization(clientId: string, clientSecret: string) {
  const encode = (value: string) =>
    new URLSearchParams({ value }).toString().slice(6)
  return `Basic ${Buffer.from(`${encode(clientId)}:${encode(clientSecret)}`).toString("base64")}`
}

async function exchange(values: Record<string, string>) {
  const c = config()
  const response = await fetch(`${issuer}/api/accounts/oauth/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
      Authorization: clientAuthorization(c.clientId, c.clientSecret),
    },
    body: new URLSearchParams({
      ...values,
      client_id: c.clientId,
      resource,
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  })
  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    const terminal = [
      "invalid_grant",
      "invalid_refresh_token",
      "token_expired",
      "refresh_token_expired",
      "refresh_token_invalidated",
      "refresh_token_reused",
    ].includes(body.error)
    throw new ChatGPTConnectionError(
      terminal
        ? "Reconnect ChatGPT in /api-keys."
        : "ChatGPT authorization is temporarily unavailable. Try again later.",
      terminal
    )
  }
  const tokens = (await response.json()) as TokenResponse
  if (
    !tokens.access_token ||
    !tokens.refresh_token ||
    !Number.isFinite(tokens.expires_in) ||
    tokens.expires_in <= 0 ||
    tokens.token_type?.toLowerCase() !== "bearer"
  )
    throw new Error("Invalid ChatGPT token response")
  return tokens
}

export class ChatGPTConnectionError extends Error {
  constructor(
    message: string,
    public terminal = false
  ) {
    super(message)
    this.name = "ChatGPTConnectionError"
  }
}

export async function beginChatGPT(userId: string) {
  const c = config()
  const state = randomBytes(32).toString("base64url")
  const nonce = randomBytes(32).toString("base64url")
  const verifier = randomBytes(32).toString("base64url")
  await db.delete(oauthAttempts).where(lt(oauthAttempts.expiresAt, new Date()))
  await db.insert(oauthAttempts).values({
    stateHash: hash(state),
    userId,
    secrets: encryptConnection(
      { nonce, verifier, redirect: c.redirect },
      userId
    ),
    expiresAt: new Date(Date.now() + 600_000),
  })
  const url = new URL(`${issuer}/api/accounts/authorize`)
  url.search = new URLSearchParams({
    client_id: c.clientId,
    response_type: "code",
    redirect_uri: c.redirect,
    scope: scopes,
    resource,
    state,
    nonce,
    code_challenge_method: "S256",
    code_challenge: hash(verifier),
  }).toString()
  return { url: url.href, state }
}

export async function finishChatGPT(
  userId: string,
  state: string,
  code: string
) {
  const c = config()
  // Atomically consume the attempt; the browser also has to prove its HTTP-only state cookie.
  const [attempt] = await db
    .delete(oauthAttempts)
    .where(
      and(
        eq(oauthAttempts.stateHash, hash(state)),
        eq(oauthAttempts.userId, userId)
      )
    )
    .returning()
  if (!attempt || attempt.expiresAt.getTime() <= Date.now())
    throw new Error("Expired authorization attempt")
  const pending = decryptConnection<{
    nonce: string
    verifier: string
    redirect: string
  }>(attempt.secrets, userId)
  const tokens = await exchange({
    grant_type: "authorization_code",
    code,
    code_verifier: pending.verifier,
    redirect_uri: pending.redirect,
  })
  if (!tokens.id_token) throw new Error("Missing ID token")
  const { payload } = await jwtVerify(tokens.id_token, await signingKeys(), {
    issuer,
    audience: c.clientId,
    requiredClaims: ["sub", "exp", "iat", "nonce"],
  })
  if (!payload.sub || payload.nonce !== pending.nonce)
    throw new Error("Invalid sign-in identity")
  if (!tokens.scope?.split(" ").includes("chatgpt.tokens.use.direct"))
    throw new ChatGPTConnectionError(
      "ChatGPT plan permission was not granted. Connect again and enable plan usage."
    )
  const record = {
    subject: payload.sub,
    clientId: c.clientId,
    label:
      typeof payload.email === "string" ? payload.email : "ChatGPT account",
    credentials: encryptConnection(tokens, userId),
    scopes: tokens.scope,
    expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
    refreshLockUntil: null,
  }
  // Reconnection intentionally replaces the selected account only after full validation.
  await db
    .insert(chatgptConnections)
    .values({ userId, ...record })
    .onConflictDoUpdate({
      target: chatgptConnections.userId,
      set: { ...record, revision: sql`${chatgptConnections.revision} + 1` },
    })
}

export async function cancelChatGPTAttempt(userId: string, state: string) {
  await db
    .delete(oauthAttempts)
    .where(
      and(
        eq(oauthAttempts.userId, userId),
        eq(oauthAttempts.stateHash, hash(state))
      )
    )
}

export async function chatGPTStatus(userId: string) {
  if (!chatGPTEnabled())
    return { enabled: false, connected: false, label: null }
  const row = await db.query.chatgptConnections.findFirst({
    where: eq(chatgptConnections.userId, userId),
  })
  const connected =
    !!row &&
    row.clientId === process.env.CHATGPT_CLIENT_ID &&
    row.scopes.split(" ").includes("chatgpt.tokens.use.direct")
  return { enabled: true, connected, label: connected ? row.label : null }
}

export async function chatGPTAccessToken(userId: string): Promise<string> {
  config()
  const row = await db.query.chatgptConnections.findFirst({
    where: eq(chatgptConnections.userId, userId),
  })
  if (!row || !row.scopes.split(" ").includes("chatgpt.tokens.use.direct"))
    throw new ChatGPTConnectionError("Connect your ChatGPT plan in /api-keys.")
  if (row.clientId !== process.env.CHATGPT_CLIENT_ID)
    throw new ChatGPTConnectionError(
      "ChatGPT configuration changed. Reconnect in /api-keys."
    )
  const tokens = decryptConnection<Tokens>(row.credentials, userId)
  if (row.expiresAt.getTime() > Date.now() + 60_000) return tokens.access_token
  const [locked] = await db
    .update(chatgptConnections)
    .set({ refreshLockUntil: new Date(Date.now() + 30_000) })
    .where(
      and(
        eq(chatgptConnections.userId, userId),
        eq(chatgptConnections.revision, row.revision),
        or(
          isNull(chatgptConnections.refreshLockUntil),
          lt(chatgptConnections.refreshLockUntil, new Date())
        )
      )
    )
    .returning()
  if (!locked)
    throw new ChatGPTConnectionError(
      "Your ChatGPT connection is renewing. Retry in a moment."
    )
  try {
    const renewed = await exchange({
      grant_type: "refresh_token",
      refresh_token: tokens.refresh_token,
    })
    if (
      renewed.scope &&
      !renewed.scope.split(" ").includes("chatgpt.tokens.use.direct")
    )
      throw new ChatGPTConnectionError(
        "ChatGPT plan permission was removed. Reconnect in /api-keys.",
        true
      )
    const changed = await db
      .update(chatgptConnections)
      .set({
        credentials: encryptConnection({ ...tokens, ...renewed }, userId),
        expiresAt: new Date(Date.now() + renewed.expires_in * 1000),
        scopes: renewed.scope || row.scopes,
        refreshLockUntil: null,
        revision: row.revision + 1,
      })
      .where(
        and(
          eq(chatgptConnections.userId, userId),
          eq(chatgptConnections.revision, row.revision)
        )
      )
      .returning()
    if (!changed.length)
      throw new ChatGPTConnectionError(
        "ChatGPT account changed. Send your message again."
      )
    return renewed.access_token
  } catch (error) {
    const condition = and(
      eq(chatgptConnections.userId, userId),
      eq(chatgptConnections.revision, row.revision)
    )
    if (error instanceof ChatGPTConnectionError && error.terminal)
      await db.delete(chatgptConnections).where(condition)
    else
      await db
        .update(chatgptConnections)
        .set({ refreshLockUntil: null })
        .where(condition)
    throw error
  }
}

export async function disconnectChatGPT(userId: string) {
  const row = await db.query.chatgptConnections.findFirst({
    where: eq(chatgptConnections.userId, userId),
  })
  if (!row || row.clientId !== process.env.CHATGPT_CLIENT_ID) return true
  let revoked = false
  try {
    const tokens = decryptConnection<Tokens>(row.credentials, userId)
    const discovery = await fetch(
      `${issuer}/.well-known/openid-configuration`,
      { signal: AbortSignal.timeout(10_000) }
    ).then((r) => r.json())
    const endpoint = new URL(discovery.revocation_endpoint)
    if (endpoint.origin !== issuer)
      throw new Error("Invalid revocation endpoint")
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: clientAuthorization(row.clientId, config().clientSecret),
      },
      body: new URLSearchParams({
        token: tokens.refresh_token,
        token_type_hint: "refresh_token",
        client_id: row.clientId,
      }),
      signal: AbortSignal.timeout(10_000),
    })
    revoked = response.ok
  } catch {
    /* Local disconnect still removes credentials; UI reports unconfirmed remote revocation. */
  }
  await db
    .delete(chatgptConnections)
    .where(
      and(
        eq(chatgptConnections.userId, userId),
        eq(chatgptConnections.revision, row.revision)
      )
    )
  return revoked
}
