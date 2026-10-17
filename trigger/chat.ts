import { chat, defaultStorage } from "@trigger.dev/sdk/ai"
import { z } from "zod"
import { stepCountIs, validateUIMessages } from "ai"

import {
  buildBotInstructions,
  buildGroupBotInstructions,
  buildMemoryContext,
} from "../lib/ai/bot-instructions"
import { getChatMemory } from "../lib/ai/chat-memory"
import { createRoutedMemoryTools } from "../lib/ai/memory-manager"
import { captureUserMemory } from "../lib/ai/memory-capture"
import { getChatBot, getGroupBots, isGroupChat } from "../lib/ai/bot-context"
import {
  createGroupHandoffTools,
  createGroupWorkflow,
} from "../lib/ai/group-handoff"
import { createComputerTools, getChatSandbox } from "../lib/ai/computer-tools"
import { modelOptions } from "../lib/ai/models"
import { meteredModel } from "../lib/ai/usage-model"
import { ensureUsagePeriod } from "../lib/usage"
import { responseTimeoutPolicy } from "../lib/ai/response-timeout"
import { ChatRequestError, chatErrorMessage } from "../lib/ai/chat-error"
import { requireUserPaidPlan } from "../lib/billing-agent"
import { logger, errorType } from "../lib/logging"

export const chatAgent = chat.agent({
  id: "chat-agent",
  onTurnStart: async ({ chatId, runId, turn }) => {
    logger.info("Chat turn started", { chatId, "trigger.run.id": runId, turn })
  },
  onTurnComplete: async ({ chatId, runId, turn, stopped }) => {
    logger.info("Chat turn finished", {
      chatId,
      "trigger.run.id": runId,
      turn,
      stopped,
    })
  },
  storage: defaultStorage,
  clientDataSchema: z.object({
    modelId: z.string(),
    botId: z.string().min(1).optional(),
  }),
  tools: async ({ chatId, clientData }) => {
    let activeBotId = clientData?.botId
    const memory = createRoutedMemoryTools(() =>
      getChatMemory(chatId, activeBotId)
    )
    if (await isGroupChat(chatId))
      return {
        ...createGroupHandoffTools(
          await getGroupBots(chatId),
          activeBotId,
          (id) => {
            activeBotId = id
          }
        ),
        ...memory,
      }
    return {
      ...createComputerTools(
        () => getChatSandbox(chatId),
        modelOptions.find(({ id }) => id === clientData?.modelId)
          ?.supportsImages ?? false
      ),
      ...memory,
    }
  },
  onValidateMessages: async ({ chatId, messages }) => {
    try {
      return await validateUIMessages({
        messages,
        tools: {
          ...((await isGroupChat(chatId))
            ? createGroupHandoffTools(await getGroupBots(chatId))
            : createComputerTools(() => getChatSandbox(chatId), false)),
          ...createRoutedMemoryTools(() => getChatMemory(chatId)),
        },
      })
    } catch (error) {
      logger.warn("Chat message validation failed", {
        chatId,
        "error.type": errorType(error),
      })
      throw new ChatRequestError(
        "The message could not be validated. Refresh the chat and retry."
      )
    }
  },
  uiMessageStreamOptions: {
    onError: (error) => {
      logger.error("Chat stream failed", { "error.type": errorType(error) })
      return chatErrorMessage(error)
    },
  },
  run: async ({ chatId, messages, tools, clientData, signal, streamText }) => {
    if (!clientData) throw new ChatRequestError("Missing model selection")
    const option = modelOptions.find(({ id }) => id === clientData.modelId)
    if (!option)
      throw new ChatRequestError(
        "This model is no longer available. Select another model."
      )
    const onStreamError = (error: unknown) => {
      logger.error("Chat stream failed", {
        chatId,
        modelId: clientData.modelId,
        provider: option.provider,
        "error.type": errorType(error),
      })
      return chatErrorMessage(error, option.provider)
    }
    chat.setUIMessageStreamOptions({ onError: onStreamError })
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
      await requireUserPaidPlan(bot.userId)
      const period = await ensureUsagePeriod(bot.userId)
      const model = await meteredModel(
        clientData.modelId,
        bot.userId,
        period.id
      )
      const memory = await getChatMemory(chatId, bot.id)
      const snapshot = await memory.read()
      const facts = memory.preferences.automaticMemory
        ? await captureUserMemory({
            model,
            messages,
            signal,
            group,
            memory: snapshot,
          })
        : []
      await memory.remember(facts)
      logger.debug("Chat memory preparation completed", {
        chatId,
        modelId: clientData.modelId,
        group,
        factCount: facts.length,
      })
      const common = {
        model,
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
      const loadMemory = async (active: typeof bot) => {
        signal.throwIfAborted()
        const authorized = await getChatMemory(chatId, active.id)
        return `${buildMemoryContext(await authorized.read())}\nMemory preferences: ${JSON.stringify(authorized.preferences)}. When automaticMemory is false, new saves are paused; you may still delete facts on request. Do not claim to save new information while saving is paused.`
      }
      if (!group)
        return streamText({
          ...common,
          instructions: `${buildBotInstructions(bot)}\n\n${await loadMemory(bot)}`,
          tools,
          stopWhen: stepCountIs(20),
        })

      const members = await getGroupBots(chatId)
      chat.setUIMessageStreamOptions({
        onError: onStreamError,
        messageMetadata: ({ part }) =>
          part.type === "start"
            ? { bot: { id: bot.id, name: bot.name, avatar: bot.avatar } }
            : undefined,
      })
      return streamText({
        ...common,
        instructions: buildGroupBotInstructions(bot, members),
        tools,
        stopWhen: stepCountIs(6),
        prepareStep: createGroupWorkflow({
          bot,
          messages,
          recipientTools: ["readMemory", "writeMemory"],
          loadMemory,
          resolveBot: async (id) => {
            const recipient = await getChatBot(chatId, id)
            return recipient
          },
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
      logger.warn("Chat turn preparation failed", {
        chatId,
        "error.type": errorType(error),
      })
      throw new ChatRequestError(chatErrorMessage(error))
    }
  },
})
