import { DaytonaNotFoundError, type Sandbox } from "@daytona/sdk"
import { tasks } from "@trigger.dev/sdk"
import { and, eq, sql } from "drizzle-orm"
import { nanoid } from "nanoid"
import { createDaytonaClient } from "./daytona-client"
import { db } from "./db/client"
import { sandboxLeases } from "./db/schema"
import {
  ensureUsagePeriod,
  reserveUsage,
  refundUsage,
  settleSandbox,
  usageNow,
} from "./usage"
import { UsageLimitError, usageLimits } from "./usage-policy"
import type { stopSandboxLease } from "../trigger/sandbox-usage"

export async function stopLease(userId: string, leaseId: string) {
  // Claim the stop before contacting Daytona. Concurrent UI/timer/recovery
  // stops cannot race a replacement session on the same sandbox. A crashed
  // claimant becomes retryable after three minutes.
  const [lease] = await db
    .update(sandboxLeases)
    .set({ stoppingUntil: sql`date_trunc('milliseconds', now()) + interval '3 minutes'` })
    .where(
      and(
        eq(sandboxLeases.userId, userId),
        eq(sandboxLeases.id, leaseId),
        sql`(stopping_until IS NULL OR stopping_until < now())`
      )
    )
    .returning()
  if (!lease) return
  // Never close a replacement lease. A failed stop retains the lock and retries.
  try {
    try {
      const sandbox = await createDaytonaClient().get(lease.sandboxId)
      if (sandbox.state !== "stopped" && sandbox.state !== "archived")
        await sandbox.stop()
    } catch (error) {
      if (!(error instanceof DaytonaNotFoundError)) throw error
      if (
        !lease.ready &&
        lease.entryId &&
        lease.endsAt.getTime() > (await usageNow())
      )
        throw error
    }
    if (lease.entryId)
      await settleSandbox(
        lease.entryId,
        Math.max(
          1,
          Math.ceil(((await usageNow()) - lease.startsAt.getTime()) / 1000)
        )
      )
    await db
      .delete(sandboxLeases)
      .where(
        and(eq(sandboxLeases.userId, userId), eq(sandboxLeases.id, leaseId))
      )
  } catch (error) {
    await db
      .update(sandboxLeases)
      .set({ stoppingUntil: null })
      .where(
        and(
          eq(sandboxLeases.id, leaseId),
          eq(sandboxLeases.stoppingUntil, lease.stoppingUntil!)
        )
      )
    throw error
  }
}

export async function withSandboxLease(
  userId: string,
  sandboxId: string,
  start: () => Promise<Sandbox>
) {
  const period = await ensureUsagePeriod(userId)
  const now = await usageNow()
  const existing = await db.query.sandboxLeases.findFirst({
    where: eq(sandboxLeases.userId, userId),
  })
  if (existing) {
    if (existing.endsAt.getTime() <= now || existing.stoppingUntil) {
      await stopLease(userId, existing.id)
    } else {
      if (!existing.ready)
        throw new UsageLimitError(
          "The sandbox is starting. Please retry shortly."
        )
      if (existing.sandboxId === sandboxId) {
        const sandbox = await createDaytonaClient().get(sandboxId)
        if (sandbox.state === "started") return sandbox
      }
      // An idle-stopped sandbox needs a new allocation and stop timer.
      await stopLease(userId, existing.id)
    }
  }
  const seconds = Math.min(
    usageLimits.sandboxSessionSeconds,
    Math.floor((period.endsAt.getTime() - now) / 1000)
  )
  if (seconds < 30)
    throw new UsageLimitError(
      "This subscription period is ending. Retry after renewal."
    )
  const lease = {
    userId,
    id: nanoid(),
    sandboxId,
    startsAt: new Date(now),
    endsAt: new Date(now + seconds * 1000),
    ready: false,
  }
  const inserted = await db
    .insert(sandboxLeases)
    .values(lease)
    .onConflictDoNothing()
    .returning()
  if (!inserted.length)
    throw new UsageLimitError(
      "A sandbox is already starting or running. Retry shortly."
    )
  let debit: string | undefined
  let armed = false
  try {
    debit = await reserveUsage(period.id, "sandbox", seconds)
    await db
      .update(sandboxLeases)
      .set({ entryId: debit })
      .where(eq(sandboxLeases.id, lease.id))
    // Schedule a durable wall-clock stop BEFORE starting/provisioning. Idle
    // timeouts alone can be bypassed by activity and are not a spending limit.
    await tasks.trigger<typeof stopSandboxLease>(
      "stop-sandbox-lease",
      { userId, leaseId: lease.id },
      { delay: lease.endsAt }
    )
    armed = true
    const sandbox = await start()
    // No GPUs or unexpectedly large default snapshots are allowed.
    if (
      sandbox.cpu > 2 ||
      sandbox.memory > 4 ||
      sandbox.disk > 10 ||
      sandbox.gpu > 0
    )
      throw new UsageLimitError("This sandbox exceeds the Pro resource limits.")
    if ((await usageNow()) >= lease.endsAt.getTime()) {
      await sandbox.stop()
      throw new UsageLimitError(
        "Sandbox startup exceeded its runtime allocation."
      )
    }
    await sandbox.setAutostopInterval(5)
    await sandbox.setAutoArchiveInterval(60)
    const activated = await db
      .update(sandboxLeases)
      .set({ ready: true, sandboxId: sandbox.id })
      .where(eq(sandboxLeases.id, lease.id))
      .returning()
    if (!activated.length) {
      await sandbox.stop()
      throw new UsageLimitError(
        "This sandbox session was stopped during startup. Please retry."
      )
    }
    return sandbox
  } catch (error) {
    if (armed) await stopLease(userId, lease.id)
    else await db.delete(sandboxLeases).where(eq(sandboxLeases.id, lease.id))
    // Once a start was attempted, keep the allocated runtime debit; it might
    // have succeeded remotely even when its response was lost.
    if (debit && !armed) await refundUsage(debit)
    throw error
  }
}

export async function managedSandbox(userId: string, sandboxId: string) {
  return withSandboxLease(userId, sandboxId, async () => {
    const sandbox = await createDaytonaClient().get(sandboxId)
    if (sandbox.state !== "started") await sandbox.start()
    return sandbox
  })
}

export async function expiredLeases() {
  return db
    .select()
    .from(sandboxLeases)
    .where(sql`ends_at <= now()`)
}
