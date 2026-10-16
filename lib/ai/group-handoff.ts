import {
  tool,
  type ModelMessage,
  type PrepareStepFunction,
  type ToolSet,
} from "ai"
import { z } from "zod"

type GroupMember = { id: string; name: string; job: string }

export const handoffResultSchema = z.object({
  botId: z.string().trim().min(1),
  reason: z.string().trim().min(1).max(500),
})

export function createGroupHandoffTools(
  members: GroupMember[],
  selectedBotId?: string,
  onTransfer?: (botId: string) => void
) {
  let transferred = false
  return {
    handoff: tool({
      description:
        "Transfer this request to another group member whose job is better suited. That bot will respond in this turn. Use an exact bot ID from the group roster and a short reason. Only one handoff is allowed per turn.",
      inputSchema: handoffResultSchema,
      execute: async ({ botId, reason }) => {
        if (transferred)
          throw new Error(
            "This turn has already been handed off. Answer the user directly."
          )
        if (botId === selectedBotId)
          throw new Error("Choose another group member, not yourself.")
        if (!members.some((member) => member.id === botId))
          throw new Error("Choose a bot ID from the group roster.")
        transferred = true
        onTransfer?.(botId)
        return { botId, reason }
      },
    }),
  }
}

// Keep one managed AI SDK stream for the turn. The recipient gets a fresh model
// prompt, while the UI retains the sender's text and completed handoff call.
export function createGroupWorkflow<T extends GroupMember>({
  bot,
  messages,
  resolveBot,
  instructions,
  onBotChange,
  recipientTools = [],
  loadMemory,
}: {
  bot: T
  messages: ModelMessage[]
  resolveBot: (id: string) => Promise<T>
  instructions: (bot: T, handoff?: { from: string; reason: string }) => string
  onBotChange: (bot: T) => void
  recipientTools?: ("readMemory" | "writeMemory")[]
  loadMemory?: (bot: T) => Promise<string>
}) {
  let active = bot
  let handoff: { from: string; reason: string } | undefined
  let memoryContext = ""
  return async ({ steps }: Parameters<PrepareStepFunction<ToolSet>>[0]) => {
    let justTransferred = false
    if (!handoff) {
      const results = steps.at(-1)?.toolResults ?? []
      const transfer = results.find((result) => result.toolName === "handoff")
      const parsed = handoffResultSchema.safeParse(transfer?.output)
      if (parsed.success) {
        const next = await resolveBot(parsed.data.botId)
        handoff = { from: active.name, reason: parsed.data.reason }
        active = next
        justTransferred = true
        onBotChange(active)
      }
    }
    if (loadMemory && (steps.length === 0 || justTransferred))
      memoryContext = await loadMemory(active)
    return {
      instructions: [instructions(active, handoff), memoryContext]
        .filter(Boolean)
        .join("\n\n"),
      // Do not let the receiving model continue the sender's self-introduction
      // or tool narration. The tool call stays in the streamed UI transcript.
      ...(handoff
        ? {
            ...(justTransferred ? { messages } : {}),
            activeTools: recipientTools,
            toolChoice: recipientTools.length
              ? ("auto" as const)
              : ("none" as const),
          }
        : {}),
    }
  }
}
