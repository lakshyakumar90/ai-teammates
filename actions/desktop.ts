"use server"

import { auth } from "@clerk/nextjs/server"
import { DaytonaError } from "@daytona/sdk"
import { z } from "zod"

import { getSandboxVncUrl } from "@/lib/daytona-vnc"
import { sanitizeDetail } from "@/lib/ai/chat-error"
import { getChat } from "@/queries/chats"

export async function loadChatDesktop(
  chatId: string
): Promise<{ url: string } | { error: string }> {
  const { userId } = await auth()
  if (!userId) return { error: "Not authenticated." }
  if (!z.string().min(1).safeParse(chatId).success) {
    return { error: "Invalid chat ID." }
  }

  try {
    const chat = await getChat(chatId)
    if (!chat) return { error: "Chat not found." }
    const sandboxId = chat.members[0]?.bot.sandboxId
    if (!sandboxId) return { error: "This bot has no Daytona sandbox." }
    return { url: await getSandboxVncUrl(sandboxId) }
  } catch (error) {
    return {
      error:
        error instanceof DaytonaError
          ? `Daytona${error.statusCode ? ` (HTTP ${error.statusCode})` : ""}: ${sanitizeDetail(error.message)}`
          : "Could not connect to the desktop. Please retry.",
    }
  }
}
