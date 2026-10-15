import { chat, defaultStorage } from "@trigger.dev/sdk/ai"
import { z } from "zod"
import { validateUIMessages } from "ai"

import { getModel, modelOptions } from "../lib/ai/models"

export const chatAgent = chat.agent({
  id: "chat-agent",
  storage: defaultStorage,
  clientDataSchema: z.object({ modelId: z.string() }),
  onValidateMessages: ({ messages }) => validateUIMessages({ messages }),
  uiMessageStreamOptions: {
    onError: () =>
      "The selected provider couldn't respond. Check its credentials, model availability, or connection and retry.",
  },
  run: async ({ messages, clientData, signal, streamText }) => {
    if (!clientData) throw new Error("Missing model selection")
    const model = getModel(clientData.modelId)
    const option = modelOptions.find(({ id }) => id === clientData.modelId)!
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
      throw new Error(
        "This model only supports text. Choose an image-capable model for conversations with attachments."
      )
    }
    return streamText({ model, messages, abortSignal: signal })
  },
})
