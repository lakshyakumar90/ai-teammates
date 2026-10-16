import assert from "node:assert/strict"
import test from "node:test"
import {
  createMemoryManager,
  createRoutedMemoryTools,
  defaultMemoryPreferences,
} from "../lib/ai/memory-manager.ts"

const options = { toolCallId: "memory", messages: [] }
function world() {
  const sources = new Map()
  const writes = []
  function manager(user, chat, bot, group, overrides = {}) {
    const identity = (scope) =>
      scope === "global"
        ? `user:${user}`
        : scope === "group"
          ? `group:${chat}`
          : `bot:${bot}`
    return createMemoryManager({
      group,
      preferences: { ...defaultMemoryPreferences, ...overrides },
      store: {
        read: async (scope) =>
          [...(sources.get(identity(scope)) ?? new Map())]
            .map(([key, value]) => `- ${key}: ${value}`)
            .join("\n"),
        write: async (scope, facts) => {
          writes.push({ scope, bot, facts })
          const entries = sources.get(identity(scope)) ?? new Map()
          for (const { key, value } of facts) {
            if (value === "[forgotten]") entries.delete(key)
            else entries.set(key, value)
          }
          sources.set(identity(scope), entries)
        },
      },
    })
  }
  return { manager, sources, writes }
}

test("group personal facts are global and available to another bot in a newly created private chat", async () => {
  const { manager, sources, writes } = world()
  await manager("u", "team", "a", true).remember([
    { scope: "global", key: "cat_name", value: "Nodi" },
  ])
  const b = manager("u", "new-private", "new-bot", false)
  assert.match((await b.read()).global, /Nodi/)
  assert.equal((await b.read()).bot, "")
  assert.equal(sources.size, 1)
  assert.deepEqual(
    writes.map(({ scope }) => scope),
    ["global"]
  )
})

test("group-specific notes are shared with all members but isolated from other groups and private chats", async () => {
  const { manager } = world()
  await manager("u", "team", "a", true).remember([
    { scope: "group", key: "project_name", value: "Copper Finch" },
  ])
  assert.match(
    (await manager("u", "team", "b", true).read()).group,
    /Copper Finch/
  )
  assert.equal((await manager("u", "other", "b", true).read()).group, "")
  assert.equal(
    (await manager("u", "private", "b", false).read()).group,
    undefined
  )
  await assert.rejects(
    () => manager("u", "private", "b", false).read("group"),
    /unavailable/
  )
})

test("explicitly private facts remain with their bot and are excluded from group prompts by default", async () => {
  const { manager } = world()
  const a = manager("u", "private-a", "a", false)
  await a.remember([{ scope: "bot", key: "dog_name", value: "Inu" }])
  assert.match((await a.read()).bot, /Inu/)
  assert.equal((await manager("u", "private-b", "b", false).read()).global, "")
  assert.equal((await manager("u", "team", "a", true).read()).bot, undefined)
  await assert.rejects(
    () => manager("u", "team", "a", true).read("bot"),
    /unavailable/
  )
  assert.match(
    (await manager("u", "team", "a", true, { botMemoryInGroups: true }).read())
      .bot,
    /Inu/
  )
})

test("personal facts from individual chats are global by default without copying them to bot files", async () => {
  const { manager, writes } = world()
  const a = manager("u", "private", "a", false)
  await a.remember([
    { scope: "global", key: "user_name", value: "lakshya" },
    { scope: "global", key: "dog_name", value: "inu" },
    { scope: "global", key: "cat_name", value: "nodi" },
  ])
  assert.match(
    (await manager("u", "private-b", "b", false).read()).global,
    /dog_name: inu/
  )
  assert.equal((await a.read()).bot, "")
  assert.equal(writes[0].scope, "global")
  assert.equal(writes.length, 1)
  assert.match(
    (await manager("u", "team", "new-bot", true).read()).global,
    /cat_name: nodi/
  )
})

test("global memory never crosses user boundaries", async () => {
  const { manager } = world()
  await manager("u", "team", "a", true).remember([
    { scope: "global", key: "cat_name", value: "Nodi" },
  ])
  assert.equal(
    (await manager("stranger", "team-other", "c", true).read()).global,
    ""
  )
})

