import type { ApiKeyProvider } from "../api-key-schema"

export async function validateProviderKey(
  provider: ApiKeyProvider,
  key: string
) {
  const label =
    provider === "gemini"
      ? "Gemini"
      : provider === "openai"
        ? "OpenAI"
        : "OpenRouter"
  try {
    const response = await fetch(
      provider === "gemini"
        ? "https://generativelanguage.googleapis.com/v1beta/models"
        : provider === "openai"
          ? "https://api.openai.com/v1/models"
          : "https://openrouter.ai/api/v1/key",
      {
        headers:
          provider === "gemini"
            ? { "x-goog-api-key": key }
            : { Authorization: `Bearer ${key}` },
        cache: "no-store",
        signal: AbortSignal.timeout(15_000),
      }
    )
    if (response.ok) return
    if (
      response.status === 400 ||
      response.status === 401 ||
      response.status === 403
    )
      return `${label} rejected this API key. Check the key and its permissions, then try again.`
    if (response.status === 429)
      return `${label} is limiting verification requests. Wait a moment and try again.`
    return `${label} could not verify your key right now. Try again shortly.`
  } catch {
    return `Could not reach ${label} to verify your key. Try again shortly.`
  }
}
