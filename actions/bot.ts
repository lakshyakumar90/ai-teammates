"use server";

import { auth } from "@clerk/nextjs/server";
import { nanoid } from "nanoid";
import { z } from "zod";

import { db } from "@/lib/db";
import { bots, chatMembers, chats, insertBotSchema } from "@/lib/db/schema";

const createBotSchema = insertBotSchema.omit({
  id: true,
  sandboxId: true,
  createdAt: true,
});

export type CreateBotInput = Omit<z.infer<typeof createBotSchema>, "userId">;

export async function createBot(input: CreateBotInput) {
  const { userId } = await auth();
  if (!userId) {
    throw new Error("Not authenticated");
  }

  const data = createBotSchema.parse({ ...input, userId });

  // IDs are minted up front so the bot, its direct chat, and the membership
  // can go out in a single batch.
  const botId = nanoid();
  const chatId = nanoid();
  const [botRows, chatRows] = await db.batch([
    db.insert(bots).values({ ...data, id: botId }).returning(),
    db.insert(chats).values({ id: chatId, userId }).returning(),
    db.insert(chatMembers).values({ chatId, botId }),
  ]);
  return { bot: botRows[0], chat: chatRows[0] };
}
