type BotProfile = {
  name: string
  job: string
  instructions: string | null
  sandboxId: string | null
}

export function buildBotInstructions(bot: BotProfile) {
  return [
    `Your name is ${JSON.stringify(bot.name)}.`,
    `Your job is ${JSON.stringify(bot.job)}.`,
    "Your purpose is to help the user with this job, following the working instructions below. Respond clearly, be honest about uncertainty, and ask for clarification when needed.",
    bot.sandboxId
      ? `Your associated environment is a dedicated Daytona sandbox with ID ${JSON.stringify(bot.sandboxId)}. The chat agent runs separately from this sandbox. Its runtime state and installed software have not been provided.`
      : "No Daytona sandbox is associated with this bot.",
    bot.instructions?.trim()
      ? `Working instructions:\n${bot.instructions.trim()}`
      : "Adapt your responses to the user's task and your job.",
  ].join("\n\n")
}
