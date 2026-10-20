import { and, eq, isNull, lt, or, sql } from "drizzle-orm"
import { z } from "zod"
import {
  createOpenAIOAuthTransport,
  DEFAULT_OPENAI_OAUTH_CLIENT_ID,
  refreshOpenAIOAuthTokens,
  type OpenAIOAuthSession,
} from "@openai-oauth/core"
import { db } from "./db/client"
import { chatgptConnections } from "./db/schema"
import { encryptConnection, decryptConnection } from "./connection-crypto"
import { ChatGPTConnectionError } from "./chatgpt"

// Deliberately separate from the approved hosted integration and its client ID.
const clientId = DEFAULT_OPENAI_OAUTH_CLIENT_ID
const version = "0.144.1"
export const communitySessionSchema = z.object({
  accessToken: z.string().min(20).max(20000),
  refreshToken: z.string().min(10).max(20000),
  accountId: z
    .string()
    .min(1)
    .max(200)
    .regex(/^[a-zA-Z0-9_-]+$/),
  expiresAt: z.string().datetime().optional(),
  isFedRamp: z.boolean().optional(),
})

export function communityChatGPTEnabled() {
  return (
    process.env.CHATGPT_COMMUNITY_ENABLED === "true" &&
    !!process.env.CONNECTION_ENCRYPTION_KEY
  )
}

function requireEnabled() {
  if (!communityChatGPTEnabled())
    throw new ChatGPTConnectionError(
      "Experimental ChatGPT connections are unavailable. Use a personal API key."
    )
}

const ownedConnection = (userId: string) =>
  and(
    eq(chatgptConnections.userId, userId),
    eq(chatgptConnections.clientId, clientId)
  )

export async function communityChatGPTStatus(userId: string) {
  const row = await db.query.chatgptConnections.findFirst({
    where: ownedConnection(userId),
  })
  return {
    enabled: communityChatGPTEnabled(),
    connected: !!row,
    label: row?.label ?? null,
  }
}

export function communityTransport(auth: () => Promise<OpenAIOAuthSession>) {
  return createOpenAIOAuthTransport({
    auth,
    codexVersion: version,
    responsesState: false,
  })
}

export async function communityCatalog(session: OpenAIOAuthSession) {
  if (session.isFedRamp)
    throw new ChatGPTConnectionError(
      "This experimental connection does not support FedRAMP accounts."
    )
  const response = await communityTransport(async () => session).request(
    `/models?client_version=${version}`,
    {
      signal: AbortSignal.timeout(15000),
    }
  )
  if (!response.ok)
    throw new ChatGPTConnectionError(
      "ChatGPT could not verify this connection. Reconnect or use an API key."
    )
  const body = await response.json()
  const catalog = z
    .object({
      models: z.array(
        z.object({
          slug: z.string().min(1).max(200),
          display_name: z.string().optional(),
          visibility: z.string().optional(),
          supported_in_api: z.boolean().optional(),
          input_modalities: z.array(z.string()).optional(),
        })
      ),
    })
    .safeParse(body)
  if (!catalog.success)
    throw new ChatGPTConnectionError(
      "ChatGPT returned an unsupported model catalog."
    )
  return catalog.data.models.filter(
    (m) =>
      m.supported_in_api !== false && (!m.visibility || m.visibility === "list")
  )
}

export async function connectCommunityChatGPT(userId: string, input: unknown) {
  requireEnabled()
  const session = communitySessionSchema.parse(input)
  await communityCatalog(session) // Authenticate against the selected workspace before storing anything.
  const expiresAt = new Date(
    Math.min(
      session.expiresAt ? Date.parse(session.expiresAt) : Date.now() + 3600000,
      Date.now() + 3600000
    )
  )
  const record = {
    subject: session.accountId,
    clientId,
    label: "ChatGPT / Codex (experimental)",
    credentials: encryptConnection(session, userId),
    scopes: "codex-client",
    expiresAt,
    refreshLockUntil: null,
  }
  await db
    .insert(chatgptConnections)
    .values({ userId, ...record })
    .onConflictDoUpdate({
      target: chatgptConnections.userId,
      set: { ...record, revision: sql`${chatgptConnections.revision} + 1` },
    })
}

