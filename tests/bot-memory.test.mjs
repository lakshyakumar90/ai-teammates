import assert from "node:assert/strict"
import test from "node:test"
import {
  initializeBotMemory,
  botMemoryPath,
  createMemoryTools,
  saveMemoryFacts,
} from "../lib/ai/bot-memory.ts"
import {
  createGroupHandoffTools,
  createGroupWorkflow,
} from "../lib/ai/group-handoff.ts"
import {
  buildBotInstructions,
  buildGroupBotInstructions,
} from "../lib/ai/bot-instructions.ts"

function sandbox(home) {
  const files = new Map()
  return {
    files,
    getUserHomeDir: async () => home,
    process: {
      executeCommand: async () => {
        const path = `${home}/MEMORY.md`
        if (!files.has(path)) files.set(path, Buffer.alloc(0))
        return { exitCode: 0 }
      },
    },
    fs: {
      uploadFile: async (content, path) =>
        files.set(path, Buffer.from(content)),
      getFileDetails: async (path) => {
        if (!files.has(path)) throw { statusCode: 404 }
        return { size: files.get(path).length }
      },
      downloadFile: async (path) => files.get(path),
    },
  }
}
const options = { toolCallId: "memory", messages: [] }

test("new bot memory is a blank file in its sandbox home", async () => {
  const bot = sandbox("/home/daytona")
  bot.fs.uploadFile = async () => {
    throw new Error("Uploads are unavailable in the Next.js bundle")
  }
  await initializeBotMemory(bot)
  assert.equal(bot.files.size, 1)
  assert.equal(bot.files.get("/home/daytona/MEMORY.md").length, 0)
})

test("initialization safely quotes the path and reports shell failure", async () => {
  const commands = []
  const bot = {
    getUserHomeDir: async () => "/home/bot's files",
    process: {
      executeCommand: async (...args) => {
        commands.push(args)
        return { exitCode: 1 }
      },
    },
  }
  await assert.rejects(() => initializeBotMemory(bot), /Could not initialize/)
  assert.deepEqual(commands[0], [
    "touch -- '/home/bot'\"'\"'s files/MEMORY.md'",
    undefined,
    undefined,
    30,
  ])
})

test("initialization does not erase existing memory", async () => {
  const bot = sandbox("/home/daytona")
  bot.files.set("/home/daytona/MEMORY.md", Buffer.from("Existing notes"))
  await initializeBotMemory(bot)
  assert.equal(
    bot.files.get("/home/daytona/MEMORY.md").toString(),
    "Existing notes"
  )
})

test("private and group tools read the same persistent memory", async () => {
  const bot = sandbox("/home/own-bot")
  await initializeBotMemory(bot)
  const privateTools = createMemoryTools(async () => bot)
  const groupTools = createMemoryTools(async () => bot)
  await privateTools.writeMemory.execute(
    { content: "- preferred_language: TypeScript." },
    options
  )
  assert.equal(
    (await groupTools.readMemory.execute({}, options)).content,
    "- preferred_language: TypeScript.\n"
  )
  await groupTools.writeMemory.execute(
    { content: "- preferred_language: TypeScript and short examples." },
    options
  )
  assert.equal(
    (await privateTools.readMemory.execute({}, options)).content,
    "- preferred_language: TypeScript and short examples.\n"
  )
})

test("handoff switches memory to recipient and never mixes bots", async () => {
  const a = sandbox("/a"),
    b = sandbox("/b")
  await initializeBotMemory(a)
  await initializeBotMemory(b)
  a.files.set("/a/MEMORY.md", Buffer.from("A-only fact"))
  b.files.set("/b/MEMORY.md", Buffer.from("B-only fact"))
  let active = "a"
  const members = [
    { id: "a", name: "Research", job: "Research" },
    { id: "b", name: "Writer", job: "Writing" },
  ]
  const tools = {
    ...createGroupHandoffTools(members, active, (id) => {
      active = id
    }),
    ...createMemoryTools(async () => (active === "a" ? a : b)),
  }
  assert.equal(
    (await tools.readMemory.execute({}, options)).content,
    "A-only fact"
  )
  await tools.handoff.execute({ botId: "b", reason: "Writing" }, options)
  assert.equal(
    (await tools.readMemory.execute({}, options)).content,
    "B-only fact"
  )
  await tools.writeMemory.execute({ content: "- note: Updated B" }, options)
  assert.equal(a.files.get("/a/MEMORY.md").toString(), "A-only fact")
  assert.equal(b.files.get("/b/MEMORY.md").toString(), "- note: Updated B\n")
})

