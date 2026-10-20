import { redactAuthTelemetry } from "./lib/sentry-privacy"
import * as Sentry from "@sentry/nextjs"
import { sentryDsn } from "./lib/sentry"

const callbackParams = new URLSearchParams(window.location.search)
const isOAuthCallback =
  callbackParams.has("code") || callbackParams.has("state")

Sentry.init({
  beforeSend: redactAuthTelemetry,
  beforeSendTransaction: redactAuthTelemetry,
  dsn: sentryDsn,
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,
  tracesSampleRate: process.env.NODE_ENV === "development" ? 1 : 0.1,
  integrations: isOAuthCallback
    ? []
    : [
        Sentry.replayIntegration({
          maskAllText: true,
          maskAllInputs: true,
          blockAllMedia: true,
        }),
      ],
  replaysSessionSampleRate: isOAuthCallback
    ? 0
    : process.env.NODE_ENV === "development"
      ? 1
      : 0.1,
  replaysOnErrorSampleRate: isOAuthCallback ? 0 : 1,
})

Sentry.logger.debug("Browser monitoring initialized", {
  "runtime.kind": "browser",
})

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
