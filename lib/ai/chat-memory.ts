import { and, asc, eq } from "drizzle-orm"
import { db } from "../db/client"
import {
  chats,
  memoryPreferences,
  userMemories,
  groupMemories,
} from "../db/schema"
import { getChatBot } from "./bot-context"
import { getChatSandbox } from "./computer-tools"
import { readBotMemory, saveMemoryFacts } from "./bot-memory"
import {
  createMemoryManager,
  defaultMemoryPreferences,
  type MemoryScope,
} from "./memory-manager"

// All identifiers come from a verified chat and its current bot membership.
// Models choose a scope, never a user ID, group ID, or sandbox ID.
export async function getChatMemory(chatId: string, botId?: string) {
  const conversation = await db.query.chats.findFirst({
    where: eq(chats.id, chatId),
  })
  const bot = await getChatBot(chatId, botId)
  if (!conversation || bot.userId !== conversation.userId)
    throw new Error("Memory access denied.")
  const saved = await db.query.memoryPreferences.findFirst({
    where: eq(memoryPreferences.userId, conversation.userId),
  })
  const preferences = saved ?? defaultMemoryPreferences
  const userId = conversation.userId
  async function read(scope: MemoryScope) {
    if (scope === "bot")
      return (await readBotMemory(await getChatSandbox(chatId, bot.id))).content
    const rows =
      scope === "global"
        ? await db
            .select({ key: userMemories.key, value: userMemories.value })
            .from(userMemories)
            .where(eq(userMemories.userId, userId))
            .orderBy(asc(userMemories.key))
        : await db
            .select({ key: groupMemories.key, value: groupMemories.value })
            .from(groupMemories)
            .where(eq(groupMemories.chatId, chatId))
            .orderBy(asc(groupMemories.key))
    return rows.map(({ key, value }) => `- ${key}: ${value}`).join("\n")
  }
  const manager = createMemoryManager({
    group: conversation.kind === "group",
    preferences,
    store: {
      read,
      write: async (scope, facts) => {
        if (scope === "bot") {
          await saveMemoryFacts(await getChatSandbox(chatId, bot.id), facts)
          return
        }
        for (const { key, value } of facts) {
          if (scope === "global") {
            if (value === "[forgotten]")
              await db
                .delete(userMemories)
                .where(
                  and(
                    eq(userMemories.userId, userId),
                    eq(userMemories.key, key)
                  )
                )
            else
              await db
                .insert(userMemories)
                .values({ userId, key, value })
                .onConflictDoUpdate({
                  target: [userMemories.userId, userMemories.key],
                  set: { value, updatedAt: new Date() },
                })
          } else {
            if (value === "[forgotten]")
              await db
                .delete(groupMemories)
                .where(
                  and(
                    eq(groupMemories.chatId, chatId),
                    eq(groupMemories.key, key)
                  )
                )
            else
              await db
                .insert(groupMemories)
                .values({ chatId, key, value })
                .onConflictDoUpdate({
                  target: [groupMemories.chatId, groupMemories.key],
                  set: { value, updatedAt: new Date() },
                })
          }
        }
      },
    },
  })
  return { ...manager, preferences, group: conversation.kind === "group" }
}
