import "server-only"

import { auth } from "@clerk/nextjs/server"
import { desc, eq } from "drizzle-orm"

import { db } from "@/lib/db"
import { bots, chats } from "@/lib/db/schema"

export async function getChats() {
  const { userId } = await auth()
  if (!userId) {
    return []
  }

  return db.query.chats.findMany({
    where: eq(chats.userId, userId),
    orderBy: [desc(chats.lastMessageAt)],
    with: {
      members: {
        with: { bot: true },
      },
    },
  })
}

export type ChatWithBot = Awaited<ReturnType<typeof getChats>>[number]

export async function getBots() {
  const { userId } = await auth()
  if (!userId) return []
  return db
    .select({
      id: bots.id,
      name: bots.name,
      avatar: bots.avatar,
      job: bots.job,
    })
    .from(bots)
    .where(eq(bots.userId, userId))
}
