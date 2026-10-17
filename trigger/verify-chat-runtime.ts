import { schemaTask } from "@trigger.dev/sdk"
import { generateText } from "ai"
import { z } from "zod"
import { getChatMemory } from "../lib/ai/chat-memory"
import { getChatSandbox } from "../lib/ai/computer-tools"
import { getChatBot } from "../lib/ai/bot-context"
import { meteredModel } from "../lib/ai/usage-model"
import { ensureUsagePeriod } from "../lib/usage"
import { captureUserMemory } from "../lib/ai/memory-capture"

// Operator-only smoke test: no conversation messages or memory content are returned.
export const verifyChatRuntime = schemaTask({
  id: "verify-chat-runtime",
  schema: z.object({ chatId: z.string().min(1), modelId: z.string().min(1) }),
  retry: { maxAttempts: 1 },
  maxDuration: 120,
  run: async ({ chatId, modelId }, { ctx }) => {
    const memory = await getChatMemory(chatId)
    await memory.read()
    const sandbox = await getChatSandbox(chatId)
    const path = `${await sandbox.getUserHomeDir()}/.runtime-check-${ctx.run.id}.txt`
    const expected = "runtime file transfer check"
    try {
      await sandbox.fs.uploadFile(Buffer.from(expected), path)
      const actual = await sandbox.fs.downloadFile(path)
      if (actual.toString("utf8") !== expected)
        throw new Error("File transfer mismatch")
    } finally {
      await sandbox.fs.deleteFile(path)
    }
    const bot = await getChatBot(chatId)
    const period = await ensureUsagePeriod(bot.userId)
    const model = await meteredModel(modelId, bot.userId, period.id)
    await captureUserMemory({
      model,
      messages: [{ role: "user", content: "Hello." }],
      signal: AbortSignal.timeout(30_000),
    })
    const result = await generateText({
      model,
      prompt: "Reply with the single word OK. Do not call tools.",
      maxOutputTokens: 1024,
      maxRetries: 0,
      timeout: 30_000,
    })
    if (!result.text.trim()) throw new Error("Model returned no text")
    return {
      memoryRead: true,
      fileTransfer: true,
      memoryExtraction: true,
      modelResponse: true,
      modelId,
    }
  },
})
