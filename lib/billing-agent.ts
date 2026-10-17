import { createClerkClient } from "@clerk/backend"
import { hasPaidSubscription, PaidPlanRequiredError } from "./billing-policy"
import { logger, errorType } from "./logging"

// Worker runs have no browser session. Recheck Clerk before every turn and
// sandbox access, including sessions created before a subscription changed.
export async function requireUserPaidPlan(userId: string) {
  const secretKey = process.env.CLERK_SECRET_KEY
  if (!secretKey)
    throw new Error("CLERK_SECRET_KEY is required for billing checks.")
  try {
    const subscription = await createClerkClient({
      secretKey,
    }).billing.getUserBillingSubscription(userId)
    if (!hasPaidSubscription(subscription)) {
      logger.warn("Paid plan access denied")
      throw new PaidPlanRequiredError()
    }
    return subscription
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "status" in error &&
      error.status === 404
    ) {
      logger.warn("Billing subscription not found")
      throw new PaidPlanRequiredError()
    }
    if (!(error instanceof PaidPlanRequiredError)) {
      logger.error("Billing subscription lookup failed", {
        "error.type": errorType(error),
      })
    }
    throw error
  }
}
