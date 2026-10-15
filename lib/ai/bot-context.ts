import { asc, eq } from "drizzle-orm"

import { db } from "../db/client"
import { chatMembers } from "../db/schema"
import { ChatRequestError } from "./chat-error"

export async function getChatBot(chatId: string) {
  const membership = await db.query.chatMembers.findFirst({
    where: eq(chatMembers.chatId, chatId),
    orderBy: [asc(chatMembers.joinedAt), asc(chatMembers.botId)],
    with: { bot: true },
  })
  if (!membership) throw new ChatRequestError("This chat no longer has a bot.")
  return membership.bot
}
