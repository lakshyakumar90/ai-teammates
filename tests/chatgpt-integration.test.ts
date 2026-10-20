import assert from "node:assert/strict"
import test from "node:test"
import { randomBytes } from "node:crypto"
import { generateKeyPair, exportJWK, SignJWT } from "jose"
import { eq } from "drizzle-orm"
import { db } from "../lib/db/client"
import { chatgptConnections, oauthAttempts } from "../lib/db/schema"
import {
  beginChatGPT,
  finishChatGPT,
  chatGPTAccessToken,
  disconnectChatGPT,
} from "../lib/chatgpt"
import { decryptConnection } from "../lib/connection-crypto"

test("OAuth consumes owner-bound attempts, validates identity, and serializes rotating refreshes", async () => {
  const owner = `oauth-test-${crypto.randomUUID()}`
  const names = [
    "CHATGPT_HOSTED_ENABLED",
    "CHATGPT_CLIENT_ID",
    "CHATGPT_CLIENT_SECRET",
    "CHATGPT_REDIRECT_URI",
    "CONNECTION_ENCRYPTION_KEY",
  ]
  const previous = Object.fromEntries(
    names.map((name) => [name, process.env[name]])
  )
  Object.assign(process.env, {
    CHATGPT_HOSTED_ENABLED: "true",
    CHATGPT_CLIENT_ID: "oaiapp_test",
    CHATGPT_CLIENT_SECRET: "private:test secret",
    CHATGPT_REDIRECT_URI:
      "https://app.example/api/connections/chatgpt/callback",
    CONNECTION_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
  })
  const originalFetch = globalThis.fetch
  const keys = await generateKeyPair("RS256")
  const publicKey = await exportJWK(keys.publicKey)
  let nonce = "",
    idToken = "",
    refreshCalls = 0
  let failRevocation = false
  globalThis.fetch = async (input, init) => {
    const url = String(input)
    if (new URL(url).hostname.endsWith(".neon.tech"))
      return originalFetch(input, init)
    if (url.endsWith("/.well-known/openid-configuration"))
      return Response.json({
        issuer: "https://auth.openai.com",
        jwks_uri: "https://auth.openai.com/.well-known/jwks.json",
        revocation_endpoint: "https://auth.openai.com/revoke",
      })
    if (url.endsWith("/.well-known/jwks.json"))
      return Response.json({
        keys: [{ ...publicKey, kid: "test", alg: "RS256", use: "sig" }],
      })
    if (url.endsWith("/revoke")) {
      if (failRevocation) throw new Error("network unavailable")
      return new Response(null, { status: 200 })
    }
    assert.equal(url, "https://auth.openai.com/api/accounts/oauth/token")
    const body = new URLSearchParams(String(init?.body))
    assert.equal(
      body.has("client_secret"),
      false,
      "confidential secrets belong only in HTTP Basic authorization"
    )
    const header = new Headers(init?.headers).get("authorization")
    assert.ok(header?.startsWith("Basic "))
    assert.equal(
      Buffer.from(header!.slice(6), "base64").toString(),
      "oaiapp_test:private%3Atest+secret"
    )
    if (body.get("grant_type") === "refresh_token") {
      refreshCalls++
      assert.equal(body.get("refresh_token"), "refresh-original")
      return Response.json({
        access_token: "access-renewed",
        refresh_token: "refresh-replacement",
        expires_in: 3600,
        token_type: "Bearer",
        scope: "openid chatgpt.tokens.use.direct",
      })
    }
    assert.equal(body.get("code"), "test-code")
    assert.ok(body.get("code_verifier"))
    return Response.json({
      access_token: "access-original",
      refresh_token: "refresh-original",
      id_token: idToken,
      expires_in: 3600,
      token_type: "Bearer",
      scope: "openid chatgpt.tokens.use.direct",
    })
  }
  try {
    const attempt = await beginChatGPT(owner)
    const url = new URL(attempt.url)
    assert.equal(url.searchParams.get("code_challenge_method"), "S256")
    nonce = url.searchParams.get("nonce")!
    idToken = await new SignJWT({ nonce, email: "test@example.com" })
      .setProtectedHeader({ alg: "RS256", kid: "test" })
      .setIssuer("https://auth.openai.com")
      .setAudience("oaiapp_test")
      .setSubject("verified-test-subject")
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(keys.privateKey)
    await assert.rejects(
      finishChatGPT("different-owner", attempt.state, "test-code"),
      /Expired/
    )
    await finishChatGPT(owner, attempt.state, "test-code")
    await assert.rejects(
      finishChatGPT(owner, attempt.state, "test-code"),
      /Expired/
    )
    const row = await db.query.chatgptConnections.findFirst({
      where: eq(chatgptConnections.userId, owner),
    })
    assert.equal(row?.subject, "verified-test-subject")
    assert.ok(!row?.credentials.includes("refresh-original"))
    assert.equal(await chatGPTAccessToken(owner), "access-original")
    await assert.rejects(chatGPTAccessToken("different-owner"), /Connect/)
    await db
      .update(chatgptConnections)
      .set({ expiresAt: new Date(0) })
      .where(eq(chatgptConnections.userId, owner))
    const results = await Promise.allSettled(
      Array.from({ length: 8 }, () => chatGPTAccessToken(owner))
    )
    assert.equal(
      refreshCalls,
      1,
      "one token rotation across concurrent processes"
    )
    assert.ok(
      results.some(
        (result) =>
          result.status === "fulfilled" && result.value === "access-renewed"
      )
    )
    const renewed = await db.query.chatgptConnections.findFirst({
      where: eq(chatgptConnections.userId, owner),
    })
    assert.equal(
      decryptConnection<{ refresh_token: string }>(renewed!.credentials, owner)
        .refresh_token,
      "refresh-replacement"
    )
    // A temporary outage preserves valid tokens; disconnect explicitly clears them.
    failRevocation = true
    assert.equal(await disconnectChatGPT(owner), false)
    assert.equal(
      await db.query.chatgptConnections.findFirst({
        where: eq(chatgptConnections.userId, owner),
      }),
      undefined
    )
  } finally {
    globalThis.fetch = originalFetch
    for (const name of names) {
      if (previous[name] === undefined) delete process.env[name]
      else process.env[name] = previous[name]
    }
    await db.delete(oauthAttempts).where(eq(oauthAttempts.userId, owner))
    await db
      .delete(chatgptConnections)
      .where(eq(chatgptConnections.userId, owner))
  }
})
