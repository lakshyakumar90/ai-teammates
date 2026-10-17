"use server"
import { logOperation } from "@/lib/logging"

import { auth } from "@clerk/nextjs/server"
import { and, eq } from "drizzle-orm"
import { nanoid } from "nanoid"
import { z } from "zod"

import { createBotSandbox, deleteBotSandbox } from "@/lib/daytona"
import { db } from "@/lib/db"
import { bots, chatMembers, chats, insertBotSchema } from "@/lib/db/schema"
import { getPaidAccessError } from "@/lib/billing"
import {
  ensureUsagePeriod,
  reserveBotCapacity,
  releaseBotCapacity,
  reserveUsage,
  refundUsage,
} from "@/lib/usage"
import { UsageLimitError } from "@/lib/usage-policy"

const createBotSchema = insertBotSchema.omit({
  id: true,
  sandboxId: true,
  createdAt: true,
})

export type CreateBotInput = Omit<z.infer<typeof createBotSchema>, "userId">

export async function createBot(input: CreateBotInput) {
  return logOperation("actions.bot.createBot", async () => {
    try {
      return await createBotWithUsage(input)
    } catch (error) {
      if (error instanceof UsageLimitError) return { error: error.message }
      throw error
    }
  })
}

async function createBotWithUsage(input: CreateBotInput) {
  const denied = await getPaidAccessError()
  if (denied) return denied
  const { userId } = await auth()
  if (!userId) {
    throw new Error("Not authenticated")
  }

  const data = createBotSchema.parse({ ...input, userId })

  // IDs are minted up front so the bot, its direct chat, and the membership
  // can go out in a single batch.
  const botId = nanoid()
  const chatId = nanoid()
  const period = await ensureUsagePeriod(userId)
  await reserveBotCapacity(userId)
  let creationDebit: string
  try {
    creationDebit = await reserveUsage(period.id, "bot", 1)
  } catch (error) {
    await releaseBotCapacity(userId)
    throw error
  }
  let sandbox
  try {
    sandbox = await createBotSandbox(botId, userId)
  } catch (error) {
    await refundUsage(creationDebit)
    await releaseBotCapacity(userId)
    throw error
  }
  try {
    const [botRows, chatRows] = await db.batch([
      db
        .insert(bots)
        .values({ ...data, id: botId, sandboxId: sandbox.id })
        .returning(),
      db.insert(chats).values({ id: chatId, userId }).returning(),
      db.insert(chatMembers).values({ chatId, botId }),
    ])
    return { bot: botRows[0], chat: chatRows[0] }
  } catch (error) {
    // The batch is transactional; remove its sandbox if no bot was saved.
    try {
      await deleteBotSandbox(sandbox.id)
      await releaseBotCapacity(userId)
      await refundUsage(creationDebit)
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        "Failed to save bot and delete its sandbox"
      )
    }
    throw error
  }
}

const updateBotSchema = insertBotSchema
  .omit({
    userId: true,
    sandboxId: true,
    createdAt: true,
  })
  .extend({
    id: z.string().min(1),
  })

export type UpdateBotInput = z.infer<typeof updateBotSchema>

export async function updateBot(input: UpdateBotInput) {
  return logOperation("actions.bot.updateBot", async () => {
    const denied = await getPaidAccessError()
    if (denied) return denied
    const { userId } = await auth()
    if (!userId) {
      throw new Error("Not authenticated")
    }

    const data = updateBotSchema.parse(input)
    const [bot] = await db
      .update(bots)
      .set({
        name: data.name,
        job: data.job,
        instructions: data.instructions,
        avatar: data.avatar,
      })
      .where(and(eq(bots.id, data.id), eq(bots.userId, userId)))
      .returning()
    if (!bot) {
      throw new Error("Bot not found")
    }
    return bot
  })
}

const deleteBotSchema = z.object({ id: z.string().min(1) })

export async function deleteBot(input: z.infer<typeof deleteBotSchema>) {
  return logOperation("actions.bot.deleteBot", async () => {
    const denied = await getPaidAccessError()
    if (denied) return denied
    const { userId } = await auth()
    if (!userId) {
      throw new Error("Not authenticated")
    }

    const data = deleteBotSchema.parse(input)

    const [existingBot] = await db
      .select()
      .from(bots)
      .where(and(eq(bots.id, data.id), eq(bots.userId, userId)))
      .limit(1)
    if (!existingBot) {
      throw new Error("Bot not found")
    }

    // Keep the relationship available for retry if Daytona deletion fails.
    if (existingBot.sandboxId) {
      await deleteBotSandbox(existingBot.sandboxId)
    }

    const memberships = await db
      .select({ chatId: chatMembers.chatId })
      .from(chatMembers)
      .where(eq(chatMembers.botId, data.id))

    const [bot] = await db
      .delete(bots)
      .where(and(eq(bots.id, data.id), eq(bots.userId, userId)))
      .returning()
    if (!bot) {
      throw new Error("Bot not found")
    }

    // Drop chats left with no members so deleted bots vanish from the sidebar.
    await releaseBotCapacity(userId)
    for (const { chatId } of memberships) {
      const remaining = await db
        .select({ chatId: chatMembers.chatId })
        .from(chatMembers)
        .where(eq(chatMembers.chatId, chatId))
        .limit(1)
      if (remaining.length === 0) {
        await db
          .delete(chats)
          .where(and(eq(chats.id, chatId), eq(chats.userId, userId)))
      }
    }
    return bot
  })
}
