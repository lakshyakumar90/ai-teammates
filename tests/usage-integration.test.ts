// Explicitly run against the development database:
// pnpm dlx tsx --env-file=.env.local --test tests/usage-integration.test.ts
import assert from "node:assert/strict"
import test from "node:test"
import { eq } from "drizzle-orm"
import { db } from "../lib/db/client"
import {
  usagePeriods,
  usageEntries,
  botCapacity,
  sandboxLeases,
} from "../lib/db/schema"
import {
  reserveUsage,
  settleAI,
  reserveBotCapacity,
  releaseBotCapacity,
  settleSandbox,
} from "../lib/usage"

test("database ledger enforces concurrent limits, settles once, and isolates periods", async () => {
  const userId = `usage-test-${crypto.randomUUID()}`
  const id = `${userId}:current`
  const next = `${userId}:next`
  try {
    await db
      .insert(usagePeriods)
      .values(
        [id, next].map((id) => ({
          id,
          userId,
          startsAt: new Date(Date.now() - 1000),
          endsAt: new Date(Date.now() + 3600000),
        }))
      )
    const reservations = await Promise.allSettled(
      Array.from({ length: 12 }, () =>
        reserveUsage(id, "ai", 1000000, "test-model")
      )
    )
    const accepted = reservations.filter((r) => r.status === "fulfilled")
    assert.equal(accepted.length, 5, "only five $1 debits fit the $5 allowance")
    const entryId = accepted[0].value
    await Promise.all(
      Array.from({ length: 5 }, () => settleAI(entryId, 1000, 1000, 2000))
    )
    let row = await db.query.usagePeriods.findFirst({
      where: eq(usagePeriods.id, id),
    })
    assert.equal(
      row?.aiMicros,
      4001000,
      "one refund despite concurrent duplicate settlement"
    )
    assert.equal(row?.aiCalls, 5)
    const entry = await db.query.usageEntries.findFirst({
      where: eq(usageEntries.id, entryId),
    })
    assert.equal(entry?.inputTokens, 1000)
    assert.equal(entry?.outputTokens, 2000)
    assert.equal(entry?.settled, true)
    await reserveUsage(next, "ai", 5000000)
    await assert.rejects(reserveUsage(next, "ai", 1), /allowance/)
    const runtime = await reserveUsage(id, "sandbox", 72000)
    await assert.rejects(reserveUsage(id, "sandbox", 1), /allowance/)
    await Promise.all([settleSandbox(runtime, 45), settleSandbox(runtime, 45)])
    row = await db.query.usagePeriods.findFirst({
      where: eq(usagePeriods.id, id),
    })
    assert.equal(row?.sandboxSeconds, 45)
    const capacities = await Promise.allSettled(
      Array.from({ length: 9 }, () => reserveBotCapacity(userId))
    )
    assert.equal(capacities.filter((r) => r.status === "fulfilled").length, 3)
    await releaseBotCapacity(userId)
    await reserveBotCapacity(userId)
    await assert.rejects(reserveBotCapacity(userId), /up to 3 bots/)
    const leases = await Promise.all(
      Array.from({ length: 4 }, () =>
        db
          .insert(sandboxLeases)
          .values({
            userId,
            id: crypto.randomUUID(),
            sandboxId: "test",
            endsAt: new Date(),
          })
          .onConflictDoNothing()
          .returning()
      )
    )
    assert.equal(
      leases.flat().length,
      1,
      "one sandbox lease across concurrent requests"
    )
    await db
      .update(usagePeriods)
      .set({ endsAt: new Date(Date.now() - 1000) })
      .where(eq(usagePeriods.id, id))
    await assert.rejects(reserveUsage(id, "ai", 0), /allowance/)
  } finally {
    await db.delete(sandboxLeases).where(eq(sandboxLeases.userId, userId))
    await db.delete(botCapacity).where(eq(botCapacity.userId, userId))
    await db.delete(usagePeriods).where(eq(usagePeriods.userId, userId))
  }
})
