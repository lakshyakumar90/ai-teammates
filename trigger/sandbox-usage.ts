import { schemaTask, schedules, wait } from "@trigger.dev/sdk"
import { and, eq } from "drizzle-orm"
import { db } from "../lib/db/client"
import { sandboxLeases } from "../lib/db/schema"
import { usageNow } from "../lib/usage"
import { z } from "zod"
import { expiredLeases, stopLease } from "../lib/sandbox-usage"

export const stopSandboxLease = schemaTask({
  id: "stop-sandbox-lease",
  schema: z.object({ userId: z.string().min(1), leaseId: z.string().min(1) }),
  retry: { maxAttempts: 10 },
  run: async ({ userId, leaseId }) => {
    const lease = await db.query.sandboxLeases.findFirst({
      where: and(
        eq(sandboxLeases.userId, userId),
        eq(sandboxLeases.id, leaseId)
      ),
    })
    if (!lease) return
    const seconds = Math.ceil(
      (lease.endsAt.getTime() - (await usageNow())) / 1000
    )
    if (seconds > 0) await wait.for({ seconds })
    await stopLease(userId, leaseId)
  },
})

// Recovery for delayed runs and transient Daytona outages; never extends leases.
export const recoverExpiredSandboxLeases = schedules.task({
  id: "recover-expired-sandbox-leases",
  cron: "* * * * *",
  run: async () => {
    const failures = []
    for (const lease of await expiredLeases()) {
      try {
        await stopLease(lease.userId, lease.id)
      } catch (error) {
        failures.push(error)
      }
    }
    if (failures.length)
      throw new AggregateError(failures, "Some sandbox stops failed")
  },
})
