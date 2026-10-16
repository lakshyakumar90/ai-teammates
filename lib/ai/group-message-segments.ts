import type { UIMessage } from "ai"

// A turn can contain both the outgoing bot's handoff and the recipient's reply.
export function groupMessageSegments(message: UIMessage): UIMessage[] {
  if (message.role !== "assistant") return [message]
  const segments: UIMessage[] = []
  let parts: UIMessage["parts"] = []
  for (const part of message.parts) {
    if (
      part.type === "data-bot" &&
      parts.some(
        (part) => part.type === "text" || part.type.startsWith("tool-")
      )
    ) {
      segments.push({
        ...message,
        id: `${message.id}:bot:${segments.length}`,
        parts,
      })
      parts = []
    }
    parts.push(part)
  }
  if (parts.length)
    segments.push({
      ...message,
      id: `${message.id}:bot:${segments.length}`,
      parts,
    })
  return segments
}
