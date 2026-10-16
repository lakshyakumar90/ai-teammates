import "server-only"

import { DaytonaNotFoundError } from "@daytona/sdk"
import { createDaytonaClient } from "./daytona-client"
import { initializeBotMemory } from "./ai/bot-memory"

export async function createBotSandbox(botId: string) {
  const daytona = createDaytonaClient()
  const sandbox = await daytona.create({ name: `bot-${botId}` })
  try {
    await initializeBotMemory(sandbox)
    return sandbox
  } catch (error) {
    try {
      await daytona.delete(sandbox)
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
}
