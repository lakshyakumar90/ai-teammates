import { logger } from "../logging"

export function responseTimeoutPolicy({
  signal,
  provider,
  onTimeout,
}: {
  signal: AbortSignal
  provider: string
  onTimeout: (message: string) => void
}) {
  return {
    timeout: {
      firstChunkMs: 30_000,
      chunkMs: 30_000,
      stepMs: 90_000,
      totalMs: 180_000,
    },
    onAbort: () => {
      // Internal model timeouts must be visible errors; pressing Stop stays quiet.
      if (!signal.aborted) {
        logger.warn("Model response timed out", { provider })
        onTimeout(
          `${provider} did not respond in time. Retry or select another model.`
        )
      }
    },
  }
}
