// Shared by the Next.js server and the Trigger.dev worker; client imports must be type-only.
import { google } from "@ai-sdk/google"
import { groq } from "@ai-sdk/groq"
import { createOpenAICompatible } from "@ai-sdk/openai-compatible"

const openrouter = createOpenAICompatible({
  name: "openrouter",
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY,
})

const ollama = createOpenAICompatible({
  name: "ollama",
  baseURL: process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434/v1",
  apiKey: process.env.OLLAMA_API_KEY,
})

const ollamaModelId = process.env.OLLAMA_MODEL || "qwen3:4b"

// Add entries here; only serializable metadata is sent to the chat UI.
export const models = {
  "gemini-3-flash": {
    label: "Gemini 3 Flash Preview",
    provider: "Google Gemini",
    supportsImages: true,
    apiKeyEnv: "GOOGLE_GENERATIVE_AI_API_KEY",
    model: google("gemini-3-flash-preview"),
  },
  "openrouter-gpt-oss-120b": {
    label: "GPT-OSS 120B",
    provider: "OpenRouter",
    supportsImages: false,
    apiKeyEnv: "OPENROUTER_API_KEY",
    model: openrouter("openai/gpt-oss-120b"),
  },
  "groq-gpt-oss-120b": {
    label: "GPT-OSS 120B",
    provider: "Groq",
    supportsImages: false,
    apiKeyEnv: "GROQ_API_KEY",
    model: groq("openai/gpt-oss-120b"),
  },
  "groq-gpt-oss-20b": {
    label: "GPT-OSS 20B",
    provider: "Groq",
    supportsImages: false,
    apiKeyEnv: "GROQ_API_KEY",
    model: groq("openai/gpt-oss-20b"),
  },
  "groq-qwen3.8-27b": {
    label: "Qwen 3.8 27B",
    provider: "Groq",
    supportsImages: true,
    apiKeyEnv: "GROQ_API_KEY",
    model: groq("qwen/qwen3.8-27b"),
  },
  "openrouter-nemotron-3-ultra": {
    label: "Nemotron 3 Ultra 550B A55B (free)",
    provider: "OpenRouter",
    supportsImages: false,
    apiKeyEnv: "OPENROUTER_API_KEY",
    model: openrouter("nvidia/nemotron-3-ultra-550b-a55b:free"),
  },
  "openrouter-laguna-s-2.1": {
    label: "Laguna S 2.1 (free)",
    provider: "OpenRouter",
    supportsImages: false,
    apiKeyEnv: "OPENROUTER_API_KEY",
    model: openrouter("poolside/laguna-s-2.1:free"),
  },
  "openrouter-nemotron-3.5-lightning": {
    label: "Nemotron 3.5 Lightning (free)",
    provider: "OpenRouter",
    supportsImages: false,
    apiKeyEnv: "OPENROUTER_API_KEY",
    model: openrouter("nvidia/nemotron-3.5-lightning:free"),
  },
  "openrouter-gemma-4-31b": {
    label: "Gemma 4 31B (free)",
    provider: "OpenRouter",
    supportsImages: true,
    apiKeyEnv: "OPENROUTER_API_KEY",
    model: openrouter("google/gemma-4-31b-it:free"),
  },
  "ollama-local": {
    label: ollamaModelId,
    provider: "Ollama",
    supportsImages: false,
    apiKeyEnv: null,
    model: ollama(ollamaModelId),
  },
} as const

export type ModelId = keyof typeof models
export const defaultModelId: ModelId = "gemini-3-flash"

export const modelOptions = Object.entries(models).map(([id, model]) => ({
  id: id as ModelId,
  label: model.label,
  provider: model.provider,
  supportsImages: model.supportsImages,
}))
export type ModelOption = (typeof modelOptions)[number]

export class ModelConfigurationError extends Error {
  constructor(variable: string) {
    super(`Set ${variable} in .env.local and restart the development server.`)
    this.name = "ModelConfigurationError"
  }
}

export function getModel(modelId: string) {
  if (!Object.hasOwn(models, modelId)) {
    throw new Error("Unknown model")
  }
  const entry = models[modelId as ModelId]
  if (entry.apiKeyEnv && !process.env[entry.apiKeyEnv]?.trim()) {
    throw new ModelConfigurationError(entry.apiKeyEnv)
  }
  return entry.model
}
