import { and, asc, eq } from "drizzle-orm"

import { db } from "../db/client"
import { chats, chatMembers } from "../db/schema"
import { ChatRequestError } from "./chat-error"

export async function getChatBot(chatId: string, botId?: string) {
  const conversation = await db.query.chats.findFirst({
    where: eq(chats.id, chatId),
  })
  if (!conversation) throw new ChatRequestError("Chat not found.")
  if (conversation.kind === "group" && !botId)
    throw new ChatRequestError("Choose a bot to respond.")
  const membership = await db.query.chatMembers.findFirst({
    where: and(
      eq(chatMembers.chatId, chatId),
      botId ? eq(chatMembers.botId, botId) : undefined
    ),
    orderBy: [asc(chatMembers.joinedAt), asc(chatMembers.botId)],
    with: { bot: true },
  })
  if (!membership)
    throw new ChatRequestError("The selected bot is no longer in this chat.")
  return membership.bot
}

export async function isGroupChat(chatId: string) {
  const conversation = await db.query.chats.findFirst({
    where: eq(chats.id, chatId),
    columns: { kind: true },
  })
  return conversation?.kind === "group"
}
