"use server"

import { auth } from "@clerk/nextjs/server"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db/client"
import { memoryPreferences, memoryPreferencesFormSchema } from "@/lib/db/schema"
import { defaultMemoryPreferences } from "@/lib/ai/memory-manager"

export async function getMemoryPreferences() {
  const { userId } = await auth()
  if (!userId) throw new Error("Unauthorized")
  const saved = await db.query.memoryPreferences.findFirst({
    where: eq(memoryPreferences.userId, userId),
  })
  return memoryPreferencesFormSchema.parse(saved ?? defaultMemoryPreferences)
}

export async function updateMemoryPreferences(input: unknown) {
  const { userId } = await auth()
  if (!userId) throw new Error("Unauthorized")
  const values = memoryPreferencesFormSchema.parse(input)
  await db
    .insert(memoryPreferences)
    .values({ userId, ...values })
    .onConflictDoUpdate({ target: memoryPreferences.userId, set: values })
}
