import { Daytona } from "@daytona/sdk"

export function createDaytonaClient() {
  return new Daytona({
    apiUrl:
      process.env.DAYTONA_API_URL ||
      process.env.DAYTONA_SERVER_URL ||
      "https://app.daytona.io/api",
    requestTimeoutMs: 60_000,
  })
}
