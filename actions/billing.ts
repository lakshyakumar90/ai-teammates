"use server"

import { getPaidAccessError } from "@/lib/billing"

export async function verifyPaidAccess() {
  return (await getPaidAccessError()) ?? { allowed: true as const }
}
