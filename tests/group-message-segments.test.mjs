import assert from "node:assert/strict"
import test from "node:test"
import { groupMessageSegments } from "../lib/ai/group-message-segments.ts"

const ada = { id: "ada", name: "Ada", avatar: "ada-face" }
const reviewer = { id: "reviewer", name: "Codeee", avatar: "reviewer-face" }

test("handoff stays with sender and recipient text gets its own avatar", () => {
  const message = { id: "turn", role: "assistant", parts: [
    { type: "data-bot", id: "bot-ada", data: ada },
    { type: "text", text: "Let me hand this off." },
    { type: "tool-handoff", toolCallId: "handoff", state: "output-available", input: { botId: "reviewer", reason: "Code review" }, output: { botId: "reviewer", reason: "Code review" } },
    { type: "data-bot", id: "bot-reviewer", data: reviewer },
    { type: "text", text: "console.log is valid JavaScript." },
  ] }
  const segments = groupMessageSegments(message)
  assert.equal(segments.length, 2)
  assert.deepEqual(segments[0].parts[0].data, ada)
  assert.equal(segments[0].parts.at(-1).type, "tool-handoff")
  assert.deepEqual(segments[1].parts[0].data, reviewer)
  assert.equal(segments[1].parts.at(-1).text, "console.log is valid JavaScript.")
  assert.notEqual(segments[0].id, segments[1].id)
  assert.deepEqual(groupMessageSegments(JSON.parse(JSON.stringify(message))), segments)
})

test("a streaming recipient marker creates a separate segment without replacing the sender", () => {
  const parts = [{ type: "data-bot", data: ada }, { type: "text", text: "Handing off" }, { type: "data-bot", data: reviewer }]
  const segments = groupMessageSegments({ id: "stream", role: "assistant", parts })
  assert.equal(segments.length, 2)
  assert.equal(segments[0].parts[0].data.id, "ada")
  assert.equal(segments[1].parts[0].data.id, "reviewer")
})

test("user messages remain unchanged", () => {
  const user = { id: "user", role: "user", parts: [{ type: "text", text: "Review this" }] }
  assert.deepEqual(groupMessageSegments(user), [user])
})
