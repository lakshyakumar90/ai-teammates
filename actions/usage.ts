"use server"

import { auth } from "@clerk/nextjs/server"
import { eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import { sandboxLeases } from "@/lib/db/schema"
import { stopLease } from "@/lib/sandbox-usage"

export async function stopMySandbox() {
  const { userId } = await auth()
  if (!userId) throw new Error("Not authenticated")
  const lease = await db.query.sandboxLeases.findFirst({
    where: eq(sandboxLeases.userId, userId),
  })
  if (lease) await stopLease(userId, lease.id)
  revalidatePath("/usage")
}
