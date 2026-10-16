import "server-only"

import { auth } from "@clerk/nextjs/server"
import { and, eq } from "drizzle-orm"

import { db } from "@/lib/db"
import { chats } from "@/lib/db/schema"

export async function getChat(chatId: string) {
  const { userId } = await auth()
  if (!userId) {
    return undefined
  }

  return db.query.chats.findFirst({
    where: and(eq(chats.id, chatId), eq(chats.userId, userId)),
    with: {
      members: {
        with: { bot: true },
      },
    },
  })
}

export type ChatWithFirstBot = NonNullable<Awaited<ReturnType<typeof getChat>>>
