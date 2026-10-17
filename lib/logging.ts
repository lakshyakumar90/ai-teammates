// Shared by the Next.js server and Trigger.dev worker; never import in client UI.
import { logger } from "@sentry/node"

export { logger }

export function errorType(error: unknown) {
  return error instanceof Error ? error.name : "UnknownError"
}

export async function logOperation<T>(
  operation: string,
  run: () => Promise<T>
): Promise<T> {
  const startedAt = Date.now()
  logger.debug("Operation started", { operation })
  try {
    const result = await run()
    const rejected =
      typeof result === "object" && result !== null && "error" in result
    const attributes = { operation, duration_ms: Date.now() - startedAt }
    if (rejected) logger.warn("Operation rejected", attributes)
    else logger.info("Operation completed", attributes)
    return result
  } catch (error) {
    // Next.js uses thrown values for redirects and HTTP fallbacks.
    if (
      typeof error === "object" &&
      error !== null &&
      "digest" in error &&
      typeof error.digest === "string" &&
      /^(NEXT_REDIRECT|NEXT_HTTP_ERROR_FALLBACK)/.test(error.digest)
    ) {
      throw error
    }
    const attributes = {
      operation,
      duration_ms: Date.now() - startedAt,
      "error.type": errorType(error),
    }
    if (
      [
        "UsageLimitError",
        "PaidPlanRequiredError",
        "ZodError",
        "ChatRequestError",
      ].includes(errorType(error))
    )
      logger.warn("Operation rejected", attributes)
    else logger.error("Operation failed", attributes)
    throw error
  }
}
