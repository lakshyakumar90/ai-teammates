import { createOpenAI } from "@ai-sdk/openai"
import {
  communityCatalog,
  communityChatGPTSession,
  communityTransport,
} from "../community-chatgpt"
import type { ModelOption } from "./models"
import { wrapLanguageModel } from "ai"
import { verifiedChatGPTResponse } from "./chatgpt-stream"
import { ChatGPTConnectionError } from "../chatgpt"

export async function communityChatGPTModels(
  userId: string
): Promise<ModelOption[]> {
  return (await communityCatalog(await communityChatGPTSession(userId))).map(
    (m) => ({
      id: `chatgpt-community:${m.slug}`,
      label: m.display_name || m.slug,
      provider: "ChatGPT (experimental)",
      supportsImages: m.input_modalities?.includes("image") ?? false,
    })
  )
}

export function communityChatGPTModel(userId: string, modelId: string) {
  const transport = communityTransport(() => communityChatGPTSession(userId))
  const model = createOpenAI({
    apiKey: "oauth-managed-per-user",
    baseURL: transport.baseURL,
    fetch: async (url, init) => {
      if (String(url) !== `${transport.baseURL}/responses`)
        throw new Error("Unsupported experimental ChatGPT endpoint")
      return verifiedChatGPTResponse(await transport.fetch(url, init))
    },
  }).responses(modelId)
  return wrapLanguageModel({
    model,
    middleware: {
      specificationVersion: "v4",
      wrapGenerate: async () => {
        throw new ChatGPTConnectionError(
          "ChatGPT requires the streaming model path."
        )
      },
      transformParams: async ({ params }) => ({
        ...params,
        providerOptions: {
          ...params.providerOptions,
          openai: { ...params.providerOptions?.openai, store: false },
        },
      }),
    },
  })
}
