"use server";

import { auth } from "@clerk/nextjs/server";
import { z } from "zod";

import { db } from "@/lib/db";
import { bots, insertBotSchema } from "@/lib/db/schema";

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
  const [bot] = await db.insert(bots).values(data).returning();
  return bot;
}
