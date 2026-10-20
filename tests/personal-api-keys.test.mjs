import assert from "node:assert/strict"
import test from "node:test"
// Models module has no database or Clerk dependency.
import { getModel } from "../lib/ai/models.ts"
import { apiKeySchema } from "../lib/api-key-schema.ts"

test("personal provider credentials stay isolated across model instances", async () => {
  const original = globalThis.fetch
  const seen = []
  globalThis.fetch = async (url, init) => {
    const headers = new Headers(init.headers)
    seen.push(headers.get("authorization") ?? headers.get("x-goog-api-key"))
    if (String(url).includes("googleapis.com"))
      return Response.json({
        candidates: [
          {
            content: { role: "model", parts: [{ text: "OK" }] },
            finishReason: "STOP",
          },
        ],
        usageMetadata: {
          promptTokenCount: 1,
          candidatesTokenCount: 1,
          totalTokenCount: 2,
        },
      })
    return Response.json({
      id: "response",
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: "OK" },
          finish_reason: "stop",
        },
      ],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    })
  }
  try {
    const a = getModel("gemini-3-flash", "google-user-a")
    const b = getModel("gemini-3-flash", "google-user-b")
    const c = getModel("openrouter-dots-3-note", "router-user-a")
    const d = getModel("openrouter-dots-3-note", "router-user-b")
    const request = {
      prompt: [{ role: "user", content: [{ type: "text", text: "Hello" }] }],
    }
    for (const model of [a, b, a, c, d, c]) await model.doGenerate(request)
    assert.deepEqual(seen, [
      "google-user-a",
      "google-user-b",
      "google-user-a",
      "Bearer router-user-a",
      "Bearer router-user-b",
      "Bearer router-user-a",
    ])
  } finally {
    globalThis.fetch = original
  }
})

test("personal keys select the configured model without server provider credentials", () => {
  const original = [
    process.env.GOOGLE_GENERATIVE_AI_API_KEY,
    process.env.OPENROUTER_API_KEY,
  ]
  delete process.env.GOOGLE_GENERATIVE_AI_API_KEY
  delete process.env.OPENROUTER_API_KEY
  try {
    assert.equal(
      getModel("gemini-3-flash", "personal-google").modelId,
      "gemini-3-flash-preview"
    )
    assert.equal(
      getModel("openrouter-dots-3-note", "personal-openrouter").modelId,
      "dots-studio/dots-3-note-preview:free"
    )
    assert.throws(
      () => getModel("gemini-3-flash"),
      /Add your Google Gemini API key/
    )
    assert.throws(
      () => getModel("openrouter-dots-3-note"),
      /Add your OpenRouter API key/
    )
    assert.throws(() => getModel("unknown", "key"), /Unknown model/)
  } finally {
    for (const [index, name] of [
      "GOOGLE_GENERATIVE_AI_API_KEY",
      "OPENROUTER_API_KEY",
    ].entries()) {
      if (original[index] === undefined) delete process.env[name]
      else process.env[name] = original[index]
    }
  }
})

test("key input accepts supported providers and rejects blanks, whitespace, and oversized secrets", () => {
  assert.equal(
    apiKeySchema.parse({ provider: "gemini", key: "  example-key  " }).key,
    "example-key"
  )
  for (const input of [
    { provider: "other", key: "key" },
    { provider: "gemini", key: " " },
    { provider: "openrouter", key: "key with spaces" },
    { provider: "gemini", key: "x".repeat(513) },
  ])
    assert.equal(apiKeySchema.safeParse(input).success, false)
})
