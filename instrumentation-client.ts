import * as Sentry from "@sentry/nextjs"
import { sentryDsn } from "./lib/sentry"

Sentry.init({
  dsn: sentryDsn,
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,
  tracesSampleRate: process.env.NODE_ENV === "development" ? 1 : 0.1,
  integrations: [
    Sentry.replayIntegration({
      maskAllText: true,
      maskAllInputs: true,
      blockAllMedia: true,
    }),
  ],
  replaysSessionSampleRate: process.env.NODE_ENV === "development" ? 1 : 0.1,
  replaysOnErrorSampleRate: 1,
})

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
