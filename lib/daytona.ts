import "server-only"

import { Daytona, DaytonaNotFoundError } from "@daytona/sdk"

export function createBotSandbox(botId: string) {
  return new Daytona().create({ name: `bot-${botId}` })
}

export async function deleteBotSandbox(sandboxId: string) {
  const daytona = new Daytona()
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
