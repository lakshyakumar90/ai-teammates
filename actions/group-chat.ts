"use server"

import { auth } from "@clerk/nextjs/server"
import { and, eq, inArray } from "drizzle-orm"
import { nanoid } from "nanoid"
import { z } from "zod"
import { db } from "@/lib/db"
import { bots, chats, chatMembers, groupChatFormSchema } from "@/lib/db/schema"

export async function createGroupChat(
  input: z.infer<typeof groupChatFormSchema>
) {
  const { userId } = await auth()
  if (!userId) throw new Error("Not authenticated")
  const { name, botIds } = groupChatFormSchema.parse(input)
  const owned = await db
    .select({ id: bots.id })
    .from(bots)
    .where(and(eq(bots.userId, userId), inArray(bots.id, botIds)))
  if (owned.length !== botIds.length)
    throw new Error("One or more bots are unavailable")
  const id = nanoid()
  const [rows] = await db.batch([
    db
      .insert(chats)
      .values({ id, userId, name, kind: "group" })
      .returning({ id: chats.id }),
    db
      .insert(chatMembers)
      .values(botIds.map((botId) => ({ chatId: id, botId }))),
  ])
  return rows[0]
}

const updateGroupChatSchema = groupChatFormSchema.extend({
  id: z.string().min(1),
})
const deleteGroupChatSchema = z.object({ id: z.string().min(1) })

export async function updateGroupChat(
  input: z.infer<typeof updateGroupChatSchema>
) {
  const { userId } = await auth()
  if (!userId) throw new Error("Not authenticated")
  const { id, name, botIds } = updateGroupChatSchema.parse(input)
  const ownedGroup = and(
    eq(chats.id, id),
    eq(chats.userId, userId),
    eq(chats.kind, "group")
  )
  const existing = await db.query.chats.findFirst({
    where: ownedGroup,
    columns: { id: true },
  })
  if (!existing) throw new Error("Group chat not found")
  const ownedBots = await db
    .select({ id: bots.id })
    .from(bots)
    .where(and(eq(bots.userId, userId), inArray(bots.id, botIds)))
  if (ownedBots.length !== botIds.length)
    throw new Error("One or more bots are unavailable")
  const [rows] = await db.batch([
    db
      .update(chats)
      .set({ name })
      .where(ownedGroup)
      .returning({ id: chats.id }),
    db.delete(chatMembers).where(eq(chatMembers.chatId, id)),
    db
      .insert(chatMembers)
      .values(botIds.map((botId) => ({ chatId: id, botId }))),
  ])
  return rows[0]
}

export async function deleteGroupChat(
  input: z.infer<typeof deleteGroupChatSchema>
) {
  const { userId } = await auth()
  if (!userId) throw new Error("Not authenticated")
  const { id } = deleteGroupChatSchema.parse(input)
  const [deleted] = await db
    .delete(chats)
    .where(
      and(eq(chats.id, id), eq(chats.userId, userId), eq(chats.kind, "group"))
    )
    .returning({ id: chats.id })
  if (!deleted) throw new Error("Group chat not found")
  return deleted
}
