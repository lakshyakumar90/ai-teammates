import assert from "node:assert/strict"
import test from "node:test"
import {
  streamText,
  stepCountIs,
  createUIMessageStream,
  readUIMessageStream,
} from "ai"
import { MockLanguageModelV4 } from "ai/test"
import {
  createGroupWorkflow,
  createGroupHandoffTools,
} from "../lib/ai/group-handoff.ts"
import {
  buildGroupBotInstructions,
  buildMemoryContext,
} from "../lib/ai/bot-instructions.ts"
import { groupMessageSegments } from "../lib/ai/group-message-segments.ts"

const members = [
  {
    id: "research",
    name: "Ada",
    job: "Research",
    instructions: "Research topics",
    sandboxId: null,
    avatar: "research",
  },
  {
    id: "writer",
    name: "Writer",
    job: "Content writer",
    instructions: "Write content",
    sandboxId: null,
    avatar: "writer",
  },
  {
    id: "reviewer",
    name: "Codeee",
    job: "Code reviewer",
    instructions: "Review code",
    sandboxId: null,
    avatar: "reviewer",
  },
]
const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 1, text: 1, reasoning: 0 },
}
const result = (chunks, finish) => ({
  stream: new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk)
      controller.enqueue({
        type: "finish",
        finishReason: { unified: finish, raw: undefined },
        usage,
      })
      controller.close()
    },
  }),
  warnings: [],
})

for (const sender of members)
  for (const target of members.filter((bot) => bot.id !== sender.id)) {
    test(`${sender.job} hands off to ${target.job}: one stream, two identities, original request`, async () => {
      const messages = [
        {
          role: "user",
          content: `Please do ${target.job}: supplied task content`,
        },
      ]
      const model = new MockLanguageModelV4({
        doStream: [
          result(
            [
              { type: "text-start", id: "0" },
              { type: "text-delta", id: "0", delta: "Handing this over." },
              { type: "text-end", id: "0" },
              {
                type: "tool-call",
                toolCallId: "transfer",
                toolName: "handoff",
                input: JSON.stringify({ botId: target.id, reason: target.job }),
              },
            ],
            "tool-calls"
          ),
          result(
            [
              { type: "text-start", id: "0" },
              {
                type: "text-delta",
                id: "0",
                delta: `${target.name}: here is the completed task.`,
              },
              { type: "text-end", id: "0" },
            ],
            "stop"
          ),
        ],
      })
      const stream = createUIMessageStream({
        execute({ writer }) {
          const mark = (bot) =>
            writer.write({
              type: "data-bot",
              id: `bot-${bot.id}`,
              data: { id: bot.id, name: bot.name, avatar: bot.avatar },
            })
          const response = streamText({
            model,
            messages,
            tools: createGroupHandoffTools(members, sender.id),
            stopWhen: stepCountIs(4),
            prepareStep: createGroupWorkflow({
              bot: sender,
              messages,
              resolveBot: async (id) => {
                const bot = members.find((bot) => bot.id === id)
                if (!bot) throw new Error("Missing member")
                return bot
              },
              instructions: (bot, transfer) =>
                buildGroupBotInstructions(bot, members, transfer),
              onBotChange: mark,
            }),
          })
          writer.merge(
            response.toUIMessageStream({
              messageMetadata: ({ part }) =>
                part.type === "start"
                  ? {
                      bot: {
                        id: sender.id,
                        name: sender.name,
                        avatar: sender.avatar,
                      },
                    }
                  : undefined,
            })
          )
        },
      })
      let message
      for await (const next of readUIMessageStream({ stream })) message = next
      assert.equal(model.doStreamCalls.length, 2)
      const second = model.doStreamCalls[1]
      assert.ok(
        second.prompt
          .find((message) => message.role === "system")
          .content.includes(`You are "${target.name}"`)
      )
      assert.equal(
        second.prompt.filter(
          (message) => message.role === "assistant" || message.role === "tool"
        ).length,
        0
      )
      assert.match(JSON.stringify(second.prompt), /supplied task content/)
      assert.equal(second.toolChoice.type, "none")
      const segments = groupMessageSegments(message)
      assert.equal(segments.length, 2)
      assert.equal(segments[0].metadata.bot.id, sender.id)
      assert.equal(
        segments[1].parts.find((part) => part.type === "data-bot").data.id,
        target.id
      )
      assert.ok(
        segments[0].parts.some(
          (part) =>
            part.type === "tool-handoff" && part.state === "output-available"
        )
      )
      assert.ok(
        segments[1].parts.some(
          (part) => part.type === "text" && part.text.includes("completed task")
        )
      )
    })
  }

