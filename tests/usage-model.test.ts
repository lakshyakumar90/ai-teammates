import assert from "node:assert/strict"
import test from "node:test"
import { generateText, wrapLanguageModel } from "ai"
import { MockLanguageModelV4 } from "ai/test"
import { personalModelMiddleware } from "../lib/ai/usage-model"

const usage = {
  inputTokens: { total: 100, noCache: 100, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 20, text: 10, reasoning: 10 },
}
const finishReason = { unified: "stop" as const, raw: "stop" }

test("personal model middleware checks every request without reserving or charging AI credits", async () => {
  let checks = 0
  const base = new MockLanguageModelV4({
    doGenerate: {
      content: [{ type: "text", text: "ok" }],
      finishReason,
      usage,
      warnings: [],
    },
  })
  const model = wrapLanguageModel({
    model: base,
    middleware: personalModelMiddleware(async () => {
      checks++
    }),
  })
  await generateText({ model, prompt: "first", maxRetries: 0 })
  await generateText({ model, prompt: "second", maxRetries: 0 })
  assert.equal(checks, 2)
  const denied = wrapLanguageModel({
    model: base,
    middleware: personalModelMiddleware(async () => {
      throw new Error("subscription ended")
    }),
  })
  await assert.rejects(
    generateText({ model: denied, prompt: "denied", maxRetries: 0 }),
    /subscription ended/
  )
  assert.equal(base.doGenerateCalls.length, 2)
})
