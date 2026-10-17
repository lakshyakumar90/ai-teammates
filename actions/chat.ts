"use server"
import { logOperation } from "@/lib/logging"

import { auth } from "@trigger.dev/sdk"
import { chat, defaultStorage } from "@trigger.dev/sdk/ai"

import { defaultModelId } from "@/lib/ai/models"
import { ChatRequestError, chatErrorMessage } from "@/lib/ai/chat-error"
import { getChat } from "@/queries/chats"
import type { chatAgent } from "@/trigger/chat"
import { getPaidAccessError } from "@/lib/billing"
import type { BillingFailure } from "@/lib/billing-policy"

const startSession =
  chat.createStartSessionAction<typeof chatAgent>("chat-agent")
const loadTranscript = chat.createLoadTranscriptAction(defaultStorage)

async function requireChatOwner(chatId: string) {
  if (
    typeof chatId !== "string" ||
    !chatId.trim() ||
    !(await getChat(chatId))
  ) {
    throw new ChatRequestError("Chat not found or you don't have access to it.")
  }
}

async function chatAction<T>(
  operation: () => Promise<T>
): Promise<{ data: T } | { error: string } | BillingFailure> {
  try {
    const denied = await getPaidAccessError()
    if (denied) return denied
    return { data: await operation() }
  } catch (error) {
    return { error: chatErrorMessage(error) }
  }
}

export async function startChatSession({
  chatId,
  clientData,
}: {
  chatId: string
  clientData?: { modelId: string; botId?: string }
}) {
  return logOperation("actions.chat.startChatSession", async () => {
    return chatAction(async () => {
      await requireChatOwner(chatId)
      const modelId = clientData?.modelId ?? defaultModelId
      return startSession({
        chatId,
        clientData: { modelId, botId: clientData?.botId },
      })
    })
  })
}

export async function mintChatAccessToken(chatId: string) {
  return logOperation("actions.chat.mintChatAccessToken", async () => {
    return chatAction(async () => {
      await requireChatOwner(chatId)
      return auth.createPublicToken({
        scopes: { read: { sessions: chatId }, write: { sessions: chatId } },
        expirationTime: "1h",
      })
    })
  })
}

export async function loadChatTranscript({ chatId }: { chatId: string }) {
  return logOperation("actions.chat.loadChatTranscript", async () => {
    return chatAction(async () => {
      await requireChatOwner(chatId)
      return loadTranscript({ chatId })
    })
  })
}
