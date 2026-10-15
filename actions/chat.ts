"use server"

import { auth } from "@trigger.dev/sdk"
import { chat, defaultStorage } from "@trigger.dev/sdk/ai"

import { defaultModelId } from "@/lib/ai/models"
import { getChat } from "@/queries/chats"
import type { chatAgent } from "@/trigger/chat"

const startSession =
  chat.createStartSessionAction<typeof chatAgent>("chat-agent")
const loadTranscript = chat.createLoadTranscriptAction(defaultStorage)

async function requireChatOwner(chatId: string) {
  if (
    typeof chatId !== "string" ||
    !chatId.trim() ||
    !(await getChat(chatId))
  ) {
    throw new Error("Chat not found")
  }
}

export async function startChatSession({
  chatId,
  clientData,
}: {
  chatId: string
  clientData?: { modelId: string }
}) {
  await requireChatOwner(chatId)
  const modelId = clientData?.modelId ?? defaultModelId
  return startSession({ chatId, clientData: { modelId } })
}

export async function mintChatAccessToken(chatId: string) {
  await requireChatOwner(chatId)
  return auth.createPublicToken({
    scopes: { read: { sessions: chatId }, write: { sessions: chatId } },
    expirationTime: "1h",
  })
}

export async function loadChatTranscript({ chatId }: { chatId: string }) {
  await requireChatOwner(chatId)
  return loadTranscript({ chatId })
}
