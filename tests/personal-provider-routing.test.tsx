import { beforeEach, expect, it, vi } from "vitest"
import { randomBytes } from "node:crypto"

const backend = vi.hoisted(() => ({ keys: vi.fn(), paid: vi.fn() }))
vi.mock("@/lib/ai/user-api-keys", () => ({ getUserApiKeys: backend.keys }))
vi.mock("@/lib/billing-agent", () => ({ requireUserPaidPlan: backend.paid }))
vi.mock("@/lib/chatgpt", () => ({
  chatGPTAccessToken: vi.fn(),
  chatGPTEnabled: () => false,
  chatGPTStatus: vi.fn(),
  ChatGPTConnectionError: class extends Error {},
}))
vi.mock("@/lib/community-chatgpt", () => ({
  communityChatGPTEnabled: () => false,
  communityChatGPTStatus: vi.fn(),
  communityChatGPTSession: vi.fn(),
  communityCatalog: vi.fn(),
  communityTransport: vi.fn(),
}))

import { getModel } from "@/lib/ai/models"
import { meteredModel } from "@/lib/ai/usage-model"
import {
  chatGPTRequestBody,
  verifiedChatGPTResponse,
} from "@/lib/ai/chatgpt-model"
import { decryptConnection, encryptConnection } from "@/lib/connection-crypto"

beforeEach(() => {
  backend.paid.mockResolvedValue({})
  backend.keys.mockResolvedValue({})
})

it("refuses environment credentials and checks ownership before resolving a personal key", async () => {
  vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "app-google-secret")
  vi.stubEnv("OPENROUTER_API_KEY", "app-router-secret")
  vi.stubEnv("OPENAI_API_KEY", "app-openai-secret")
  for (const id of [
    "gemini-3-flash",
    "openrouter-dots-3-note",
    "openai-gpt-6.1-sol",
  ]) {
    expect(() => getModel(id)).toThrow(/Add your/)
    await expect(meteredModel(id, "owner-a")).rejects.toThrow(/Add your/)
  }
  expect(backend.keys).toHaveBeenCalledWith("owner-a")
  backend.keys.mockClear()
  backend.paid.mockRejectedValueOnce(new Error("subscription ended"))
  await expect(meteredModel("gemini-3-flash", "owner-b")).rejects.toThrow(
    "subscription ended"
  )
  expect(backend.keys).not.toHaveBeenCalled()
  vi.unstubAllEnvs()
})

it("uses the selected user's OpenAI credential for every underlying request", async () => {
  const calls: { url: string; authorization: string | null }[] = []
  const original = globalThis.fetch
  globalThis.fetch = vi.fn(async (url, init) => {
    calls.push({
      url: String(url),
      authorization: new Headers(init?.headers).get("authorization"),
    })
    return new Response("data: [DONE]\n\n", {
      headers: { "content-type": "text/event-stream" },
    })
  }) as typeof fetch
  try {
    backend.keys.mockImplementation(async (userId: string) => ({
      openai: `key-${userId}`,
    }))
    for (const owner of ["a", "b"]) {
      const model = await meteredModel("openai-gpt-6.1-sol", owner)
      const result = await model.doStream({
        prompt: [{ role: "user", content: [{ type: "text", text: "Hello" }] }],
      })
      await result.stream.cancel()
    }
    expect(calls.map((call) => call.authorization)).toEqual([
      "Bearer key-a",
      "Bearer key-b",
    ])
    expect(
      calls.every((call) => call.url === "https://api.openai.com/v1/responses")
    ).toBe(true)
    expect(backend.paid).toHaveBeenCalledTimes(4)
  } finally {
    globalThis.fetch = original
  }
})

it("enforces ChatGPT streaming requirements and packages app tools in a namespace", () => {
  const result = chatGPTRequestBody({
    model: "account-model",
    store: true,
    stream: false,
    temperature: 0.5,
    max_output_tokens: 2048,
    previous_response_id: "old",
    input: [
      { role: "system", content: "Instructions" },
      { role: "user", content: "Hello" },
    ],
    tools: [
      {
        type: "function",
        name: "readMemory",
        parameters: { type: "object", properties: {} },
      },
    ],
  })
  expect(result).toMatchObject({
    store: false,
    stream: true,
    instructions: "Instructions",
    tools: [{ type: "namespace", name: "ai_teammates" }],
  })
  expect(result).not.toHaveProperty("max_output_tokens")
  expect(result).not.toHaveProperty("previous_response_id")
  expect(result).not.toHaveProperty("temperature")
  expect(result.input).toEqual([{ role: "user", content: "Hello" }])
  expect(() =>
    chatGPTRequestBody({ input: [], tools: [{ type: "computer" }] })
  ).toThrow(/Unsupported/)
})

it("rejects truncated or failed ChatGPT streams and accepts a terminal completed event", async () => {
  for (const event of [
    "response.output_text.delta",
    "response.failed",
    "response.incomplete",
  ]) {
    const response = verifiedChatGPTResponse(
      new Response(`data: {"type":"${event}"}\n\n`)
    )
    await expect(response.text()).rejects.toThrow(/ChatGPT/)
  }
  const response = verifiedChatGPTResponse(
    new Response('data: {"type":"response.completed"}\n\n')
  )
  await expect(response.text()).resolves.toContain("response.completed")
})

it("encrypts credentials with authentication bound to their owner", () => {
  vi.stubEnv("CONNECTION_ENCRYPTION_KEY", randomBytes(32).toString("base64"))
  const stored = encryptConnection(
    { access_token: "private-access", refresh_token: "private-refresh" },
    "owner-a"
  )
  expect(stored).not.toContain("private")
  expect(decryptConnection(stored, "owner-a")).toEqual({
    access_token: "private-access",
    refresh_token: "private-refresh",
  })
  expect(() => decryptConnection(stored, "owner-b")).toThrow()
  expect(() =>
    decryptConnection(stored.slice(0, -4) + "AAAA", "owner-a")
  ).toThrow()
  vi.unstubAllEnvs()
})