for (const bot of members) {
  test(`${bot.job} answers its own request without a handoff`, async () => {
    const messages = [
      { role: "user", content: `Please do your ${bot.job} work` },
    ]
    const model = new MockLanguageModelV4({
      doStream: result(
        [
          { type: "text-start", id: "0" },
          { type: "text-delta", id: "0", delta: "Here is my answer." },
          { type: "text-end", id: "0" },
        ],
        "stop"
      ),
    })
    const response = streamText({
      model,
      messages,
      tools: createGroupHandoffTools(members, bot.id),
      stopWhen: stepCountIs(4),
      prepareStep: createGroupWorkflow({
        bot,
        messages,
        resolveBot: async () => {
          assert.fail("Must not resolve a handoff for a direct reply")
        },
        instructions: (active, transfer) =>
          buildGroupBotInstructions(active, members, transfer),
        onBotChange: () =>
          assert.fail("Must not change bot for a direct reply"),
      }),
    })
    let message
    for await (const next of readUIMessageStream({
      stream: response.toUIMessageStream({
        messageMetadata: ({ part }) =>
          part.type === "start" ? { bot } : undefined,
      }),
    }))
      message = next
    assert.equal(model.doStreamCalls.length, 1)
    assert.equal(message.metadata.bot.id, bot.id)
    assert.equal(groupMessageSegments(message).length, 1)
    assert.equal(
      message.parts
        .filter((part) => part.type === "text")
        .map((part) => part.text)
        .join(""),
      "Here is my answer."
    )
  })
}

test("a removed recipient fails explicitly instead of impersonating or silently dropping its response", async () => {
  const prepare = createGroupWorkflow({
    bot: members[0],
    messages: [],
    resolveBot: async () => {
      throw new Error("The selected bot is no longer in this chat.")
    },
    instructions: () => "Instructions",
    onBotChange: () =>
      assert.fail("Do not change the avatar before membership validation"),
  })
  await assert.rejects(
    () =>
      prepare({
        steps: [
          {
            toolResults: [
              {
                toolName: "handoff",
                output: { botId: "removed", reason: "Code review" },
              },
            ],
          },
        ],
      }),
    /no longer in this chat/
  )
})

test("recipient can read its own memory after handoff and use the result", async () => {
  const sender = members[0],
    target = members[1]
  const messages = [
    { role: "user", content: "Ask Writer to recall my project codename" },
  ]
  const { createMemoryTools } = await import("../lib/ai/bot-memory.ts")
  let active = sender.id
  const tools = {
    ...createGroupHandoffTools(members, sender.id, (id) => {
      active = id
    }),
    ...createMemoryTools(async () => ({
      getUserHomeDir: async () => `/home/${active}`,
      fs: {
        getFileDetails: async () => ({ size: 16 }),
        downloadFile: async (path) => {
          assert.equal(path, `/home/${active}/MEMORY.md`)
          return Buffer.from(
            active === target.id ? "Project: Copper Finch 482" : ""
          )
        },
      },
    })),
  }
  const model = new MockLanguageModelV4({
    doStream: [
      result(
        [
          {
            type: "tool-call",
            toolCallId: "sender-memory",
            toolName: "readMemory",
            input: "{}",
          },
        ],
        "tool-calls"
      ),
      result(
        [
          {
            type: "tool-call",
            toolCallId: "handoff",
            toolName: "handoff",
            input: JSON.stringify({ botId: target.id, reason: "Writing" }),
          },
        ],
        "tool-calls"
      ),
      result(
        [
          {
            type: "tool-call",
            toolCallId: "memory",
            toolName: "readMemory",
            input: "{}",
          },
        ],
        "tool-calls"
      ),
      result(
        [
          { type: "text-start", id: "0" },
          { type: "text-delta", id: "0", delta: "Copper Finch 482" },
          { type: "text-end", id: "0" },
        ],
        "stop"
      ),
    ],
  })
  const response = streamText({
    model,
    messages,
    tools,
    stopWhen: stepCountIs(6),
    prepareStep: createGroupWorkflow({
      bot: sender,
      messages,
      resolveBot: async () => target,
      instructions: (bot, handoff) =>
        buildGroupBotInstructions(bot, members, handoff),
      onBotChange: () => {},
      recipientTools: ["readMemory", "writeMemory"],
    }),
  })
  await response.consumeStream()
  assert.equal(model.doStreamCalls.length, 4)
  assert.equal(model.doStreamCalls[2].toolChoice.type, "auto")
  assert.match(
    JSON.stringify(model.doStreamCalls[3].prompt),
    /Copper Finch 482/
  )
  assert.match(JSON.stringify(model.doStreamCalls[3].prompt), /readMemory/)
  assert.equal(await response.text, "Copper Finch 482")
})

