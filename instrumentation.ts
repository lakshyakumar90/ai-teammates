import * as Sentry from "@sentry/nextjs"

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config")
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config")
  }
}

export const onRequestError: typeof Sentry.captureRequestError = async (
  error,
  request,
  context
) => {
  Sentry.logger.error("Server request failed", {
    "http.request.method": request.method,
    route: context.routePath,
    routeType: context.routeType,
    "error.type": error instanceof Error ? error.name : "UnknownError",
  })
  await Sentry.captureRequestError(error, request, context)
}
