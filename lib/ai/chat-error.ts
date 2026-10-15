import { APICallError, RetryError, StreamProviderError } from "ai"
import { ApiError } from "@trigger.dev/sdk"

import { ModelConfigurationError } from "./models"

export class ChatRequestError extends Error {}

function sanitizeDetail(value: unknown) {
  if (typeof value !== "string") return ""
  let detail = value
  for (const name of [
    "GOOGLE_GENERATIVE_AI_API_KEY",
    "GROQ_API_KEY",
    "OPENROUTER_API_KEY",
    "OLLAMA_API_KEY",
    "TRIGGER_SECRET_KEY",
  ]) {
    const secret = process.env[name]
    if (secret) detail = detail.replaceAll(secret, "[redacted]")
  }
  return detail
    .replace(/Bearer\s+[^\s"']+/gi, "Bearer [redacted]")
    .replace(/\bsk[-_][a-zA-Z0-9_-]+/g, "[redacted]")
    .replace(/([?&](?:key|api_key|token)=)[^\s&"']+/gi, "$1[redacted]")
    .split(/[\r\n]/)[0]
    .slice(0, 400)
}

export function chatErrorMessage(
  error: unknown,
  providerName?: string
): string {
  if (RetryError.isInstance(error))
    return chatErrorMessage(error.lastError, providerName)
  if (
    error instanceof ChatRequestError ||
    error instanceof ModelConfigurationError
  ) {
    return sanitizeDetail(error.message)
  }
  if (error instanceof ApiError) {
    const status = error.status
    const summary =
      status === 401 || status === 403
        ? "Check TRIGGER_SECRET_KEY and access to this chat."
        : status === 429
          ? "Rate limit or quota exceeded. Wait before retrying."
          : status === 404
            ? "Chat or task not found. Start the Trigger.dev worker with chat-agent registered."
            : "The Trigger.dev service could not complete the request. Retry when the connection is available."
    return `Trigger.dev${status ? ` (HTTP ${status})` : ""}: ${summary}`
  }
  if (APICallError.isInstance(error)) {
    const ollamaURL = process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434/v1"
    const isOllama = error.url.startsWith(ollamaURL.replace(/\/$/, "") + "/")
    const provider =
      providerName ??
      (isOllama
        ? "Ollama"
        : error.url.includes("openrouter.ai")
          ? "OpenRouter"
          : error.url.includes("groq.com")
            ? "Groq"
            : error.url.includes("googleapis.com")
              ? "Google"
              : "Model provider")
    let detail = ""
    try {
      const body = JSON.parse(error.responseBody || "{}")
      detail = sanitizeDetail(
        typeof body.error === "string"
          ? body.error
          : (body.error?.message ?? body.message)
      )
    } catch {
      /* Non-JSON responses are not safe to show verbatim. */
    }
    const status = error.statusCode
    if (status === undefined) {
      return isOllama
        ? "Cannot reach Ollama from the Trigger.dev worker. Start Ollama and check OLLAMA_BASE_URL. A cloud worker cannot reach your computer through localhost."
        : `${provider} could not be reached. Check the worker's network connection and retry.`
    }
    const summary =
      status === 401 || status === 403
        ? "Authentication or access denied. Check the provider API key and model access."
        : status === 402
          ? "Insufficient credits. Check the provider account balance."
          : status === 429
            ? "Rate limit or quota exceeded. Wait before retrying or select another model."
            : status === 404 && isOllama
              ? "Model not installed. Pull the model or update OLLAMA_MODEL, then restart the Trigger.dev worker."
              : status === 404
                ? "Model or endpoint unavailable. Select another model."
                : status >= 500
                  ? "The provider is temporarily unavailable. Retry or select another model."
                  : "The provider rejected this request."
    return `${provider} (HTTP ${status}): ${summary}${detail ? ` ${detail}` : ""}`
  }
  // OpenAI-compatible providers can report an API error inside an HTTP-200 SSE stream.
  if (StreamProviderError.isInstance(error)) {
    const detail = sanitizeDetail(error.message)
    if (detail) {
      const code =
        error.code !== undefined &&
        (typeof error.code === "number" ||
          (typeof error.code === "string" && /^[\w-]{1,64}$/.test(error.code)))
          ? ` (${error.code})`
          : ""
      const status = error.statusCode ? ` (HTTP ${error.statusCode})` : code
      return `${providerName ?? "Model provider"}${status}: ${detail}`
    }
  }
  return "The response failed. Please retry or choose another model."
}
