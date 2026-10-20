import assert from "node:assert/strict"
import test from "node:test"
import { runs } from "@trigger.dev/sdk"
import { and, eq } from "drizzle-orm"
import { db } from "../lib/db/client"
import { usagePeriods, usageEntries, workerRuns } from "../lib/db/schema"
import { syncWorkerRun, workerCostMicros } from "../lib/worker-usage"

test("worker reconciliation is idempotent under contention and records only deltas across periods", async () => {
  const owner = `worker-test-${crypto.randomUUID()}`
  const first = `${owner}:first`,
    second = `${owner}:second`,
    runId = `run_${crypto.randomUUID()}`
  const retrieve = runs.retrieve
  let cost = 1.2
  let duration = 1000
  runs.retrieve = (async () => ({
    costInCents: cost,
    baseCostInCents: 0.1,
    durationMs: duration,
    isCompleted: false,
    isFailed: false,
    isCancelled: false,
  })) as unknown as typeof runs.retrieve
  try {
    await db
      .insert(usagePeriods)
      .values(
        [first, second].map((id) => ({
          id,
          userId: owner,
          startsAt: new Date(),
          endsAt: new Date(Date.now() + 3600000),
        }))
      )
    await db
      .insert(workerRuns)
      .values({
        id: runId,
        userId: owner,
        periodId: first,
        taskId: "chat-agent",
      })
    await Promise.all(Array.from({ length: 8 }, () => syncWorkerRun(runId)))
    let entries = await db
      .select()
      .from(usageEntries)
      .where(eq(usageEntries.periodId, first))
    assert.equal(entries.length, 1)
    assert.equal(entries[0].amount, 13000)
    assert.equal(entries[0].durationMs, 1000)
    cost = 2.2
    duration = 2000
    await syncWorkerRun(runId)
    await db
      .update(workerRuns)
      .set({ periodId: second })
      .where(eq(workerRuns.id, runId))
    cost = 4.2
    duration = 4000
    await Promise.all(Array.from({ length: 4 }, () => syncWorkerRun(runId)))
    entries = await db
      .select()
      .from(usageEntries)
      .where(
        and(eq(usageEntries.kind, "worker"), eq(usageEntries.periodId, second))
      )
    assert.equal(entries.length, 1)
    assert.equal(entries[0].amount, 20000)
    assert.equal(entries[0].durationMs, 2000)
    const previous = await db
      .select()
      .from(usageEntries)
      .where(eq(usageEntries.periodId, first))
    assert.equal(previous[0].amount, 23000)
    assert.equal(previous[0].durationMs, 2000)
    assert.throws(() =>
      workerCostMicros({ costInCents: NaN, baseCostInCents: 0, durationMs: 0 })
    )
  } finally {
    runs.retrieve = retrieve
    await db.delete(usagePeriods).where(eq(usagePeriods.userId, owner))
  }
})
