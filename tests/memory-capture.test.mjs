import assert from "node:assert/strict"
import test from "node:test"
import { MockLanguageModelV4 } from "ai/test"
import {
  captureUserMemory,
  groundedMemoryFacts,
  memoryConversation,
} from "../lib/ai/memory-capture.ts"
const messages = [
  { role: "user", content: "hey do u know my dog name ?" },
  { role: "assistant", content: "Could you tell me what it is?" },
  { role: "user", content: "its inu" },
]
const usage = {
  inputTokens: { total: 1, noCache: 1 },
  outputTokens: { total: 1, text: 1 },
}

test("short replies are captured using the question's context without requiring a write tool", async () => {
  const model = new MockLanguageModelV4({
    doGenerate: {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            facts: [
              {
                scope: "global",
                key: "dog_name",
                value: "Inu",
                evidence: "inu",
              },
            ],
          }),
        },
      ],
      finishReason: { unified: "stop" },
      usage,
    },
  })
  const facts = await captureUserMemory({
    model,
    messages,
    signal: new AbortController().signal,
  })
  assert.deepEqual(facts, [{ scope: "global", key: "dog_name", value: "Inu" }])
  assert.match(
    JSON.stringify(model.doGenerateCalls[0].prompt),
    /hey do u know my dog name/
  )
  assert.equal(memoryConversation(messages).latestUser, "its inu")
})

test("unsubstantiated values and evidence cannot be saved", () => {
  assert.deepEqual(
    groundedMemoryFacts(
      [{ scope: "global", key: "dog_name", value: "Fido", evidence: "inu" }],
      "its inu"
    ),
    []
  )
  assert.deepEqual(
    groundedMemoryFacts(
      [{ scope: "global", key: "dog_name", value: "Inu", evidence: "inu" }],
      "What is my dog's name?"
    ),
    []
  )
  assert.deepEqual(
    groundedMemoryFacts(
      [
        {
          scope: "global",
          key: "dog_name",
          value: "[forgotten]",
          evidence: "inu",
        },
      ],
      "its inu"
    ),
    []
  )
})

test("questions supply no new memory facts", async () => {
  const model = new MockLanguageModelV4({
    doGenerate: {
      content: [{ type: "text", text: '{"facts":[]}' }],
      finishReason: { unified: "stop" },
      usage,
    },
  })
  assert.deepEqual(
    await captureUserMemory({
      model,
      messages: [messages[0]],
      signal: new AbortController().signal,
    }),
    []
  )
})
