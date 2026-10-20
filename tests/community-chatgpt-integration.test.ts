import assert from "node:assert/strict"
import test from "node:test"
import { randomBytes } from "node:crypto"
import { eq, inArray } from "drizzle-orm"
import { db } from "../lib/db/client"
import { chatgptConnections } from "../lib/db/schema"
import {
  connectCommunityChatGPT,
  communityChatGPTSession,
  communityChatGPTStatus,
  disconnectCommunityChatGPT,
} from "../lib/community-chatgpt"
import {
  communityChatGPTModels,
  communityChatGPTModel,
} from "../lib/ai/community-chatgpt-model"
import { decryptConnection } from "../lib/connection-crypto"
import { redactAuthTelemetry } from "../lib/sentry-privacy"

test("community sessions validate upstream, isolate owners, rotate once, and preserve transient failures", async () => {
  const owners = [0, 1].map(() => `community-test-${crypto.randomUUID()}`)
  const previous = {
    enabled: process.env.CHATGPT_COMMUNITY_ENABLED,
    key: process.env.CONNECTION_ENCRYPTION_KEY,
  }
  process.env.CHATGPT_COMMUNITY_ENABLED = "true"
  process.env.CONNECTION_ENCRYPTION_KEY = randomBytes(32).toString("base64")
  const original = globalThis.fetch
  let refreshCalls = 0,
    failure = "",
    responseBody: Record<string, unknown> | undefined
  globalThis.fetch = async (input, init) => {
    const url = String(input)
    if (new URL(url).hostname.endsWith(".neon.tech"))
      return original(input, init)
    if (url === "https://auth.openai.com/oauth/token") {
      refreshCalls++
      if (failure)
        return Response.json(
          { error: failure },
          { status: failure === "server_error" ? 503 : 400 }
        )
      return Response.json({
        access_token: "renewed-access-token-long-enough",
        refresh_token: "renewed-refresh-token",
        expires_in: 3600,
      })
    }
    if (url.includes("/.well-known/openid-configuration"))
      return Response.json({
        revocation_endpoint: "https://auth.openai.com/revoke",
      })
    if (url === "https://auth.openai.com/revoke")
      return new Response(null, { status: 200 })
    assert.equal(new URL(url).origin, "https://chatgpt.com")
    const headers = new Headers(init?.headers)
    assert.ok(headers.get("authorization")?.startsWith("Bearer "))
    assert.equal(headers.get("chatgpt-account-id"), "account-a")
    if (headers.get("authorization")?.includes("invalid"))
      return new Response(null, { status: 401 })
    if (url.includes("/models?"))
      return Response.json({
        models: [
          {
            slug: "test-codex",
            display_name: "Test Codex",
            visibility: "list",
            supported_in_api: true,
            input_modalities: ["text", "image"],
          },
          { slug: "hidden", visibility: "hide" },
          { slug: "unsupported", supported_in_api: false },
        ],
      })
    assert.equal(url, "https://chatgpt.com/backend-api/codex/responses")
    responseBody = JSON.parse(String(init?.body))
    const toolCall = {
      type: "function_call",
      id: "fc_test",
      call_id: "call_test",
      name: "readMemory",
      arguments: "{}",
      status: "completed",
    }
    const events = [
      {
        type: "response.created",
        response: { id: "resp_test", created_at: 1, model: "test-codex" },
      },
      {
        type: "response.output_item.added",
        output_index: 0,
        item: { ...toolCall, arguments: "" },
      },
      {
        type: "response.function_call_arguments.delta",
        item_id: "fc_test",
        output_index: 0,
        delta: "{}",
      },
      { type: "response.output_item.done", output_index: 0, item: toolCall },
      {
        type: "response.completed",
        response: {
          id: "resp_test",
          created_at: 1,
          model: "test-codex",
          status: "completed",
          output: [toolCall],
          usage: { input_tokens: 1, output_tokens: 0, total_tokens: 1 },
        },
      },
    ]
    return new Response(
      events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(""),
      { headers: { "content-type": "text/event-stream" } }
    )
  }
  const session = {
    accessToken: "original-access-token-long-enough",
    refreshToken: "original-refresh-token",
    accountId: "account-a",
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
  }
  try {
    await assert.rejects(
      connectCommunityChatGPT(owners[0], {
        ...session,
        accessToken: "invalid-access-token-long-enough",
      })
    )
    assert.equal((await communityChatGPTStatus(owners[0])).connected, false)
    await connectCommunityChatGPT(owners[0], session)
    await assert.rejects(communityChatGPTSession(owners[1]), /Connect ChatGPT/)
    const row = await db.query.chatgptConnections.findFirst({
      where: eq(chatgptConnections.userId, owners[0]),
    })
    assert.ok(row)
    assert.ok(!row.credentials.includes(session.accessToken))
    assert.throws(() => decryptConnection(row.credentials, owners[1]))
    const models = await communityChatGPTModels(owners[0])
    assert.deepEqual(
      models.map((m) => [m.id, m.supportsImages]),
      [["chatgpt-community:test-codex", true]]
    )
    const result = await communityChatGPTModel(
      owners[0],
      "test-codex"
    ).doStream({
      prompt: [
        { role: "system", content: "Be helpful" },
        { role: "user", content: [{ type: "text", text: "Hello" }] },
      ],
      providerOptions: { openai: { store: true } },
      tools: [
        {
          type: "function",
          name: "readMemory",
          description: "Read memory",
          inputSchema: { type: "object", properties: {} },
        },
      ],
    })
    const reader = result.stream.getReader()
    const parts = []
    while (true) {
      const next = await reader.read()
      if (next.done) break
      parts.push(next.value)
    }
    assert.ok(
      parts.some(
        (part) => part.type === "tool-call" && part.toolName === "readMemory"
      ),
      JSON.stringify(parts)
    )
    assert.ok(
      !parts.some((part) => part.type === "error"),
      JSON.stringify(parts)
    )
    assert.equal(responseBody?.store, false)
    assert.equal(responseBody?.stream, true)
    assert.equal(responseBody?.previous_response_id, undefined)
    assert.ok(responseBody?.tools || responseBody?.additional_tools)
    await db
      .update(chatgptConnections)
      .set({ expiresAt: new Date(0) })
      .where(eq(chatgptConnections.userId, owners[0]))
    const outcomes = await Promise.allSettled([
      communityChatGPTSession(owners[0]),
      communityChatGPTSession(owners[0]),
    ])
    assert.ok(outcomes.some((outcome) => outcome.status === "fulfilled"))
    assert.equal(refreshCalls, 1)
    assert.equal(
      (await communityChatGPTSession(owners[0])).refreshToken,
      "renewed-refresh-token"
    )
    failure = "server_error"
    await db
      .update(chatgptConnections)
      .set({ expiresAt: new Date(0) })
      .where(eq(chatgptConnections.userId, owners[0]))
    await assert.rejects(communityChatGPTSession(owners[0]), /could not renew/)
    assert.equal((await communityChatGPTStatus(owners[0])).connected, true)
    failure = "invalid_grant"
    await assert.rejects(communityChatGPTSession(owners[0]), /revoked/)
    assert.equal((await communityChatGPTStatus(owners[0])).connected, false)
    failure = ""
    await connectCommunityChatGPT(owners[0], session)
    assert.equal(await disconnectCommunityChatGPT(owners[1]), true)
    assert.equal((await communityChatGPTStatus(owners[0])).connected, true)
    assert.equal(await disconnectCommunityChatGPT(owners[0]), true)
    assert.equal((await communityChatGPTStatus(owners[0])).connected, false)
  } finally {
    globalThis.fetch = original
    await db
      .delete(chatgptConnections)
      .where(inArray(chatgptConnections.userId, owners))
    if (previous.enabled === undefined)
      delete process.env.CHATGPT_COMMUNITY_ENABLED
    else process.env.CHATGPT_COMMUNITY_ENABLED = previous.enabled
    if (previous.key === undefined) delete process.env.CONNECTION_ENCRYPTION_KEY
    else process.env.CONNECTION_ENCRYPTION_KEY = previous.key
  }
})

test("auth telemetry removes callback codes and token fields", () => {
  const result = redactAuthTelemetry({
    request: {
      url: "https://example.test/api-keys?code=private&state=nonce",
      data: { refreshToken: "secret" },
    },
    headers: { Authorization: "Bearer private" },
  })
  assert.ok(!JSON.stringify(result).includes("private"))
  assert.ok(!JSON.stringify(result).includes("secret"))
})
