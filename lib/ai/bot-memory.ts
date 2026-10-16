import type { Sandbox } from "@daytona/sdk"
import { tool } from "ai"
import { z } from "zod"

type MemorySandbox = Pick<Sandbox, "getUserHomeDir" | "fs">
const maxMemoryLength = 32_000

export function isMemoryNotes(content: string) {
  const lines = content.split(/\r?\n/).filter((line) => line.trim())
  return (
    lines.every((line) => /^\s*(?:#{1,6}\s|[-*]\s)/.test(line)) &&
    !/```|~~~|#include|\b(?:int|void)\s+main\s*\(|std::|\bconsole\.log\s*\(/.test(
      content
    )
  )
}

export const memoryContentSchema = z
  .string()
  .max(maxMemoryLength)
  .refine(
    isMemoryNotes,
    "Memory must contain Markdown fact bullets or headings, never code or unrelated text."
  )

export async function readBotMemory(sandbox: MemorySandbox) {
  const path = await botMemoryPath(sandbox)
  try {
    const info = await sandbox.fs.getFileDetails(path)
    if (info.size > maxMemoryLength * 4)
      throw new Error("MEMORY.md is too large. Keep memory concise.")
    const content = (await sandbox.fs.downloadFile(path, 30)).toString("utf8")
    if (content.length > maxMemoryLength)
      throw new Error("MEMORY.md is too large. Keep memory concise.")
    return { path, content }
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "statusCode" in error &&
      error.statusCode === 404
    )
      return { path, content: "" }
    throw error
  }
}

export async function saveMemoryFacts(
  sandbox: MemorySandbox,
  facts: { key: string; value: string }[]
) {
  if (!facts.length) return
  return mergeMemoryNotes(
    sandbox,
    facts.map(({ key, value }) => `- ${key}: ${value}`).join("\n")
  )
}

async function mergeMemoryNotes(sandbox: MemorySandbox, incoming: string) {
  memoryContentSchema.parse(incoming)
  const { path, content } = await readBotMemory(sandbox)
  const newLines = incoming.split(/\r?\n/).filter((line) => line.trim())
  const noteKey = (line: string) =>
    /^\s*[-*]\s+([^:]+):/.exec(line)?.[1].trim().toLowerCase()
  const keys = new Set(newLines.map(noteKey).filter(Boolean))
  // Preserve valid unrelated notes; malformed program source is not memory.
  const notes = isMemoryNotes(content)
    ? content.split(/\r?\n/).filter((line) => {
        const key = noteKey(line)
        return !key || !keys.has(key)
      })
    : []
  const merged = [...new Set([...notes, ...newLines])].join("\n").trim() + "\n"
  memoryContentSchema.parse(merged)
  await sandbox.fs.uploadFile(Buffer.from(merged, "utf8"), path)
  return { path, written: true }
}

export async function botMemoryPath(sandbox: Pick<Sandbox, "getUserHomeDir">) {
  const home = await sandbox.getUserHomeDir()
  if (!home) throw new Error("Cannot locate this bot's home directory")
  return `${home.replace(/\/$/, "")}/MEMORY.md`
}

export async function initializeBotMemory(
  sandbox: Pick<Sandbox, "getUserHomeDir" | "process">
) {
  const path = await botMemoryPath(sandbox)
  const quotedPath = `'${path.replaceAll("'", "'\"'\"'")}'`
  const result = await sandbox.process.executeCommand(
    `touch -- ${quotedPath}`,
    undefined,
    undefined,
    30
  )
  if (result.exitCode !== 0)
    throw new Error("Could not initialize the bot's MEMORY.md")
}

export function createMemoryTools(
  resolveSandbox: () => Promise<MemorySandbox>
) {
  return {
    readMemory: tool({
      description:
        "Read your own persistent MEMORY.md. It is shared across your private and group chats. Consult it before answering questions about prior conversations, user preferences, or ongoing work. Read before writing so existing facts are retained.",
      inputSchema: z.object({}),
      execute: async (_, { abortSignal }) => {
        abortSignal?.throwIfAborted()
        const sandbox = await resolveSandbox()
        return readBotMemory(sandbox)
      },
    }),
    writeMemory: tool({
      description:
        "Merge concise Markdown fact bullets into your own MEMORY.md. Use - snake_case_key: value; reusing a key updates that fact while unrelated notes are preserved. First readMemory. Save only user-provided facts, never code, guesses, unknown values, or entire transcripts. The same memory is shared by your private and group chats.",
      inputSchema: z.object({
        content: z
          .string()
          .max(maxMemoryLength)
          .describe(
            "Markdown fact bullets, preferably - snake_case_key: value. Never source code. Unrelated existing notes are preserved."
          ),
      }),
      execute: async ({ content }, { abortSignal }) => {
        abortSignal?.throwIfAborted()
        memoryContentSchema.parse(content)
        const sandbox = await resolveSandbox()
        abortSignal?.throwIfAborted()
        return mergeMemoryNotes(sandbox, content)
      },
    }),
  }
}
