"use server"

import { auth } from "@clerk/nextjs/server"
import { DaytonaError } from "@daytona/sdk"
import { z } from "zod"

import { getSandboxVncUrl } from "@/lib/daytona-vnc"
import { sanitizeDetail } from "@/lib/ai/chat-error"
import { getChat } from "@/queries/chats"
import { getPaidAccessError } from "@/lib/billing"
import type { BillingFailure } from "@/lib/billing-policy"
import { UsageLimitError } from "@/lib/usage-policy"

export async function loadChatDesktop(
  chatId: string
): Promise<{ url: string } | { error: string } | BillingFailure> {
  const { userId } = await auth()
  if (!userId) return { error: "Not authenticated." }
  if (!z.string().min(1).safeParse(chatId).success) {
    return { error: "Invalid chat ID." }
  }

  try {
    const denied = await getPaidAccessError()
    if (denied) return denied
    const chat = await getChat(chatId)
    if (!chat) return { error: "Chat not found." }
    if (chat.kind === "group")
      return { error: "Group chats do not have a desktop." }
    const sandboxId = chat.members[0]?.bot.sandboxId
    if (!sandboxId) return { error: "This bot has no Daytona sandbox." }
    return { url: await getSandboxVncUrl(sandboxId, userId) }
  } catch (error) {
    return {
      error:
        error instanceof UsageLimitError
          ? error.message
          : error instanceof DaytonaError
            ? `Daytona${error.statusCode ? ` (HTTP ${error.statusCode})` : ""}: ${sanitizeDetail(error.message)}`
            : "Could not connect to the desktop. Please retry.",
    }
  }
}
