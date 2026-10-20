import { verifiedChatGPTResponse } from "./chatgpt-stream"
export { verifiedChatGPTResponse } from "./chatgpt-stream"
import { getUserApiKeys } from "./user-api-keys"
import { models } from "./models"
import { createOpenAI } from "@ai-sdk/openai"
import { wrapLanguageModel } from "ai"
import {
  chatGPTAccessToken,
  chatGPTEnabled,
  chatGPTStatus,
  ChatGPTConnectionError,
} from "../chatgpt"
import { modelOptions, type ModelOption } from "./models"
import {
  communityChatGPTEnabled,
  communityChatGPTStatus,
} from "../community-chatgpt"
import { communityChatGPTModels } from "./community-chatgpt-model"

export async function chatGPTModels(userId: string): Promise<ModelOption[]> {
  const accessToken = await chatGPTAccessToken(userId)
  const response = await fetch("https://api.openai.com/v1/models", {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  })
  if (!response.ok)
    throw new ChatGPTConnectionError(
      "ChatGPT models are unavailable. Check your connection in /api-keys."
    )
  const body = (await response.json()) as {
    models: {
      slug: string
      display_name: string
      visibility: string
      input_modalities?: string[]
    }[]
  }
  if (!Array.isArray(body.models))
    throw new ChatGPTConnectionError(
      "ChatGPT returned an invalid model catalog."
    )
  return body.models
    .filter((m) => m.visibility === "list" && typeof m.slug === "string")
    .map((m) => ({
      id: `chatgpt:${m.slug}`,
      label: m.display_name || m.slug,
      provider: "ChatGPT plan",
      // Do not invent image support when the catalog provides no capability metadata.
      supportsImages: m.input_modalities?.includes("image") ?? false,
    }))
}

export async function userModelOptions(userId: string) {
  const keys = await getUserApiKeys(userId)
  const personalOptions = modelOptions.map((option) => ({
    ...option,
    configured: !!keys[models[option.id as keyof typeof models].keyProvider],
  }))
  if (
    communityChatGPTEnabled() &&
    (await communityChatGPTStatus(userId)).connected
  ) {
    try {
      return [
        ...personalOptions,
        ...(await communityChatGPTModels(userId)).map((option) => ({
          ...option,
          configured: true,
        })),
      ]
    } catch {
      return personalOptions
    }
  }
  if (!chatGPTEnabled() || !(await chatGPTStatus(userId)).connected)
    return personalOptions
  try {
    return [
      ...personalOptions,
      ...(await chatGPTModels(userId)).map((option) => ({
        ...option,
        configured: true,
      })),
    ]
  } catch {
    return personalOptions
  } // API-key providers remain usable during ChatGPT outages.
}

// Keep the transport allowlist explicit; never route to ChatGPT backend-api.
export function chatGPTRequestBody(
  body: Record<string, unknown>
): Record<string, unknown> {
  const allowed = [
    "model",
    "input",
    "instructions",
    "tools",
    "tool_choice",
    "parallel_tool_calls",
    "reasoning",
    "text",
    "include",
  ]
  const result = Object.fromEntries(
    allowed
      .filter((key) => body[key] !== undefined)
      .map((key) => [key, body[key]])
  )
  if (!Array.isArray(result.input))
    throw new Error("ChatGPT input must include conversation history")
  const instructions: string[] =
    typeof result.instructions === "string" ? [result.instructions] : []
  result.input = result.input.filter((item: Record<string, unknown>) => {
    if (item.role !== "system") return true
    if (typeof item.content === "string") instructions.push(item.content)
    else if (Array.isArray(item.content))
      instructions.push(
        ...item.content
          .filter((p) => p.type === "input_text")
          .map((p) => p.text)
      )
    return false
  })
  if (instructions.length) result.instructions = instructions.join("\n\n")
  if (Array.isArray(result.tools) && result.tools.length) {
    if (result.tools.some((t) => t.type !== "function" && t.type !== "custom"))
      throw new Error("Unsupported ChatGPT hosted tool")
    result.tools = [
      {
        type: "namespace",
        name: "ai_teammates",
        description: "Tools executed by AI Teammates",
        tools: result.tools,
      },
    ]
    // Responses validates a selected tool against its namespace.
    if (
      result.tool_choice &&
      typeof result.tool_choice === "object" &&
      "name" in result.tool_choice
    )
      result.tool_choice = { ...result.tool_choice, namespace: "ai_teammates" }
  }
  return { ...result, store: false, stream: true }
}

export async function chatGPTModel(userId: string, slug: string) {
  const options = await chatGPTModels(userId)
  if (!options.some((option) => option.id === `chatgpt:${slug}`))
    throw new ChatGPTConnectionError(
      "This model is not available to your ChatGPT account."
    )
  const provider = createOpenAI({
    // A fresh token is resolved for every request, including long tool loops.
    apiKey: "oauth-resolved-per-request",
    fetch: async (url, init) => {
      if (String(url) !== "https://api.openai.com/v1/responses")
        throw new Error("Unsupported ChatGPT endpoint")
      const token = await chatGPTAccessToken(userId)
      const headers = new Headers(init?.headers)
      headers.set("Authorization", `Bearer ${token}`)
      return verifiedChatGPTResponse(
        await fetch(url, {
          ...init,
          headers,
          body: JSON.stringify(
            chatGPTRequestBody(JSON.parse(String(init?.body)))
          ),
        })
      )
    },
  })
  return wrapLanguageModel({
    model: provider.responses(slug),
    middleware: {
      specificationVersion: "v4",
      wrapGenerate: async () => {
        throw new ChatGPTConnectionError(
          "ChatGPT requires streaming. Use the streaming model path."
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
