"use server"
import { logOperation } from "@/lib/logging"

import { auth } from "@clerk/nextjs/server"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db/client"
import { memoryPreferences, memoryPreferencesFormSchema } from "@/lib/db/schema"
import { defaultMemoryPreferences } from "@/lib/ai/memory-manager"
import { getPaidAccessError } from "@/lib/billing"

export async function getMemoryPreferences() {
  return logOperation("actions.memory.getMemoryPreferences", async () => {
    const { userId } = await auth.protect()
    const saved = await db.query.memoryPreferences.findFirst({
      where: eq(memoryPreferences.userId, userId),
    })
    return memoryPreferencesFormSchema.parse(saved ?? defaultMemoryPreferences)
  })
}

export async function updateMemoryPreferences(input: unknown) {
  return logOperation("actions.memory.updateMemoryPreferences", async () => {
    const denied = await getPaidAccessError()
    if (denied) return denied
    const { userId } = await auth.protect()
    const values = memoryPreferencesFormSchema.parse(input)
    await db
      .insert(memoryPreferences)
      .values({ userId, ...values })
      .onConflictDoUpdate({ target: memoryPreferences.userId, set: values })
  })
}
