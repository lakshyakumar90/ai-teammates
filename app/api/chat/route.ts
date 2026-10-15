import { auth } from "@clerk/nextjs/server"
import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  streamText,
  toUIMessageStream,
  validateUIMessages,
} from "ai"

import {
  getModel,
  modelOptions,
  ModelConfigurationError,
} from "@/lib/ai/models"

export async function POST(request: Request) {
  const { userId } = await auth()
  if (!userId) {
    return new Response("Unauthorized", { status: 401 })
  }

  let body
  try {
    body = await request.json()
  } catch {
    return new Response("Request body must be valid JSON", { status: 400 })
  }

  if (typeof body?.modelId !== "string") {
    return new Response("Missing modelId", { status: 400 })
  }

  let model
  try {
    model = getModel(body.modelId)
  } catch (error) {
    if (error instanceof ModelConfigurationError) {
      return new Response(error.message, { status: 503 })
    }
    return new Response(
      `Unknown modelId. Available models: ${modelOptions.map(({ id }) => id).join(", ")}`,
      { status: 400 }
    )
  }

  let messages
  try {
    const uiMessages = await validateUIMessages({ messages: body.messages })
    const option = modelOptions.find(({ id }) => id === body.modelId)!
    if (
      !option.supportsImages &&
      uiMessages.some((message) =>
        message.parts.some((part) => part.type === "file")
      )
    ) {
      return new Response(
        "This model only supports text. Choose an image-capable model for conversations with attachments.",
        { status: 400 }
      )
    }
    messages = await convertToModelMessages(uiMessages)
  } catch (error) {
    console.error("Invalid chat messages:", error)
    return new Response(
      "Invalid chat messages. Check the server log for validation details.",
      { status: 400 }
    )
  }

  const result = streamText({
    model,
    messages,
    abortSignal: request.signal,
  })

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({
      stream: result.stream,
      onError: (error) => {
        console.error("Chat provider error:", error)
        return "The selected provider couldn't respond. Check its credentials, model availability, or connection and retry."
      },
    }),
  })
}