export async function communityChatGPTSession(
  userId: string
): Promise<OpenAIOAuthSession> {
  requireEnabled()
  const row = await db.query.chatgptConnections.findFirst({
    where: ownedConnection(userId),
  })
  if (!row)
    throw new ChatGPTConnectionError(
      "Connect ChatGPT in /api-keys or select a personal API key model."
    )
  const session = communitySessionSchema.parse(
    decryptConnection(row.credentials, userId)
  )
  if (row.expiresAt.getTime() > Date.now() + 60000) return session
  const condition = and(
    ownedConnection(userId),
    eq(chatgptConnections.revision, row.revision)
  )
  const [locked] = await db
    .update(chatgptConnections)
    .set({ refreshLockUntil: new Date(Date.now() + 30000) })
    .where(
      and(
        condition,
        or(
          isNull(chatgptConnections.refreshLockUntil),
          lt(chatgptConnections.refreshLockUntil, new Date())
        )
      )
    )
    .returning()
  if (!locked)
    throw new ChatGPTConnectionError("ChatGPT is renewing. Retry in a moment.")
  let terminal = false
  try {
    const tokens = await refreshOpenAIOAuthTokens({
      refreshToken: session.refreshToken,
      clientId,
      signal: AbortSignal.timeout(15000),
      fetch: async (url, init) => {
        const response = await fetch(url, { ...init, cache: "no-store" })
        if (!response.ok) {
          const body = await response
            .clone()
            .json()
            .catch(() => ({}))
          terminal = [
            "invalid_grant",
            "invalid_token",
            "access_denied",
          ].includes(body.error)
        }
        return response
      },
    })
    if (tokens.accountId && tokens.accountId !== session.accountId) {
      terminal = true
      throw new Error("Account changed")
    }
    const expiresAt = new Date(
      Date.now() + Math.min(tokens.expiresIn ?? 3600, 3600) * 1000
    )
    const renewed = {
      ...session,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken || session.refreshToken,
      expiresAt: expiresAt.toISOString(),
    }
    const changed = await db
      .update(chatgptConnections)
      .set({
        credentials: encryptConnection(renewed, userId),
        expiresAt,
        revision: row.revision + 1,
        refreshLockUntil: null,
      })
      .where(condition)
      .returning()
    if (!changed.length) throw new Error("Connection changed")
    return renewed
  } catch {
    if (terminal) await db.delete(chatgptConnections).where(condition)
    else
      await db
        .update(chatgptConnections)
        .set({ refreshLockUntil: null })
        .where(condition)
    throw new ChatGPTConnectionError(
      terminal
        ? "ChatGPT access expired or was revoked. Reconnect in /api-keys."
        : "ChatGPT could not renew access. Retry shortly or reconnect."
    )
  }
}

export async function disconnectCommunityChatGPT(userId: string) {
  // Always remove locally, even when the experimental feature has been disabled.
  const row = await db.query.chatgptConnections.findFirst({
    where: ownedConnection(userId),
  })
  if (!row) return true
  let revoked = false
  try {
    const session = communitySessionSchema.parse(
      decryptConnection(row.credentials, userId)
    )
    const discovery = await fetch(
      "https://auth.openai.com/.well-known/openid-configuration",
      { signal: AbortSignal.timeout(10000) }
    ).then((r) => r.json())
    const endpoint = new URL(discovery.revocation_endpoint)
    if (endpoint.origin !== "https://auth.openai.com")
      throw new Error("Invalid revocation endpoint")
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        token: session.refreshToken,
        token_type_hint: "refresh_token",
        client_id: clientId,
      }),
      signal: AbortSignal.timeout(10000),
    })
    revoked = response.ok
  } catch {
    /* Report unconfirmed upstream revocation after deleting locally. */
  }
  await db
    .delete(chatgptConnections)
    .where(
      and(
        ownedConnection(userId),
        eq(chatgptConnections.revision, row.revision)
      )
    )
  return revoked
}
