import { chat, defaultStorage } from "@trigger.dev/sdk/ai"
import { z } from "zod"
import { stepCountIs, validateUIMessages } from "ai"

import {
  buildBotInstructions,
  buildGroupBotInstructions,
} from "../lib/ai/bot-instructions"
import { getChatBot, getGroupBots, isGroupChat } from "../lib/ai/bot-context"
import {
  createGroupHandoffTools,
  createGroupWorkflow,
} from "../lib/ai/group-handoff"
import { createComputerTools, getChatSandbox } from "../lib/ai/computer-tools"
import { getModel, modelOptions } from "../lib/ai/models"
import { responseTimeoutPolicy } from "../lib/ai/response-timeout"
import { ChatRequestError, chatErrorMessage } from "../lib/ai/chat-error"

export const chatAgent = chat.agent({
  id: "chat-agent",
  storage: defaultStorage,
  clientDataSchema: z.object({
    modelId: z.string(),
    botId: z.string().min(1).optional(),
  }),
  tools: async ({ chatId, clientData }) =>
    (await isGroupChat(chatId))
      ? createGroupHandoffTools(await getGroupBots(chatId), clientData?.botId)
      : createComputerTools(
          () => getChatSandbox(chatId),
          modelOptions.find(({ id }) => id === clientData?.modelId)
            ?.supportsImages ?? false
        ),
  onValidateMessages: async ({ chatId, messages }) => {
    try {
      return await validateUIMessages({
        messages,
        tools: (await isGroupChat(chatId))
          ? createGroupHandoffTools(await getGroupBots(chatId))
          : createComputerTools(() => getChatSandbox(chatId), false),
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
      const group = await isGroupChat(chatId)
      const bot = await getChatBot(chatId, clientData.botId)
      const common = {
        model: getModel(clientData.modelId),
        messages,
        abortSignal: signal,
        maxRetries: 0,
        ...responseTimeoutPolicy({
          signal,
          provider: option.provider,
          onTimeout: (errorText) =>
            chat.response.write({ type: "error", errorText }),
        }),
      }
      if (!group)
        return streamText({
          ...common,
          instructions: buildBotInstructions(bot),
          tools,
          stopWhen: stepCountIs(20),
        })

      const members = await getGroupBots(chatId)
      chat.setUIMessageStreamOptions({
        onError: (error) => chatErrorMessage(error, option.provider),
        messageMetadata: ({ part }) =>
          part.type === "start"
            ? { bot: { id: bot.id, name: bot.name, avatar: bot.avatar } }
            : undefined,
      })
      return streamText({
        ...common,
        instructions: buildGroupBotInstructions(bot, members),
        tools,
        stopWhen: stepCountIs(4),
        prepareStep: createGroupWorkflow({
          bot,
          messages,
          resolveBot: (id) => getChatBot(chatId, id),
          instructions: (active, handoff) =>
            buildGroupBotInstructions(active, members, handoff),
          onBotChange: (active) =>
            chat.response.write({
              type: "data-bot",
              id: `bot-${active.id}`,
              data: { id: active.id, name: active.name, avatar: active.avatar },
            }),
        }),
      })
    } catch (error) {
      throw new ChatRequestError(chatErrorMessage(error))
    }
  },
})
