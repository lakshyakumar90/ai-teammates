export const paidPlanSlug = "pro"
export const paidPlanMessage =
  "Pro plan required. Subscribe for $20/month to create or use bots and sandboxes."
export type BillingFailure = { code: "PAID_PLAN_REQUIRED"; error: string }
export const billingFailure: BillingFailure = {
  code: "PAID_PLAN_REQUIRED",
  error: paidPlanMessage,
}

export function isBillingFailure(value: unknown): value is BillingFailure {
  return (
    typeof value === "object" &&
    value !== null &&
    "code" in value &&
    value.code === "PAID_PLAN_REQUIRED"
  )
}

export class PaidPlanRequiredError extends Error {
  readonly code = "PAID_PLAN_REQUIRED"
  constructor() {
    super(paidPlanMessage)
    this.name = "PaidPlanRequiredError"
  }
}

export function hasPaidSubscription(
  subscription: {
    subscriptionItems: {
      plan: { slug: string } | null
      status: string
      periodEnd: number | null
      endedAt: number | null
    }[]
  },
  now = Date.now()
) {
  return subscription.subscriptionItems.some(
    (item) =>
      item.plan?.slug === paidPlanSlug &&
      item.endedAt === null &&
      (item.periodEnd === null || item.periodEnd > now) &&
      (item.status === "active" ||
        (item.status === "canceled" &&
          item.periodEnd !== null &&
          item.periodEnd > now))
  )
}
