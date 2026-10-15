import { chat, defaultStorage } from "@trigger.dev/sdk/ai"
import { z } from "zod"
import { stepCountIs, validateUIMessages } from "ai"

import { buildBotInstructions } from "../lib/ai/bot-instructions"
import { getChatBot } from "../lib/ai/bot-context"
import { createComputerTools, getChatSandbox } from "../lib/ai/computer-tools"
import { getModel, modelOptions } from "../lib/ai/models"
import { ChatRequestError, chatErrorMessage } from "../lib/ai/chat-error"

export const chatAgent = chat.agent({
  id: "chat-agent",
  storage: defaultStorage,
  clientDataSchema: z.object({ modelId: z.string() }),
  tools: ({ chatId, clientData }) =>
    createComputerTools(
      () => getChatSandbox(chatId),
      modelOptions.find(({ id }) => id === clientData?.modelId)
        ?.supportsImages ?? false
    ),
  onValidateMessages: async ({ chatId, messages }) => {
    try {
      return await validateUIMessages({
        messages,
        tools: createComputerTools(() => getChatSandbox(chatId), false),
      })
    } catch {
      throw new ChatRequestError(
        "The message could not be validated. Refresh the chat and retry."
      )
    }
  },
  uiMessageStreamOptions: {
    onError: chatErrorMessage,
  },
  run: async ({ chatId, messages, tools, clientData, signal, streamText }) => {
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
      const bot = await getChatBot(chatId)
      return streamText({
        model: getModel(clientData.modelId),
        instructions: buildBotInstructions(bot),
        messages,
        tools,
        stopWhen: stepCountIs(20),
        abortSignal: signal,
        maxRetries: 0,
      })
    } catch (error) {
      throw new ChatRequestError(chatErrorMessage(error))
    }
  },
})
