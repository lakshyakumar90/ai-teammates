import "server-only"
import { auth } from "@clerk/nextjs/server"
import { billingFailure, PaidPlanRequiredError } from "./billing-policy"
import { requireUserPaidPlan } from "./billing-agent"

export async function getPaidAccessError() {
  const { userId } = await auth()
  if (!userId) throw new Error("Not authenticated")
  try {
    await requireUserPaidPlan(userId)
    return undefined
  } catch (error) {
    if (error instanceof PaidPlanRequiredError) return billingFailure
    throw error
  }
}
