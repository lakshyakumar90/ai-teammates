import { authenticationFailure } from "./auth-policy"
import {
  billingFailure,
  PaidPlanRequiredError,
  type BillingFailure,
} from "./billing-policy"
import type { AuthenticationFailure } from "./auth-policy"

export type AccessFailure = BillingFailure | AuthenticationFailure

export async function checkPaidAccess(
  userId: string | null,
  requirePaidPlan: (userId: string) => Promise<unknown>
): Promise<AccessFailure | undefined> {
  if (!userId) return authenticationFailure
  try {
    await requirePaidPlan(userId)
  } catch (error) {
    if (error instanceof PaidPlanRequiredError) return billingFailure
    throw error
  }
}