test("selected group bot recalls preloaded private memory without calling a tool", async () => {
  const bot = members[1]
  const messages = [{ role: "user", content: "u know its name ?" }]
  const { createMemoryTools } = await import("../lib/ai/bot-memory.ts")
  const tools = createMemoryTools(async () => ({
    getUserHomeDir: async () => "/home/writer",
    fs: {
      getFileDetails: async () => ({ size: 16 }),
      downloadFile: async () => Buffer.from("- dog_name: Inu\n"),
    },
  }))
  const model = new MockLanguageModelV4({
    doStream: [
      result(
        [
          { type: "text-start", id: "0" },
          { type: "text-delta", id: "0", delta: "Your dog's name is Inu." },
          { type: "text-end", id: "0" },
        ],
        "stop"
      ),
    ],
  })
  const response = streamText({
    model,
    messages,
    tools,
    stopWhen: stepCountIs(6),
    prepareStep: createGroupWorkflow({
      bot,
      messages,
      resolveBot: async () => assert.fail("No handoff for personal recall"),
      instructions: (active) => buildGroupBotInstructions(active, members),
      onBotChange: () => assert.fail("Selected bot remains active"),
      recipientTools: ["readMemory", "writeMemory"],
      loadMemory: async (active) => {
        assert.equal(active.id, bot.id)
        return buildMemoryContext("- dog_name: Inu\n")
      },
    }),
  })
  await response.consumeStream()
  assert.equal(model.doStreamCalls.length, 1)
  assert.match(JSON.stringify(model.doStreamCalls[0].prompt), /dog_name: Inu/)
  assert.equal(model.doStreamCalls[0].toolChoice.type, "auto")
  assert.equal(await response.text, "Your dog's name is Inu.")
})

test("handoff replaces the preloaded memory with the recipient's notes and retains them on later steps", async () => {
  const loaded = []
  const prepare = createGroupWorkflow({
    bot: members[0],
    messages: [{ role: "user", content: "Ask Writer about my dog" }],
    resolveBot: async () => members[1],
    instructions: (bot) => `You are ${bot.name}`,
    onBotChange: () => {},
    recipientTools: ["readMemory", "writeMemory"],
    loadMemory: async (bot) => {
      loaded.push(bot.id)
      return buildMemoryContext(
        bot.id === "research" ? "- research_topic: galaxies" : "- dog_name: Inu"
      )
    },
  })
  const initial = await prepare({ steps: [] })
  assert.match(initial.instructions, /galaxies/)
  assert.equal(initial.toolChoice, undefined)
  const transferred = await prepare({
    steps: [
      {
        toolResults: [
          {
            toolName: "handoff",
            output: { botId: "writer", reason: "Writing" },
          },
        ],
      },
    ],
  })
  assert.match(transferred.instructions, /dog_name: Inu/)
  assert.doesNotMatch(transferred.instructions, /galaxies/)
  assert.equal(transferred.toolChoice, "auto")
  const later = await prepare({ steps: [{ toolResults: [] }] })
  assert.match(later.instructions, /dog_name: Inu/)
  assert.equal(later.messages, undefined)
  assert.deepEqual(loaded, ["research", "writer"])
})
