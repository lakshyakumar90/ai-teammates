import assert from "node:assert/strict"
import test from "node:test"
import { DaytonaError } from "@daytona/sdk"
import { APICallError } from "ai"
import { chatErrorMessage } from "../lib/ai/chat-error.ts"

test("sandbox packaging failures explain that changing models cannot fix them", () => {
  const message = chatErrorMessage(
    new DaytonaError(
      'Module "busboy" is not available in the "node" runtime: Cannot find module busboy'
    )
  )
  assert.match(message, /required server dependency/)
  assert.match(message, /changing models will not fix/)
  assert.doesNotMatch(message, /busboy|Require stack/)
})

test("sandbox errors do not expose internal URLs or credentials", () => {
  const message = chatErrorMessage(
    new DaytonaError("request failed: https://private.example?token=secret")
  )
  assert.match(message, /Daytona.*bot environment/)
  assert.doesNotMatch(message, /private.example|secret|choose another model/)
})

test("OpenRouter HTTP-200 upstream failures use the provider status", () => {
  const message = chatErrorMessage(
    new APICallError({
      message: "Invalid JSON response",
      url: "https://openrouter.ai/api/v1/chat/completions",
      requestBodyValues: {},
      statusCode: 200,
      responseBody: JSON.stringify({
        error: {
          code: 503,
          message: "Upstream error from Nvidia: Service temporarily overloaded",
        },
      }),
    })
  )
  assert.match(message, /OpenRouter \(HTTP 503\)/)
  assert.match(message, /temporarily unavailable/)
  assert.doesNotMatch(message, /API key|HTTP 200/)
})
