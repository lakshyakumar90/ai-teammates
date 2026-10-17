import * as Sentry from "@sentry/node"
import { tasks } from "@trigger.dev/sdk"
import { sentryDsn } from "../lib/sentry"
import { errorType } from "../lib/logging"

Sentry.init({
  dsn: process.env.SENTRY_DSN ?? sentryDsn,
  environment: process.env.TRIGGER_ENVIRONMENT_TYPE ?? process.env.NODE_ENV,
  release: process.env.SENTRY_RELEASE,
  // Trigger.dev owns the worker's OpenTelemetry provider and tracing.
  defaultIntegrations: false,
  enableOpenTelemetrySetup: false,
})

tasks.onStartAttempt(({ ctx }) => {
  Sentry.logger.info("Task attempt started", {
    "trigger.task.id": ctx.task.id,
    "trigger.run.id": ctx.run.id,
    attempt: ctx.attempt.number,
  })
})

tasks.onSuccess(async ({ ctx }) => {
  Sentry.logger.info("Task completed", {
    "trigger.task.id": ctx.task.id,
    "trigger.run.id": ctx.run.id,
  })
  await Sentry.flush(2000)
})

tasks.onWait(async () => {
  await Sentry.flush(2000)
})

tasks.onFailure(async ({ error, ctx }) => {
  Sentry.logger.error("Task failed after retries", {
    "trigger.task.id": ctx.task.id,
    "trigger.run.id": ctx.run.id,
    "error.type": errorType(error),
  })
  Sentry.withScope((scope) => {
    scope.setTags({
      "runtime.kind": "trigger.dev",
      "trigger.task.id": ctx.task.id,
      "trigger.run.id": ctx.run.id,
    })
    Sentry.captureException(error)
  })
  // Workers can shut down immediately after the final failure hook.
  await Sentry.flush(2000)
})
