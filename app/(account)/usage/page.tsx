import type { Metadata } from "next"
import Link from "next/link"
import { auth } from "@clerk/nextjs/server"
import { count, eq, sum } from "drizzle-orm"
import { ArrowLeftIcon, ClockIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { UsageCountdown } from "@/components/usage-countdown"
import { stopMySandbox } from "@/actions/usage"
import { db } from "@/lib/db"
import { bots, sandboxLeases, usageEntries } from "@/lib/db/schema"
import { usageSnapshot } from "@/lib/usage"
import { usageLimits } from "@/lib/usage-policy"
import { PaidPlanRequiredError } from "@/lib/billing-policy"

export const metadata: Metadata = { title: "Usage & Billing — AI Teammates" }
const money = (micros: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(micros / 1e6)

function Meter({
  title,
  used,
  limit,
  label,
  description,
}: {
  title: string
  used: number
  limit: number
  label: string
  description: string
}) {
  return (
    <section className="rounded-xl border p-5 sm:p-6">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h2 className="font-medium">{title}</h2>
        <span className="text-sm text-muted-foreground tabular-nums">
          {label}
        </span>
      </div>
      <Progress aria-label={title} value={Math.min(used, limit)} max={limit} />
      <p className="mt-3 text-sm text-muted-foreground">{description}</p>
    </section>
  )
}

export default async function UsagePage() {
  const { userId } = await auth.protect()
  let snapshot
  try {
    snapshot = await usageSnapshot(userId)
  } catch (error) {
    if (!(error instanceof PaidPlanRequiredError)) throw error
  }
  const [inventory, lease] = await Promise.all([
    db.select({ count: count() }).from(bots).where(eq(bots.userId, userId)),
    db.query.sandboxLeases.findFirst({
      where: eq(sandboxLeases.userId, userId),
    }),
  ])
  const totals = snapshot
    ? await db
        .select({
          input: sum(usageEntries.inputTokens),
          output: sum(usageEntries.outputTokens),
        })
        .from(usageEntries)
        .where(eq(usageEntries.periodId, snapshot.period.id))
    : []
  const usage = snapshot?.usage
  const ai = usage?.aiMicros ?? 0
  const seconds = usage?.sandboxSeconds ?? 0
  const calls = usage?.aiCalls ?? 0
  return (
    <section className="min-w-0 flex-1 bg-background px-4 py-8 text-foreground sm:px-8 sm:py-12">
      <div className="mx-auto max-w-4xl">
        <header className="mb-10 flex flex-wrap items-start justify-between gap-5">
          <div>
            <Link
              href="/dashboard"
              className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
            >
              <ArrowLeftIcon className="size-4" /> Back to workspace
            </Link>
            <h1 className="text-3xl font-semibold tracking-tight">
              Usage & Billing
            </h1>
            <p className="mt-2 text-muted-foreground">
              Your plan allowance, all in one place.
            </p>
          </div>
          <Button
            nativeButton={false}
            variant="outline"
            render={<Link href="/billing" />}
          >
            Manage plan
          </Button>
        </header>
        {snapshot ? (
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-muted/50 p-5">
            <div>
              <p className="text-sm font-medium">Pro · $20/month</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {snapshot.period.startsAt.toLocaleDateString("en-US", {
                  timeZone: "UTC",
                  month: "short",
                  day: "numeric",
                })}{" "}
                –{" "}
                {snapshot.period.endsAt.toLocaleDateString("en-US", {
                  timeZone: "UTC",
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}{" "}
                · UTC
              </p>
            </div>
            <p className="inline-flex items-center gap-2 text-sm">
              <ClockIcon className="size-4 text-muted-foreground" /> Resets in{" "}
              <UsageCountdown
                endsAt={snapshot.period.endsAt.getTime()}
                initialNow={snapshot.asOf}
              />
            </p>
          </div>
        ) : (
          <div className="mb-6 rounded-xl border p-5">
            <p className="font-medium">No active Pro subscription</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Subscribe to get an AI and sandbox allowance. Free accounts cannot
              use paid features.
            </p>
            <Button
              className="mt-4"
              nativeButton={false}
              render={<Link href="/pricing" />}
            >
              View pricing
            </Button>
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Meter
            title="AI allowance"
            used={ai}
            limit={usageLimits.aiMicros}
            label={`${money(ai)} / $5.00`}
            description="Estimated model costs, including memory extraction, tool steps, and handoffs."
          />
          <Meter
            title="Sandbox runtime"
            used={seconds}
            limit={usageLimits.sandboxSeconds}
            label={`${(seconds / 3600).toFixed(2)} / 20 hours`}
            description="Active sessions reserve up to 15 minutes. Unused time is returned after a confirmed stop."
          />
          <Meter
            title="Bots"
            used={inventory[0].count}
            limit={usageLimits.maxBots}
            label={`${inventory[0].count} / 3`}
            description="Up to three bots at a time. Delete a bot to free a slot."
          />
          <Meter
            title="AI requests"
            used={calls}
            limit={usageLimits.aiCalls}
            label={`${calls.toLocaleString()} / 1,000`}
            description="Each model call counts, including free models and automatic memory extraction."
          />
        </div>
        <section className="mt-6 rounded-xl border p-5 sm:p-6">
          <h2 className="font-medium">Running sandbox</h2>
          {lease ? (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                {lease.ready ? "1 of 1 running" : "Starting or stopping"} ·
                Scheduled stop{" "}
                {lease.endsAt.toLocaleTimeString("en-US", {
                  timeZone: "UTC",
                  hour: "2-digit",
                  minute: "2-digit",
                })}{" "}
                UTC
              </p>
              <form action={stopMySandbox}>
                <Button type="submit" variant="outline">
                  Stop sandbox
                </Button>
              </form>
            </div>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">
              No sandbox is running. Switching bots stops the previous sandbox.
            </p>
          )}
        </section>
        <p className="mt-5 text-sm leading-relaxed text-muted-foreground">
          {Number(totals[0]?.input ?? 0).toLocaleString()} input tokens ·{" "}
          {Number(totals[0]?.output ?? 0).toLocaleString()} output tokens this
          period. Reservations count toward the allowance until the provider
          confirms usage. Interrupted requests without confirmed usage retain
          their reservation. Allowances reset with your subscription period;
          unused allowance does not roll over. No automatic overage charges.
        </p>
        {snapshot && (
          <section className="mt-10">
            <h2 className="mb-4 text-lg font-medium">Recent activity</h2>
            {snapshot.entries.length ? (
              <div className="overflow-x-auto rounded-xl border">
                <table className="w-full text-left text-sm">
                  <thead className="bg-muted/50 text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3 font-medium">Activity</th>
                      <th className="px-4 py-3 font-medium">Usage</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {snapshot.entries.map((entry) => (
                      <tr key={entry.id} className="border-t">
                        <td className="px-4 py-3">
                          {entry.modelId ??
                            (entry.kind === "sandbox"
                              ? "Sandbox session"
                              : "Bot created")}
                          <span className="mt-1 block text-xs text-muted-foreground">
                            {entry.createdAt.toLocaleString("en-US", {
                              timeZone: "UTC",
                            })}{" "}
                            UTC
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap tabular-nums">
                          {entry.kind === "ai"
                            ? money(entry.amount)
                            : entry.kind === "sandbox"
                              ? `${Math.ceil(entry.amount / 60)} min`
                              : "1 bot"}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {entry.settled ? "Recorded" : "Reserved"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="rounded-xl border p-6 text-sm text-muted-foreground">
                No usage yet this period. Your activity will appear here as you
                use your team.
              </p>
            )}
          </section>
        )}
      </div>
    </section>
  )
}