test("corrections replace matching shared keys and forgetting deletes the shared fact", async () => {
  const { manager, sources } = world()
  const a = manager("u", "team", "a", true)
  await a.remember([{ scope: "global", key: "cat_name", value: "Nodi" }])
  await a.remember([{ scope: "global", key: "cat_name", value: "Nori" }])
  assert.equal(sources.get("user:u").size, 1)
  assert.match((await a.read()).global, /Nori/)
  await manager("u", "private", "b", false).tools.writeMemory.execute(
    { scope: "global", content: "- cat_name: [forgotten]" },
    options
  )
  assert.equal((await a.read()).global, "")
})

test("disabled scopes cannot be accessed and global writes cannot bypass settings", async () => {
  const { manager, writes } = world()
  const a = manager("u", "team", "a", true, {
    globalMemory: false,
    groupMemory: false,
  })
  assert.deepEqual(await a.read(), {})
  await a.remember([
    { scope: "global", key: "cat_name", value: "Nodi" },
    { scope: "group", key: "project", value: "Finch" },
  ])
  assert.equal(writes.length, 0)
  await assert.rejects(
    () =>
      a.tools.writeMemory.execute(
        { scope: "global", content: "- cat_name: Nodi" },
        options
      ),
    /privacy/
  )
  await assert.rejects(
    () =>
      manager("u", "private", "a", false, {
        globalMemory: false,
      }).tools.writeMemory.execute(
        { scope: "global", content: "- cat_name: Nodi" },
        options
      ),
    /privacy/
  )
})

test("pausing memory disables automatic and tool-based new saves while retaining recall and deletion", async () => {
  const { manager } = world()
  await manager("u", "team", "a", true).remember([
    { scope: "global", key: "cat_name", value: "Nodi" },
  ])
  const a = manager("u", "team", "a", true, { automaticMemory: false })
  await a.remember([{ scope: "global", key: "cat_name", value: "Nori" }])
  assert.match((await a.read()).global, /Nodi/)
  await assert.rejects(
    () =>
      a.tools.writeMemory.execute(
        { scope: "global", content: "- cat_name: Nori" },
        options
      ),
    /paused/
  )
  await a.tools.writeMemory.execute(
    { scope: "global", content: "- cat_name: [forgotten]" },
    options
  )
  assert.equal((await a.read()).global, "")
})

test("shared facts are never duplicated into individual files through automatic saves or tools", async () => {
  const { manager, sources } = world()
  const a = manager("u", "team", "a", true, { botMemoryInGroups: true })
  await a.remember([
    { scope: "global", key: "cat_name", value: "Nodi" },
    { scope: "bot", key: "cat_name", value: "Nodi" },
  ])
  await a.tools.writeMemory.execute(
    { scope: "bot", content: "- cat_name: Nodi" },
    options
  )
  assert.equal(sources.has("bot:a"), false)
})

test("handoff tools resolve shared memory and only the receiving bot's authorized individual notes", async () => {
  const { manager } = world()
  const a = manager("u", "team", "a", true, { botMemoryInGroups: true })
  const b = manager("u", "team", "b", true, { botMemoryInGroups: true })
  await a.remember([
    { scope: "group", key: "project", value: "Finch" },
    { scope: "bot", key: "role_note", value: "research" },
  ])
  await b.remember([{ scope: "bot", key: "role_note", value: "writer" }])
  let active = a
  const tools = createRoutedMemoryTools(async () => active)
  assert.match((await tools.readMemory.execute({}, options)).bot, /research/)
  active = b
  const memory = await tools.readMemory.execute({}, options)
  assert.match(memory.bot, /writer/)
  assert.doesNotMatch(memory.bot, /research/)
  assert.match(memory.group, /Finch/)
})

test("scoped tool writes reject code and invalid keys", async () => {
  const a = world().manager("u", "team", "a", true)
  for (const content of [
    "int main() {}",
    "- snippet: console.log('hello')",
    "- invalid key: value",
  ]) {
    await assert.rejects(() =>
      a.tools.writeMemory.execute({ scope: "group", content }, options)
    )
  }
})
