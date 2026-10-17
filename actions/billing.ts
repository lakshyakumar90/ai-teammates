"use server"
import { logOperation } from "@/lib/logging"

import { getPaidAccessError } from "@/lib/billing"

export async function verifyPaidAccess() {
  return logOperation("actions.billing.verifyPaidAccess", async () => {
    return (await getPaidAccessError()) ?? { allowed: true as const }
  })
}
