import assert from "node:assert/strict"
import test from "node:test"
import { models, modelOptions } from "../lib/ai/models"

test("OpenRouter exposes only verified free models and accurate image capability", () => {
  const entries = Object.entries(models).filter(
    ([, entry]) => entry.provider === "OpenRouter"
  )
  assert.deepEqual(
    entries.map(([, entry]) => entry.model.modelId).sort(),
    [
      "dots-studio/dots-3-note-preview:free",
      "liquid/lfm-2.5-2.6b:free",
      "nvidia/nemotron-3-super-120b-a12b:free",
    ].sort()
  )
  assert.equal(
    modelOptions.filter(
      (entry) => entry.provider === "OpenRouter" && entry.supportsImages
    ).length,
    1
  )
  assert.equal(models["openrouter-dots-3-note"].supportsImages, true)
})

test("OpenRouter sends strict memory schemas, image tool content, and stream usage options", async () => {
  const original = globalThis.fetch
  const requests: Record<string, any>[] = []
  globalThis.fetch = async (_url, init) => {
    const request = JSON.parse(String(init?.body))
    requests.push(request)
    if (request.stream)
      return new Response("data: [DONE]\n\n", {
        headers: { "content-type": "text/event-stream" },
      })
    return Response.json({
      id: "synthetic-response",
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
    const model = models["openrouter-dots-3-note"].model
    await model.doGenerate({
      prompt: [
        { role: "user", content: [{ type: "text", text: "Extract memory" }] },
      ],
      responseFormat: {
        type: "json",
        schema: {
          type: "object",
          properties: { facts: { type: "array", items: { type: "string" } } },
          required: ["facts"],
          additionalProperties: false,
        },
      },
    })
    assert.equal(requests[0].response_format.type, "json_schema")
    assert.equal(requests[0].response_format.json_schema.strict, true)
    assert.ok(requests[0].response_format.json_schema.schema.properties.facts)
    await model.doGenerate({
      prompt: [
        {
          role: "tool",
          content: [
            {
              type: "tool-result",
              toolCallId: "synthetic-call",
              toolName: "screen",
              output: {
                type: "content",
                value: [
                  {
                    type: "file",
                    mediaType: "image/png",
                    data: { type: "data", data: "AA==" },
                  },
                ],
              },
            },
          ],
        },
      ],
    })
    assert.ok(Array.isArray(requests[1].messages[0].content))
    assert.equal(requests[1].messages[0].content[0].type, "image_url")
    const result = await model.doStream({
      prompt: [{ role: "user", content: [{ type: "text", text: "Hello" }] }],
    })
    assert.deepEqual(requests[2].stream_options, { include_usage: true })
    await result.stream.cancel()
  } finally {
    globalThis.fetch = original
  }
})
