// Shared by the server and worker. Client imports must be type-only.
import { createGoogleGenerativeAI } from "@ai-sdk/google"
import { createOpenAICompatible } from "@ai-sdk/openai-compatible"
import { createOpenAI } from "@ai-sdk/openai"

const router = (apiKey: string) =>
  createOpenAICompatible({
    name: "openrouter",
    baseURL: "https://openrouter.ai/api/v1",
    apiKey,
    includeUsage: true,
    supportsStructuredOutputs: true,
    supportsMultiPartToolContent: true,
  })
// Empty credentials prevent SDK environment-key fallback, even for direct imports.
export const models = {
  "gemini-3-flash": {
    label: "Gemini 3 Flash Preview",
    provider: "Google Gemini",
    keyProvider: "gemini",
    supportsImages: true,
    model: createGoogleGenerativeAI({ apiKey: "" })("gemini-3-flash-preview"),
  },
  "openrouter-dots-3-note": {
    label: "Dots3-Note Preview (free)",
    provider: "OpenRouter",
    keyProvider: "openrouter",
    supportsImages: true,
    model: router("")("dots-studio/dots-3-note-preview:free"),
  },
  "openrouter-lfm-2.5-2.6b": {
    label: "LFM2.5-2.6B (free)",
    provider: "OpenRouter",
    keyProvider: "openrouter",
    supportsImages: false,
    model: router("")("liquid/lfm-2.5-2.6b:free"),
  },
  "openrouter-nemotron-3-super": {
    label: "Nemotron 3 Super 120B A12B (free)",
    provider: "OpenRouter",
    keyProvider: "openrouter",
    supportsImages: false,
    model: router("")("nvidia/nemotron-3-super-120b-a12b:free"),
  },
  "openai-gpt-6.1-sol": {
    label: "GPT-6.1 Sol",
    provider: "OpenAI",
    keyProvider: "openai",
    supportsImages: true,
    model: createOpenAI({ apiKey: "" }).responses("gpt-6.1-sol"),
  },
} as const
export type ModelId = string
export type ModelOption = {
  id: string
  label: string
  provider: string
  supportsImages: boolean
  configured?: boolean
}
export const defaultModelId = "gemini-3-flash"
export const modelOptions: ModelOption[] = Object.entries(models).map(
  ([id, entry]) => ({
    id,
    label: entry.label,
    provider: entry.provider,
    supportsImages: entry.supportsImages,
  })
)
export class ModelConfigurationError extends Error {
  constructor(provider: string) {
    super(
      `Add your ${provider} API key in /api-keys before using this model. AI Teammates does not provide AI credits.`
    )
    this.name = "ModelConfigurationError"
  }
}
export function modelEntry(modelId: string) {
  if (!Object.hasOwn(models, modelId)) throw new Error("Unknown model")
  return models[modelId as keyof typeof models]
}
export function getModel(modelId: string, apiKey?: string) {
  const entry = modelEntry(modelId)
  if (!apiKey?.trim()) throw new ModelConfigurationError(entry.provider)
  if (entry.keyProvider === "gemini")
    return createGoogleGenerativeAI({ apiKey })(entry.model.modelId)
  if (entry.keyProvider === "openrouter")
    return router(apiKey)(entry.model.modelId)
  return createOpenAI({ apiKey }).responses(entry.model.modelId)
}
