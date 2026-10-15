import { google } from "@ai-sdk/google"

// Add an entry here to make another Gemini model available in the chat UI.
export const models = {
  "gemini-3-flash": {
    label: "gemini-3-flash-preview",
    model: google("gemini-3-flash-preview"),
  }
}

export type ModelId = keyof typeof models
export const defaultModelId: ModelId = "gemini-3-flash";
export const modelOptions = Object.entries(models).map(([id, { label }]) => ({
  id: id as ModelId,
  label,
}))

export function getModel(modelId: string) {
  if (!Object.hasOwn(models, modelId)) {
    throw new Error("Unknown Gemini model")
  }
  return models[modelId as ModelId].model
}
