import "server-only"
import { auth } from "@clerk/nextjs/server"
import { checkPaidAccess } from "./access-policy"
import { requireUserPaidPlan } from "./billing-agent"
import { headers, cookies } from "next/headers"
import { logger } from "./logging"

export async function getPaidAccessError() {
  const { userId } = await auth()
  if (!userId) {
    const requestHeaders = await headers()
    const cookieStore = await cookies()
    const reason = requestHeaders.get("x-clerk-auth-reason") ?? "unknown"
    logger.warn("Server action session unavailable", {
      "auth.reason": /^[a-z0-9_-]{1,80}$/i.test(reason) ? reason : "unknown",
      "auth.session_cookie_present": cookieStore
        .getAll()
        .some(
          ({ name }) => name === "__session" || name.startsWith("__session_")
        ),
    })
  }
  return checkPaidAccess(userId, requireUserPaidPlan)
}
