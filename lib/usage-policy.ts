export const usageLimits = {
  aiMicros: 5_000_000,
  sandboxSeconds: 20 * 3600,
  maxBots: 3,
  sandboxSessionSeconds: 15 * 60,
} as const

export class UsageLimitError extends Error {
  constructor(message: string) {
    super(`${message} View /usage for your allowance and reset date.`)
    this.name = "UsageLimitError"
  }
}

export function tokenCost(
  input: number,
  output: number,
  rate: { input: number; output: number }
) {
  if (
    ![input, output, rate.input, rate.output].every(
      (n) => Number.isFinite(n) && n >= 0
    )
  )
    throw new Error("Invalid token usage or pricing")
  // Rates are USD / million tokens; result is integer micro-dollars.
  return Math.ceil(input * rate.input + output * rate.output)
}

export function resetCountdown(endsAt: number, now: number) {
  const minutes = Math.max(0, Math.ceil((endsAt - now) / 60000))
  if (!minutes) return "Reset pending"
  const days = Math.floor(minutes / 1440)
  const hours = Math.floor((minutes % 1440) / 60)
  return days ? `${days}d ${hours}h` : `${hours}h ${minutes % 60}m`
}
