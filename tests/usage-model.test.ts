import assert from "node:assert/strict"
import test from "node:test"
import { generateText, streamText, wrapLanguageModel } from "ai"
import { MockLanguageModelV4 } from "ai/test"
import { createUsageMiddleware } from "../lib/ai/usage-model"

const usage = {
  inputTokens: { total: 100, noCache: 100, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 20, text: 10, reasoning: 10 },
}
const finishReason = { unified: "stop" as const, raw: "stop" }

test("AI middleware reserves before provider calls and records generate and stream usage", async () => {
  const order: string[] = []
  const settled: unknown[][] = []
  const middleware = createUsageMiddleware({
    reserve: async () => {
      order.push("reserve")
      return "reservation"
    },
    rate: { input: 0.5, output: 3 },
    settle: async (...args) => {
      settled.push(args)
    },
  })
  const base = new MockLanguageModelV4({
    doGenerate: async () => {
      order.push("provider")
      return {
        content: [{ type: "text", text: "hello" }],
        finishReason,
        usage,
        warnings: [],
      }
    },
    doStream: async () => {
      order.push("provider")
      return {
        stream: new ReadableStream({
          start(controller) {
            controller.enqueue({ type: "text-start", id: "text" })
            controller.enqueue({
              type: "text-delta",
              id: "text",
              delta: "hello",
            })
            controller.enqueue({ type: "text-end", id: "text" })
            controller.enqueue({ type: "finish", finishReason, usage })
            controller.close()
          },
        }),
        warnings: [],
      }
    },
  })
  const model = wrapLanguageModel({ model: base, middleware })
  assert.equal(
    (await generateText({ model, prompt: "hello", maxRetries: 0 })).text,
    "hello"
  )
  const stream = streamText({ model, prompt: "hello", maxRetries: 0 })
  assert.equal(await stream.text, "hello")
  assert.deepEqual(order, ["reserve", "provider", "reserve", "provider"])
  assert.deepEqual(settled, [
    ["reservation", 110, 100, 20],
    ["reservation", 110, 100, 20],
  ])
  assert.equal(base.doGenerateCalls[0].maxOutputTokens, undefined)
})

test("exhausted allowance prevents provider calls; failed calls retain reservations", async () => {
  let calls = 0,
    debits = 0,
    settlements = 0
  const base = new MockLanguageModelV4({
    doGenerate: async () => {
      calls++
      throw new Error("provider disconnected")
    },
  })
  const model = (denied: boolean) =>
    wrapLanguageModel({
      model: base,
      middleware: createUsageMiddleware({
        reserve: async () => {
          if (denied) throw new Error("allowance reached")
          debits++
          return "entry"
        },
        settle: async () => {
          settlements++
        },
        rate: { input: 1, output: 1 },
      }),
    })
  await assert.rejects(
    generateText({ model: model(true), prompt: "hello", maxRetries: 0 }),
    /allowance/
  )
  assert.equal(calls, 0)
  await assert.rejects(
    generateText({ model: model(false), prompt: "hello", maxRetries: 0 }),
    /disconnected/
  )
  assert.equal(debits, 1)
  assert.equal(settlements, 0)
})

test("large conversations, screenshots, and explicit output budgets reach the provider", async () => {
  let reserved = 0
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
    middleware: createUsageMiddleware({
      reserve: async () => {
        reserved++
        return "entry"
      },
      settle: async () => {},
      rate: { input: 1, output: 1 },
    }),
  })
  const largePrompt = "a".repeat(150000)
  await generateText({
    model,
    prompt: largePrompt,
    maxOutputTokens: 16384,
    maxRetries: 0,
  })
  assert.equal(base.doGenerateCalls[0].maxOutputTokens, 16384)
  assert.match(
    JSON.stringify(base.doGenerateCalls[0].prompt),
    new RegExp("a{150000}")
  )
  const image = {
    type: "file" as const,
    mediaType: "image/png",
    data: { type: "data" as const, data: new Uint8Array(1000000) },
  }
  await model.doGenerate({
    prompt: [{ role: "user", content: [image, image, image, image] }],
  })
  assert.equal(base.doGenerateCalls[1].prompt[0].content.length, 4)
  assert.equal(reserved, 2)
})
