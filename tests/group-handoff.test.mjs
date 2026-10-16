import assert from "node:assert/strict"
import test from "node:test"
import { createGroupHandoffTools } from "../lib/ai/group-handoff.ts"
import { buildGroupBotInstructions } from "../lib/ai/bot-instructions.ts"

const members = [
  { id: "research", name: "Ada", job: "Research", instructions: "Cite evidence", sandboxId: null },
  { id: "writing", name: "Grace", job: "Writing", instructions: "Write clearly", sandboxId: null },
]
const options = { toolCallId: "test", messages: [] }

test("handoff transfers to a group member once and prevents loops", async () => {
  const { handoff } = createGroupHandoffTools(members, "research")
  assert.deepEqual(await handoff.execute({ botId: "writing", reason: "Editing request" }, options), { botId: "writing", reason: "Editing request" })
  await assert.rejects(() => handoff.execute({ botId: "research", reason: "Back" }, options), /already been handed off/)
})

test("invalid targets and self handoffs do not consume the transfer", async () => {
  const { handoff } = createGroupHandoffTools(members, "research")
  await assert.rejects(() => handoff.execute({ botId: "outsider", reason: "Wrong" }, options), /group roster/)
  await assert.rejects(() => handoff.execute({ botId: "research", reason: "Self" }, options), /not yourself/)
  assert.equal((await handoff.execute({ botId: "writing", reason: "Writing" }, options)).botId, "writing")
})

test("group instructions describe members, available tools, and recipient identity", () => {
  const initial = buildGroupBotInstructions(members[0], members)
  assert.match(initial, /group chat/)
  assert.match(initial, /only available tool is handoff/)
  assert.match(initial, /Writing/)
  assert.match(initial, /no command, file, browser, or desktop tools/)
  const recipient = buildGroupBotInstructions(members[1], members, { from: "Ada", reason: "Editing request" })
  assert.match(recipient, /You are "Grace"/)
  assert.match(recipient, /No further handoff/)
  assert.match(recipient, /Write clearly/)
})
