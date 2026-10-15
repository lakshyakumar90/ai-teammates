import { chat, defaultStorage } from "@trigger.dev/sdk/ai"
import { z } from "zod"
import { validateUIMessages } from "ai"

import { getModel, modelOptions } from "../lib/ai/models"
import { ChatRequestError, chatErrorMessage } from "../lib/ai/chat-error"

export const chatAgent = chat.agent({
  id: "chat-agent",
  storage: defaultStorage,
  clientDataSchema: z.object({ modelId: z.string() }),
  onValidateMessages: async ({ messages }) => {
    try {
      return await validateUIMessages({ messages })
    } catch {
      throw new ChatRequestError(
        "The message could not be validated. Refresh the chat and retry."
      )
    }
  },
  uiMessageStreamOptions: {
    onError: chatErrorMessage,
  },
  run: async ({ messages, clientData, signal, streamText }) => {
    if (!clientData) throw new ChatRequestError("Missing model selection")
    const option = modelOptions.find(({ id }) => id === clientData.modelId)
    if (!option)
      throw new ChatRequestError(
        "This model is no longer available. Select another model."
      )
    chat.setUIMessageStreamOptions({
      onError: (error) => chatErrorMessage(error, option.provider),
    })
    if (
      !option.supportsImages &&
      messages.some(
        (message) =>
          typeof message.content !== "string" &&
          message.content.some(
            (part) => part.type === "image" || part.type === "file"
          )
      )
    ) {
      throw new ChatRequestError(
        "This model only supports text. Choose an image-capable model for conversations with attachments."
      )
    }
    try {
      return streamText({
        model: getModel(clientData.modelId),
        messages,
        abortSignal: signal,
        maxRetries: 0,
      })
    } catch (error) {
      throw new ChatRequestError(chatErrorMessage(error))
    }
  },
})
