import { runs } from "@trigger.dev/sdk"
import { eq, sql } from "drizzle-orm"
import { db } from "./db/client"
import { workerRuns, usageEntries } from "./db/schema"
import { ensureUsagePeriod } from "./usage"
import { logger } from "./logging"

export async function trackWorkerRun(
  userId: string,
  runId: string,
  taskId: string
) {
  const period = await ensureUsagePeriod(userId)
  const previous = await db.query.workerRuns.findFirst({
    where: eq(workerRuns.id, runId),
  })
  if (previous && previous.userId !== userId)
    throw new Error("Worker ownership mismatch")
  if (previous && previous.periodId !== period.id) {
    await syncWorkerRun(runId)
    await db
      .update(usageEntries)
      .set({ settled: true })
      .where(eq(usageEntries.id, `worker:${runId}:${previous.periodId}`))
    await db
      .update(workerRuns)
      .set({ periodId: period.id })
      .where(eq(workerRuns.id, runId))
    return
  }
  await db
    .insert(workerRuns)
    .values({ id: runId, userId, periodId: period.id, taskId })
    .onConflictDoNothing()
}

export function workerCostMicros(run: {
  costInCents: number
  baseCostInCents: number
  durationMs: number
}) {
  if (
    ![run.costInCents, run.baseCostInCents, run.durationMs].every(
      (n) => Number.isFinite(n) && n >= 0
    )
  )
    throw new Error("Invalid worker usage")
  return Math.round((run.costInCents + run.baseCostInCents) * 10_000)
}

export async function syncWorkerRun(runId: string) {
  const existing = await db.query.workerRuns.findFirst({
    where: eq(workerRuns.id, runId),
  })
  if (!existing) return
  const run = await runs.retrieve(runId)
  const cost = workerCostMicros(run)
  const duration = Math.ceil(run.durationMs)
  const complete = run.isCompleted || run.isFailed || run.isCancelled
  // A monotone cumulative upsert cannot double count, even if hooks and the
  // scheduler reconcile the same run concurrently or API observations arrive late.
  await db.execute(sql`WITH changed AS (
    UPDATE worker_runs SET cost_micros = greatest(cost_micros, ${cost}),
      duration_ms = greatest(duration_ms, ${duration}), complete = complete OR ${complete}, synced_at = now()
    WHERE id = ${runId} AND cost_micros = ${existing.costMicros} AND duration_ms = ${existing.durationMs} AND period_id = ${existing.periodId} RETURNING *
  ) INSERT INTO usage_entries (id, period_id, kind, model_id, amount, duration_ms, settled)
    SELECT 'worker:' || id || ':' || period_id, period_id, 'worker', task_id,
      cost_micros - ${existing.costMicros}, duration_ms - ${existing.durationMs}, complete FROM changed
    ON CONFLICT (id) DO UPDATE SET amount = usage_entries.amount + EXCLUDED.amount,
      duration_ms = usage_entries.duration_ms + EXCLUDED.duration_ms,
      settled = usage_entries.settled OR EXCLUDED.settled`)
}

export async function reconcileWorkerUsage() {
  const pending = await db
    .select({ id: workerRuns.id })
    .from(workerRuns)
    .where(eq(workerRuns.complete, false))
    .orderBy(sql`synced_at ASC NULLS FIRST`)
    .limit(100)
  const results = await Promise.allSettled(
    pending.map((run) => syncWorkerRun(run.id))
  )
  const failures = results.filter(
    (result) => result.status === "rejected"
  ).length
  if (failures)
    logger.warn("Worker usage reconciliation incomplete", { failures })
}
