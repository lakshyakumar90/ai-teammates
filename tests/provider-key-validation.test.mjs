import assert from "node:assert/strict"
import test from "node:test"
import { validateProviderKey } from "../lib/ai/provider-key-validation.ts"

test("provider verification sends credentials only to the selected provider in headers", async () => {
  const original = globalThis.fetch
  const calls = []
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options })
    return Response.json({})
  }
  try {
    assert.equal(
      await validateProviderKey("gemini", "google-secret"),
      undefined
    )
    assert.equal(
      await validateProviderKey("openrouter", "router-secret"),
      undefined
    )
    assert.equal(await validateProviderKey("openai", "openai-secret"), undefined)
    assert.equal(calls[2].url, "https://api.openai.com/v1/models")
    assert.equal(calls[2].options.headers.Authorization, "Bearer openai-secret")
    assert.equal(
      calls[0].url,
      "https://generativelanguage.googleapis.com/v1beta/models"
    )
    assert.equal(calls[0].options.headers["x-goog-api-key"], "google-secret")
    assert.equal(calls[1].options.headers.Authorization, "Bearer router-secret")
    for (const call of calls) {
      assert.equal(call.options.cache, "no-store")
      assert.ok(call.options.signal instanceof AbortSignal)
      assert.ok(!call.url.includes("secret"))
    }
  } finally {
    globalThis.fetch = original
  }
})

test("invalid credentials, rate limits, provider failures, and network errors are safe and actionable", async () => {
  const original = globalThis.fetch
  try {
    for (const status of [400, 401, 403, 429, 500]) {
      globalThis.fetch = async () =>
        new Response("secret-value and private provider details", { status })
      const error = await validateProviderKey("gemini", "secret-value")
      assert.match(error, /Gemini/)
      assert.doesNotMatch(error, /secret-value|private provider/)
      assert.match(error, /try again|Try again/)
    }
    globalThis.fetch = async () => {
      throw new Error("private details")
    }
    assert.match(
      await validateProviderKey("openrouter", "secret-value"),
      /Could not reach OpenRouter/
    )
  } finally {
    globalThis.fetch = original
  }
})
