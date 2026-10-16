"use client"

import { useChat } from "@ai-sdk/react"
import {
  useLoadTranscript,
  useTriggerChatTransport,
} from "@trigger.dev/sdk/chat/react"
import type { TriggerChatTransport } from "@trigger.dev/sdk/chat"
import { getToolName, isToolUIPart, type UIMessage } from "ai"
import Image from "next/image"
import { CheckIcon, ChevronDownIcon } from "lucide-react"
import { useState } from "react"
import { z } from "zod"

import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation"
import {
  Message,
  MessageAttachment,
  MessageAttachments,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message"
import {
  ModelSelector,
  ModelSelectorContent,
  ModelSelectorEmpty,
  ModelSelectorGroup,
  ModelSelectorInput,
  ModelSelectorItem,
  ModelSelectorList,
  ModelSelectorName,
  ModelSelectorTrigger,
} from "@/components/ai-elements/model-selector"
import {
  PromptInput,
  PromptInputActionAddAttachments,
  PromptInputActionMenu,
  PromptInputActionMenuContent,
  PromptInputActionMenuTrigger,
  PromptInputBody,
  PromptInputButton,
  PromptInputFooter,
  PromptInputHeader,
  PromptInputSelect,
  PromptInputSelectTrigger,
  PromptInputSelectContent,
  PromptInputSelectItem,
  PromptInputSelectValue,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  usePromptInputAttachments,
} from "@/components/ai-elements/prompt-input"
import { ChatAvatar } from "@/components/chat-avatar"
import {
  GroupChatAvatar,
  type GroupAvatarBot,
} from "@/components/group-chat-avatar"
import { Button } from "@/components/ui/button"
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from "@/components/ai-elements/tool"
import { groupMessageSegments } from "@/lib/ai/group-message-segments"
import { isVisibleMessagePart, screenImageUrl } from "@/lib/ai/tool-display"
import { DropdownMenuGroup } from "@/components/ui/dropdown-menu"
import { FieldError } from "@/components/ui/field"
import { Spinner } from "@/components/ui/spinner"
import type { ModelId, ModelOption } from "@/lib/ai/models"
import {
  loadChatTranscript,
  mintChatAccessToken,
  startChatSession,
} from "@/actions/chat"
import type { chatAgent } from "@/trigger/chat"

const messageBotSchema = z.object({
  id: z.string(),
  name: z.string(),
  avatar: z.string(),
})

function getMessageBot(message: UIMessage, latest = false) {
  const botPart = latest
    ? message.parts.findLast((part) => part.type === "data-bot")
    : message.parts.find((part) => part.type === "data-bot")
  const metadata = message.metadata
  const saved =
    botPart && "data" in botPart
      ? botPart.data
      : metadata && typeof metadata === "object" && "bot" in metadata
        ? metadata.bot
        : undefined
  return messageBotSchema.safeParse(saved)
}

function MessageBotAvatar({
  message,
  bots,
}: {
  message: UIMessage
  bots: GroupAvatarBot[]
}) {
  const result = getMessageBot(message)
  if (!result.success)
    return <GroupChatAvatar bots={bots} className="mt-1 size-7" />
  const { name, avatar } = result.data
  return (
    <span role="img" aria-label={name} title={name} className="mt-1 shrink-0">
      <span aria-hidden="true">
        <ChatAvatar seed={avatar} className="size-7 rounded-full" />
      </span>
    </span>
  )
}

function MessageBotName({ message }: { message: UIMessage }) {
  const result = getMessageBot(message)
  return result.success ? (
    <span className="text-xs font-medium text-muted-foreground">
      {result.data.name}
    </span>
  ) : null
}

function ComposerAttachments() {
  const attachments = usePromptInputAttachments()
  if (!attachments.files.length) return null
  return (
    <PromptInputHeader>
      <MessageAttachments>
        {attachments.files.map((file) => (
          <MessageAttachment
            key={file.id}
            data={file}
            onRemove={() => attachments.remove(file.id)}
          />
        ))}
      </MessageAttachments>
    </PromptInputHeader>
  )
}

function ComposerSubmit({
  input,
  pending,
  stop,
}: {
  input: string
  pending: boolean
  stop: () => void
}) {
  const attachments = usePromptInputAttachments()
  return (
    <PromptInputSubmit
      status={pending ? "streaming" : "ready"}
      type={pending ? "button" : "submit"}
      variant="default"
      aria-label={pending ? "Stop response" : "Send message"}
      disabled={!pending && !input.trim() && !attachments.files.length}
      onClick={pending ? stop : undefined}
    />
  )
}

type ChatProps = {
  chatId: string
  groupBots?: GroupAvatarBot[]
  defaultModelId: ModelId
  modelOptions: ModelOption[]
}

function unwrapChatAction<T>(result: { data: T } | { error: string }) {
  if ("error" in result) throw new Error(result.error)
  return result.data
}

export function Chat(props: ChatProps) {
  const transport = useTriggerChatTransport<typeof chatAgent>({
    task: "chat-agent",
    accessToken: async ({ chatId }) =>
      unwrapChatAction(await mintChatAccessToken(chatId)),
    startSession: async ({ chatId, clientData }) =>
      unwrapChatAction(await startChatSession({ chatId, clientData })),
    clientData: { modelId: props.defaultModelId },
  })
  const transcript = useLoadTranscript(
    props.chatId,
    async ({ chatId }) => {
      const session = await transport.start(chatId)
      // Let the server check for an in-flight turn when reconnecting after a reload.
      transport.setSession(chatId, {
        publicAccessToken: session.publicAccessToken,
      })
      return unwrapChatAction(await loadChatTranscript({ chatId }))
    },
    { transport }
  )

  if (transcript.isLoading)
    return (
      <div
        role="status"
        className="flex flex-1 items-center justify-center gap-2"
      >
        <Spinner />
        <span className="sr-only">Loading conversation</span>
      </div>
    )
  if (transcript.error)
    return (
      <div role="alert" className="p-4">
        <FieldError>
          {transcript.error.message ||
            "Couldn't load this conversation. Refresh the page to retry."}
        </FieldError>
      </div>
    )

  return (
    <ChatView
      {...props}
      transport={transport}
      initialMessages={transcript.messages}
    />
  )
}

function ChatView({
  chatId,
  defaultModelId,
  modelOptions,
  transport,
  initialMessages,
  groupBots,
}: ChatProps & {
  transport: TriggerChatTransport
  initialMessages: UIMessage[]
}) {
  const [selectedBotId, setSelectedBotId] = useState(() => {
    const last = initialMessages.findLast(
      (message) => message.role === "assistant"
    )
    const parsed = last
      ? getMessageBot(last, true)
      : messageBotSchema.safeParse(undefined)
    return parsed.success && groupBots?.some((bot) => bot.id === parsed.data.id)
      ? parsed.data.id
      : groupBots?.[0]?.id
  })
  const selectedBot =
    groupBots?.find((bot) => bot.id === selectedBotId) ?? groupBots?.[0]
  const botId = selectedBot?.id
  const [input, setInput] = useState("")
  const [selectedModelId, setModelId] = useState<ModelId>(defaultModelId)
  const [modelPickerOpen, setModelPickerOpen] = useState(false)
  const [attachmentError, setAttachmentError] = useState<string>()
  const selectedModel =
    modelOptions.find((model) => model.id === selectedModelId) ??
    modelOptions.find((model) => model.id === defaultModelId)!
  const modelId = selectedModel.id
  const {
    messages,
    sendMessage,
    status,
    stop: stopLocal,
    error,
    regenerate,
  } = useChat({
    id: chatId,
    transport,
    messages: initialMessages,
    resume: initialMessages.length > 0,
    onFinish: ({ message, isAbort, isError }) => {
      if (!groupBots) return
      const parsed = getMessageBot(message, true)
      if (
        !isAbort &&
        !isError &&
        parsed.success &&
        groupBots.some((bot) => bot.id === parsed.data.id)
      )
        setSelectedBotId(parsed.data.id)
    },
  })
  const stop = () => {
    void stopLocal()
    void transport.stopGeneration(chatId)
  }
  const pending = status === "submitted" || status === "streaming"
  const providers = [...new Set(modelOptions.map((model) => model.provider))]
  const lastMessage = messages.at(-1)
  const thinking =
    status === "submitted" ||
    (status === "streaming" &&
      lastMessage?.role === "assistant" &&
      !lastMessage.parts.some((part) => part.type === "text" && part.text))

  return (
    <div className="grid min-h-0 w-full min-w-0 flex-1 grid-cols-[minmax(0,1fr)] grid-rows-[minmax(0,1fr)_auto] overflow-hidden">
      <Conversation
        className="min-h-0 min-w-0 overflow-hidden"
        aria-label="Chat messages"
      >
        <ConversationContent
          scrollClassName="min-h-0 overflow-y-auto overscroll-contain"
          className="gap-4 px-3 py-4 sm:px-4"
        >
          {messages
            .flatMap((message) =>
              groupBots ? groupMessageSegments(message) : [message]
            )
            .filter(
              (message) =>
                message.parts.some(isVisibleMessagePart) ||
                (groupBots &&
                  pending &&
                  message.id.startsWith(`${messages.at(-1)?.id}:bot:`) &&
                  message.parts.some((part) => part.type === "data-bot"))
            )
            .map((message) => (
              <Message
                from={message.role}
                key={message.id}
                className={
                  groupBots && message.role === "assistant"
                    ? "flex-row items-start"
                    : undefined
                }
              >
                {groupBots && message.role === "assistant" ? (
                  <MessageBotAvatar message={message} bots={groupBots} />
                ) : null}
                <span className="sr-only">
                  {message.role === "user" ? "You" : "Assistant"}
                </span>
                <MessageContent>
                  {groupBots && message.role === "assistant" ? (
                    <MessageBotName message={message} />
                  ) : null}
                  {pending && !message.parts.some(isVisibleMessagePart) ? (
                    <span
                      role="status"
                      className="flex items-center gap-2 text-muted-foreground"
                    >
                      <Spinner />
                      Preparing a response…
                    </span>
                  ) : null}
                  {message.parts.map((part, index) => {
                    if (!isVisibleMessagePart(part)) return null
                    if (isToolUIPart(part)) {
                      const name = getToolName(part)
                      const output = "output" in part ? part.output : undefined
                      const imageUrl =
                        name === "showScreen"
                          ? screenImageUrl(output)
                          : undefined
                      return (
                        <Tool
                          key={part.toolCallId}
                          defaultOpen={name === "showScreen"}
                        >
                          <ToolHeader
                            type={`tool-${name}`}
                            state={part.state}
                            title={
                              name === "handoff"
                                ? `Hand off to ${
                                    groupBots?.find((bot) => {
                                      const input = part.input
                                      return (
                                        input &&
                                        typeof input === "object" &&
                                        "botId" in input &&
                                        input.botId === bot.id
                                      )
                                    })?.name ?? "another bot"
                                  }`
                                : name
                                    .replace(/([A-Z])/g, " $1")
                                    .replace(/^./, (letter) =>
                                      letter.toUpperCase()
                                    )
                            }
                          />
                          <ToolContent>
                            {name !== "showScreen" && (
                              <ToolInput input={part.input ?? {}} />
                            )}
                            <ToolOutput
                              output={
                                name === "showScreen" ? (
                                  imageUrl ? (
                                    <Image
                                      src={imageUrl}
                                      alt="Current bot sandbox screen"
                                      width={1280}
                                      height={720}
                                      unoptimized
                                      className="h-auto max-w-full rounded-md"
                                    />
                                  ) : undefined
                                ) : (
                                  output
                                )
                              }
                              errorText={
                                "errorText" in part ? part.errorText : undefined
                              }
                            />
                          </ToolContent>
                        </Tool>
                      )
                    }
                    if (part.type === "text") {
                      return message.role === "user" ? (
                        <p
                          key={index}
                          className="[overflow-wrap:anywhere] whitespace-pre-wrap"
                        >
                          {part.text}
                        </p>
                      ) : (
                        <MessageResponse
                          key={index}
                          isAnimating={
                            status === "streaming" &&
                            (message.id === messages.at(-1)?.id ||
                              message.id.startsWith(
                                `${messages.at(-1)?.id}:bot:`
                              ))
                          }
                        >
                          {part.text}
                        </MessageResponse>
                      )
                    }
                    if (part.type === "file")
                      return <MessageAttachment key={index} data={part} />
                    return null
                  })}
                </MessageContent>
              </Message>
            ))}
          {thinking && (
            <div
              role="status"
              className="flex items-center gap-2 text-sm text-muted-foreground"
            >
              <Spinner />
              <span>Thinking…</span>
            </div>
          )}
        </ConversationContent>
        <ConversationScrollButton aria-label="Scroll to latest message" />
      </Conversation>
      <div className="flex min-w-0 shrink-0 flex-col gap-2 p-2 sm:p-3">
        {(error || attachmentError) && (
          <div role="alert" className="flex flex-wrap items-center gap-2 px-1">
            <FieldError>
              {attachmentError ??
                error?.message ??
                "Couldn't get a response. Please try again."}
            </FieldError>
            {error && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  if (!pending)
                    void regenerate({ metadata: { modelId, botId } })
                }}
              >
                Retry
              </Button>
            )}
          </div>
        )}
        <PromptInput
          className="max-w-full min-w-0"
          onSubmitCapture={(event) => {
            if (pending) {
              event.preventDefault()
              event.stopPropagation()
            }
          }}
          accept="image/*"
          multiple
          maxFiles={4}
          maxFileSize={5 * 1024 * 1024}
          onError={({ message }) => setAttachmentError(message)}
          onSubmit={({ text, files }) => {
            if (pending || (!text.trim() && !files.length)) return
            if (files.length && !selectedModel.supportsImages) {
              const message =
                "Choose an image-capable model or remove the attachments before sending."
              setAttachmentError(message)
              throw new Error(message)
            }
            setAttachmentError(undefined)
            void sendMessage(
              { text: text.trim(), files },
              { metadata: { modelId, botId } }
            )
            setInput("")
          }}
        >
          <ComposerAttachments />
          <PromptInputBody>
            <PromptInputTextarea
              aria-label="Message"
              placeholder="What would you like to know?"
              value={input}
              onChange={(event) => setInput(event.currentTarget.value)}
            />
          </PromptInputBody>
          <PromptInputFooter>
            <PromptInputTools className="min-w-0 flex-wrap">
              {groupBots ? (
                <PromptInputSelect
                  value={botId}
                  onValueChange={(value) => {
                    if (typeof value === "string") setSelectedBotId(value)
                  }}
                  disabled={pending}
                >
                  <PromptInputSelectTrigger
                    aria-label="Choose which bot to talk to"
                    className="max-w-40"
                  >
                    {selectedBot ? (
                      <ChatAvatar
                        seed={selectedBot.avatar}
                        className="size-5 shrink-0 rounded-full"
                      />
                    ) : null}
                    <PromptInputSelectValue>
                      {selectedBot?.name ?? "Choose a bot"}
                    </PromptInputSelectValue>
                  </PromptInputSelectTrigger>
                  <PromptInputSelectContent>
                    {groupBots.map((bot) => (
                      <PromptInputSelectItem key={bot.id} value={bot.id}>
                        {bot.name}
                      </PromptInputSelectItem>
                    ))}
                  </PromptInputSelectContent>
                </PromptInputSelect>
              ) : null}
              <PromptInputActionMenu>
                <PromptInputActionMenuTrigger
                  aria-label="Add attachments"
                  title={
                    selectedModel.supportsImages
                      ? "Add images"
                      : "This model only supports text"
                  }
                  disabled={!selectedModel.supportsImages}
                />
                <PromptInputActionMenuContent>
                  <DropdownMenuGroup>
                    <PromptInputActionAddAttachments label="Add images" />
                  </DropdownMenuGroup>
                </PromptInputActionMenuContent>
              </PromptInputActionMenu>
              <ModelSelector
                open={modelPickerOpen}
                onOpenChange={setModelPickerOpen}
              >
                <ModelSelectorTrigger
                  render={
                    <PromptInputButton
                      size="sm"
                      aria-label={`Choose model: ${selectedModel.provider}, ${selectedModel.label}`}
                      className="max-w-48 min-w-0 sm:max-w-72"
                    />
                  }
                >
                  <ModelSelectorName>
                    {selectedModel.provider} · {selectedModel.label}
                  </ModelSelectorName>
                  <ChevronDownIcon data-icon="inline-end" />
                </ModelSelectorTrigger>
                <ModelSelectorContent title="Choose a model">
                  <ModelSelectorInput placeholder="Search models…" />
                  <ModelSelectorList>
                    <ModelSelectorEmpty>No models found.</ModelSelectorEmpty>
                    {providers.map((provider) => (
                      <ModelSelectorGroup key={provider} heading={provider}>
                        {modelOptions
                          .filter((model) => model.provider === provider)
                          .map((model) => (
                            <ModelSelectorItem
                              key={model.id}
                              value={model.id}
                              keywords={[model.label, model.provider]}
                              onSelect={() => {
                                setModelId(model.id)
                                setModelPickerOpen(false)
                              }}
                            >
                              <ModelSelectorName>
                                {model.label}
                              </ModelSelectorName>
                              {model.id === modelId && (
                                <CheckIcon aria-label="Selected" />
                              )}
                            </ModelSelectorItem>
                          ))}
                      </ModelSelectorGroup>
                    ))}
                  </ModelSelectorList>
                </ModelSelectorContent>
              </ModelSelector>
            </PromptInputTools>
            <ComposerSubmit
              input={input}
              pending={pending}
              stop={() => void stop()}
            />
          </PromptInputFooter>
        </PromptInput>
      </div>
    </div>
  )
}
