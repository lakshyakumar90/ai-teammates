import "server-only"

import { DaytonaNotFoundError, type Sandbox } from "@daytona/sdk"
import { createDaytonaClient } from "./daytona-client"
import { initializeBotMemory } from "./ai/bot-memory"
import { withSandboxLease, stopLease } from "./sandbox-usage"
import { db } from "./db/client"
import { sandboxLeases } from "./db/schema"
import { and, eq } from "drizzle-orm"

export async function createBotSandbox(botId: string, userId: string) {
  const daytona = createDaytonaClient()
  let created: Sandbox | undefined
  try {
    const sandbox = await withSandboxLease(userId, `bot-${botId}`, async () => {
      created = await daytona.create({
        name: `bot-${botId}`,
        autoStopInterval: 5,
        autoArchiveInterval: 60,
      })
      return created
    })
    await initializeBotMemory(sandbox)
    const lease = await db.query.sandboxLeases.findFirst({
      where: and(
        eq(sandboxLeases.userId, userId),
        eq(sandboxLeases.sandboxId, sandbox.id)
      ),
    })
    if (lease) await stopLease(userId, lease.id)
    return sandbox
  } catch (error) {
    try {
      if (created) await deleteBotSandbox(created.id)
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        "Failed to initialize bot memory and delete its sandbox"
      )
    }
    throw error
  }
}

export async function deleteBotSandbox(sandboxId: string) {
  const daytona = createDaytonaClient()
  try {
    const sandbox = await daytona.get(sandboxId)
    await daytona.delete(sandbox)
  } catch (error) {
    // An already-deleted sandbox must not prevent deleting its bot on retry.
    if (!(error instanceof DaytonaNotFoundError)) {
      throw error
    }
  }
  const lease = await db.query.sandboxLeases.findFirst({
    where: eq(sandboxLeases.sandboxId, sandboxId),
  })
  if (lease) await stopLease(lease.userId, lease.id)
}
