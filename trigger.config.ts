import { defineConfig } from "@trigger.dev/sdk"
import { esbuildPlugin } from "@trigger.dev/build/extensions"
import {
  additionalPackages,
  syncEnvVars,
} from "@trigger.dev/build/extensions/core"
import { sentryEsbuildPlugin } from "@sentry/esbuild-plugin"
import { loadEnvConfig } from "@next/env"

// Load deploy credentials before build plugins are configured.
loadEnvConfig(process.cwd())

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
      // Daytona loads these with runtime require(), which bundling cannot discover.
      additionalPackages({
        packages: ["@daytona/sdk@0.224.1", "busboy@1.6.0", "form-data@4.0.6"],
      }),
      syncEnvVars(() =>
        [
          "DATABASE_URL",
          "CLERK_SECRET_KEY",
          "DAYTONA_API_KEY",
          "DAYTONA_API_URL",
          "GOOGLE_GENERATIVE_AI_API_KEY",
          "GROQ_API_KEY",
          "OPENROUTER_API_KEY",
          "SENTRY_DSN",
          "SENTRY_RELEASE",
        ].flatMap((name) => {
          const value = process.env[name]
          return value
            ? [
                {
                  name,
                  value,
                  isSecret:
                    name !== "DAYTONA_API_URL" && name !== "SENTRY_RELEASE",
                },
              ]
            : []
        })
      ),
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