test("memory tool results remain in the recipient's later model steps", async () => {
  const a = { id: "a", name: "A", job: "Research" },
    b = { id: "b", name: "B", job: "Writing" }
  const messages = [{ role: "user", content: "Recall my preference" }]
  const prepare = createGroupWorkflow({
    bot: a,
    messages,
    resolveBot: async () => b,
    instructions: () => "instructions",
    onBotChange: () => {},
    recipientTools: ["readMemory", "writeMemory"],
  })
  const transferred = await prepare({
    steps: [
      {
        toolResults: [
          { toolName: "handoff", output: { botId: "b", reason: "Writing" } },
        ],
      },
    ],
  })
  assert.deepEqual(transferred.messages, messages)
  assert.deepEqual(transferred.activeTools, ["readMemory", "writeMemory"])
  assert.equal(transferred.toolChoice, "auto")
  const afterMemory = await prepare({
    steps: [
      {
        toolResults: [
          { toolName: "readMemory", output: { content: "TypeScript" } },
        ],
      },
    ],
  })
  assert.equal(
    afterMemory.messages,
    undefined,
    "Do not overwrite the model's memory tool result"
  )
  assert.deepEqual(afterMemory.activeTools, ["readMemory", "writeMemory"])
  assert.equal(afterMemory.toolChoice, "auto")
})

test("missing legacy memory reads empty and other failures remain errors", async () => {
  const bot = sandbox("/home/bot")
  assert.equal(
    (await createMemoryTools(async () => bot).readMemory.execute({}, options))
      .content,
    ""
  )
  bot.fs.getFileDetails = async () => {
    throw new Error("network failure")
  }
  await assert.rejects(
    () => createMemoryTools(async () => bot).readMemory.execute({}, options),
    /network failure/
  )
  await assert.rejects(
    () => botMemoryPath({ getUserHomeDir: async () => undefined }),
    /home directory/
  )
})

test("both instruction sets explain cross-chat recall and memory updates", () => {
  const bot = {
    id: "a",
    name: "A",
    job: "Writing",
    sandboxId: "sandbox-a",
    instructions: null,
  }
  for (const prompt of [
    buildBotInstructions(bot),
    buildGroupBotInstructions(bot, [bot]),
  ]) {
    assert.match(prompt, /MEMORY.md/)
    assert.match(prompt, /readMemory/)
    assert.match(prompt, /writeMemory/)
    assert.match(prompt, /1:1 chat can be recalled in a group chat/)
  }
})

test("program source is rejected without replacing existing notes", async () => {
  const bot = sandbox("/home/bot")
  bot.files.set("/home/bot/MEMORY.md", Buffer.from("- dog_name: Inu\n"))
  const tools = createMemoryTools(async () => bot)
  await assert.rejects(
    () =>
      tools.writeMemory.execute(
        { content: '/>}int main() {\n int x = 10;\n std::cout << "' },
        options
      ),
    /never code/
  )
  assert.equal(
    bot.files.get("/home/bot/MEMORY.md").toString(),
    "- dog_name: Inu\n"
  )
})

test("automatic facts replace corrupt code and preserve unrelated valid notes", async () => {
  const bot = sandbox("/home/bot")
  bot.files.set("/home/bot/MEMORY.md", Buffer.from("int main() { return 0; }"))
  await saveMemoryFacts(bot, [{ key: "dog_name", value: "Inu" }])
  assert.equal(
    bot.files.get("/home/bot/MEMORY.md").toString(),
    "- dog_name: Inu\n"
  )
  await saveMemoryFacts(bot, [{ key: "project_codename", value: "Finch" }])
  await saveMemoryFacts(bot, [{ key: "dog_name", value: "Luna" }])
  const content = bot.files.get("/home/bot/MEMORY.md").toString()
  assert.match(content, /project_codename: Finch/)
  assert.match(content, /dog_name: Luna/)
  assert.doesNotMatch(content, /Inu|main\(/)
})
