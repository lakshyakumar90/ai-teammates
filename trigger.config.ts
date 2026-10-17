import { defineConfig } from "@trigger.dev/sdk"
import { esbuildPlugin } from "@trigger.dev/build/extensions"
import { sentryEsbuildPlugin } from "@sentry/esbuild-plugin"

export default defineConfig({
  project: "proj_sssnetbqmvjbwyyailic",
  runtime: "node-24",
  logLevel: "log",
  // The max compute seconds a task is allowed to run. If the task run exceeds this duration, it will be stopped.
  // You can override this on an individual task.
  // See https://trigger.dev/docs/runs/max-duration
  maxDuration: 3600,
  retries: {
    enabledInDev: true,
    default: {
      maxAttempts: 3,
      minTimeoutInMs: 1000,
      maxTimeoutInMs: 10000,
      factor: 2,
      randomize: true,
    },
  },
  dirs: ["trigger"],
  // Daytona dynamically loads its multipart upload/download dependencies.
  build: {
    external: ["@daytona/sdk"],
    extensions: [
      esbuildPlugin(
        sentryEsbuildPlugin({
          org: "devtinder-oe",
          project: "ai-teammates",
          authToken: process.env.SENTRY_AUTH_TOKEN,
          release: { name: process.env.SENTRY_RELEASE },
        }),
        { placement: "last", target: "deploy" }
      ),
    ],
  },
})
