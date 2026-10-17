// Shared by Next.js and Trigger workers. Never import from a client component.
import { and, desc, eq, sql } from "drizzle-orm"
import { nanoid } from "nanoid"
import { db } from "./db/client"
import { usageEntries, usagePeriods } from "./db/schema"
import { requireUserPaidPlan } from "./billing-agent"
import { UsageLimitError, usageLimits } from "./usage-policy"
import { logger } from "./logging"

export async function usageNow() {
  const result = await db.execute(
    sql`SELECT (extract(epoch FROM now()) * 1000)::bigint AS clock`
  )
  return Number(result.rows[0].clock)
}

export async function currentUsagePeriod(userId: string) {
  const subscription = await requireUserPaidPlan(userId)
  const now = await usageNow()
  const item = subscription.subscriptionItems.find(
    (i) =>
      i.plan?.slug === "pro" &&
      i.endedAt === null &&
      (i.status === "active" || i.status === "canceled") &&
      i.periodStart <= now &&
      i.periodEnd !== null &&
      i.periodEnd > now
  )
  if (!item?.periodEnd)
    throw new UsageLimitError(
      "Your billing period could not be verified. Please check Billing."
    )
  // A cancel/re-subscribe within the same dates must not mint a fresh allowance.
  return {
    id: `${userId}:${item.periodStart}`,
    userId,
    startsAt: new Date(item.periodStart),
    endsAt: new Date(item.periodEnd),
  }
}

export async function ensureUsagePeriod(userId: string) {
  const period = await currentUsagePeriod(userId)
  await db.insert(usagePeriods).values(period).onConflictDoNothing()
  return period
}

type Kind = "ai" | "sandbox" | "bot"
export async function reserveUsage(
  periodId: string,
  kind: Kind,
  amount: number,
  modelId?: string
) {
  if (!Number.isSafeInteger(amount) || amount < 0)
    throw new Error("Invalid usage reservation")
  const id = nanoid()
  const column =
    kind === "ai"
      ? sql`ai_micros`
      : kind === "sandbox"
        ? sql`sandbox_seconds`
        : sql`bot_creations`
  const limit =
    kind === "ai"
      ? usageLimits.aiMicros
      : kind === "sandbox"
        ? usageLimits.sandboxSeconds
        : 1000000
  // The UPDATE takes a row lock and re-evaluates its predicate after contention.
  // The debit and ledger entry are a single atomic SQL statement.
  const result = await db.execute(sql`
    WITH debit AS (
      UPDATE usage_periods SET ${column} = ${column} + ${amount},
        ai_calls = ai_calls + ${kind === "ai" ? 1 : 0}
      WHERE id = ${periodId} AND ends_at > now()
        AND ${column} + ${amount} <= ${limit}
        AND (${kind !== "ai"} OR ai_calls < ${usageLimits.aiCalls})
      RETURNING id
    )
    INSERT INTO usage_entries (id, period_id, kind, model_id, amount, settled)
    SELECT ${id}, id, ${kind}, ${modelId ?? null}, ${amount}, ${kind === "bot"} FROM debit
    RETURNING id`)
  if (!result.rows.length) {
    logger.warn("Usage reservation denied", { kind, modelId, amount })
    throw new UsageLimitError(
      `${kind === "ai" ? "AI" : kind === "sandbox" ? "Sandbox runtime" : "Bot creation"} allowance reached, or insufficient allowance for this request.`
    )
  }
  logger.debug("Usage reserved", { entryId: id, kind, modelId, amount })
  return id
}

export async function reserveBotCapacity(userId: string) {
  // Current inventory seeds a new capacity row; subsequent increments serialize
  // on that row, including overlapping create requests and provisioning time.
  await db.execute(sql`INSERT INTO bot_capacity(user_id, count)
    SELECT ${userId}, count(*) FROM bots WHERE user_id = ${userId}
    ON CONFLICT (user_id) DO NOTHING`)
  const result = await db.execute(sql`UPDATE bot_capacity SET count = count + 1
    WHERE user_id = ${userId} AND count < ${usageLimits.maxBots} RETURNING count`)
  if (!result.rows.length) {
    logger.warn("Bot capacity reached")
    throw new UsageLimitError(
      "Your plan allows up to 3 bots. Delete a bot before creating another."
    )
  }
}

export async function releaseBotCapacity(userId: string) {
  await db.execute(
    sql`UPDATE bot_capacity SET count = greatest(0, count - 1) WHERE user_id = ${userId}`
  )
}

export async function settleAI(
  id: string,
  amount: number,
  inputTokens: number,
  outputTokens: number
) {
  if (
    ![amount, inputTokens, outputTokens].every(
      (n) => Number.isSafeInteger(n) && n >= 0
    )
  )
    throw new Error("Invalid usage settlement")
  // Claim the entry once. Retried finish hooks cannot double-debit or refund.
  await db.execute(sql`WITH settled AS (
    UPDATE usage_entries SET settled = true, amount = ${amount},
      input_tokens = ${inputTokens}, output_tokens = ${outputTokens}
    WHERE id = ${id} AND settled = false
    RETURNING period_id, amount
  ), original AS (
    SELECT period_id, amount FROM usage_entries WHERE id = ${id} AND settled = false
  ) UPDATE usage_periods p SET ai_micros = p.ai_micros + ${amount} - original.amount
    FROM original, settled WHERE p.id = original.period_id`)
  logger.info("AI usage settlement processed", {
    entryId: id,
    amount,
    inputTokens,
    outputTokens,
  })
}

export async function refundUsage(id: string) {
  await db.execute(sql`WITH removed AS (
    DELETE FROM usage_entries WHERE id = ${id} RETURNING period_id, kind, amount
  ) UPDATE usage_periods p SET
    bot_creations = p.bot_creations - CASE WHEN r.kind = 'bot' THEN r.amount ELSE 0 END,
    sandbox_seconds = p.sandbox_seconds - CASE WHEN r.kind = 'sandbox' THEN r.amount ELSE 0 END
    FROM removed r WHERE p.id = r.period_id`)
  logger.info("Usage refund processed", { entryId: id })
}

export async function settleSandbox(id: string, elapsedSeconds: number) {
  await db.execute(sql`WITH original AS (
    SELECT period_id, amount FROM usage_entries WHERE id = ${id} AND kind = 'sandbox' AND settled = false
  ), changed AS (
    UPDATE usage_entries SET settled = true, amount = least(amount, ${elapsedSeconds})
    WHERE id = ${id} AND settled = false RETURNING period_id, amount
  ) UPDATE usage_periods p SET sandbox_seconds = p.sandbox_seconds - original.amount + changed.amount
    FROM original, changed WHERE p.id = original.period_id`)
  logger.info("Sandbox usage settlement processed", {
    entryId: id,
    elapsedSeconds,
  })
}

export async function usageSnapshot(userId: string) {
  const period = await currentUsagePeriod(userId)
  const [usage, entries] = await Promise.all([
    db.query.usagePeriods.findFirst({
      where: and(
        eq(usagePeriods.id, period.id),
        eq(usagePeriods.userId, userId)
      ),
    }),
    db
      .select()
      .from(usageEntries)
      .where(eq(usageEntries.periodId, period.id))
      .orderBy(desc(usageEntries.createdAt))
      .limit(20),
  ])
  return { period, usage, entries, asOf: await usageNow() }
}
