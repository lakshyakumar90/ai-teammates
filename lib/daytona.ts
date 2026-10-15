import "server-only"

import { DaytonaNotFoundError } from "@daytona/sdk"
import { createDaytonaClient } from "./daytona-client"

export function createBotSandbox(botId: string) {
  return createDaytonaClient().create({ name: `bot-${botId}` })
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
