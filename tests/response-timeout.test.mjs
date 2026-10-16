import assert from "node:assert/strict"
import test from "node:test"
import { streamText } from "ai"
import { MockLanguageModelV4 } from "ai/test"
import { responseTimeoutPolicy } from "../lib/ai/response-timeout.ts"

function stalledModel() {
  return new MockLanguageModelV4({
    doStream: ({ abortSignal }) =>
      new Promise((resolve, reject) => {
        const abort = () => reject(abortSignal.reason)
        if (abortSignal.aborted) abort()
        else abortSignal.addEventListener("abort", abort, { once: true })
      }),
  })
}

test("a stalled provider triggers a visible timeout error", async () => {
  const errors = []
  const result = streamText({
    model: stalledModel(),
    prompt: "Hello",
    ...responseTimeoutPolicy({
      signal: new AbortController().signal,
      provider: "OpenRouter",
      onTimeout: (message) => errors.push(message),
    }),
    timeout: { stepMs: 20 },
    maxRetries: 0,
  })
  await result.consumeStream()
  assert.equal(errors.length, 1)
  assert.match(errors[0], /OpenRouter did not respond in time/)
  assert.match(errors[0], /select another model/)
})

test("pressing Stop does not report a provider timeout", async () => {
  const errors = [],
    controller = new AbortController()
  const result = streamText({
    model: stalledModel(),
    prompt: "Hello",
    abortSignal: controller.signal,
    ...responseTimeoutPolicy({
      signal: controller.signal,
      provider: "OpenRouter",
      onTimeout: (message) => errors.push(message),
    }),
    maxRetries: 0,
  })
  const consuming = result.consumeStream()
  controller.abort()
  await consuming
  assert.deepEqual(errors, [])
})
