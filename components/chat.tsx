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
import { useRef, useState } from "react"
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
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip"
import { getMentionQuery, resolveBotMention } from "@/lib/ai/bot-mentions"
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
  job: z.string().optional(),
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

function MessageRecipientMention({
  message,
  bots,
}: {
  message: UIMessage
  bots: (GroupAvatarBot & { job: string })[]
}) {
  const result = getMessageBot(message)
  if (!result.success) return null
  const bot = result.data
  const job = bot.job ?? bots.find((member) => member.id === bot.id)?.job
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            tabIndex={0}
            className="mr-1 font-medium text-sky-700 outline-none hover:underline focus-visible:underline dark:text-sky-300"
          />
        }
      >
        @{bot.name}
      </TooltipTrigger>
      <TooltipContent className="bg-zinc-900 text-zinc-50 [&>:last-child]:bg-zinc-900 [&>:last-child]:fill-zinc-900">
        <span className="flex flex-col gap-0.5">
          <span className="font-medium">{bot.name}</span>
          {job ? <span className="text-zinc-300">{job}</span> : null}
        </span>
      </TooltipContent>
    </Tooltip>
  )
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
  groupBots?: (GroupAvatarBot & { job: string })[]
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
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [mentionQuery, setMentionQuery] =
    useState<ReturnType<typeof getMentionQuery>>()
  const [mentionIndex, setMentionIndex] = useState(0)
  const mentionBots = mentionQuery
    ? (groupBots ?? []).filter((bot) =>
        `${bot.name} ${bot.job}`
          .toLowerCase()
          .includes(mentionQuery.query.toLowerCase())
      )
    : []
  function chooseMention(bot: GroupAvatarBot) {
    if (!mentionQuery) return
    const text = `${input.slice(0, mentionQuery.start)}@${bot.name} ${input.slice(mentionQuery.end)}`
    const caret = mentionQuery.start + bot.name.length + 2
    setInput(text)
    setSelectedBotId(bot.id)
    setMentionQuery(undefined)
    requestAnimationFrame(() => {
      textareaRef.current?.focus()
      textareaRef.current?.setSelectionRange(caret, caret)
    })
  }

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
                  {groupBots &&
                  message.role === "user" &&
                  !message.parts.some((part) => part.type === "text") ? (
                    <MessageRecipientMention
                      message={message}
                      bots={groupBots}
                    />
                  ) : null}
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
                          {groupBots &&
                          index ===
                            message.parts.findIndex(
                              (part) => part.type === "text"
                            ) ? (
                            <>
                              <MessageRecipientMention
                                message={message}
                                bots={groupBots}
                              />{" "}
                            </>
                          ) : null}
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
            const recipient = groupBots
              ? resolveBotMention(text, groupBots, botId)
              : { text: text.trim(), bot: undefined }
            if (!recipient.text && !files.length) return
            if (recipient.bot) setSelectedBotId(recipient.bot.id)
            setMentionQuery(undefined)
            void sendMessage(
              {
                text: recipient.text,
                files,
                ...(groupBots && recipient.bot
                  ? {
                      metadata: {
                        bot: {
                          id: recipient.bot.id,
                          name: recipient.bot.name,
                          avatar: recipient.bot.avatar,
                          job: recipient.bot.job,
                        },
                      },
                    }
                  : {}),
              },
              { metadata: { modelId, botId: recipient.bot?.id ?? botId } }
            )
            setInput("")
          }}
        >
          <ComposerAttachments />
          <PromptInputBody className="relative block w-full min-w-0">
            {groupBots && mentionQuery && !pending ? (
              <div
                role="listbox"
                id="bot-mention-options"
                aria-label="Mention a bot"
                className="absolute bottom-full left-0 z-10 mb-2 max-h-56 w-full max-w-sm overflow-y-auto rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-border"
              >
                {mentionBots.length ? (
                  mentionBots.map((bot, index) => (
                    <button
                      key={bot.id}
                      id={`bot-mention-${bot.id}`}
                      type="button"
                      role="option"
                      aria-selected={index === mentionIndex}
                      className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-none hover:bg-accent focus-visible:bg-accent ${index === mentionIndex ? "bg-accent" : ""}`}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => chooseMention(bot)}
                    >
                      <ChatAvatar
                        seed={bot.avatar}
                        className="size-6 shrink-0 rounded-full"
                      />
                      <span className="min-w-0 truncate">
                        {bot.name}{" "}
                        <span className="text-muted-foreground">
                          ({bot.job})
                        </span>
                      </span>
                    </button>
                  ))
                ) : (
                  <p className="px-2 py-1.5 text-sm text-muted-foreground">
                    No bots found.
                  </p>
                )}
              </div>
            ) : null}
            <PromptInputTextarea
              ref={textareaRef}
              aria-label="Message"
              role={groupBots ? "combobox" : undefined}
              aria-expanded={groupBots ? !!mentionQuery && !pending : undefined}
              aria-autocomplete={groupBots ? "list" : undefined}
              aria-controls={mentionQuery ? "bot-mention-options" : undefined}
              aria-activedescendant={
                mentionQuery && mentionBots[mentionIndex]
                  ? `bot-mention-${mentionBots[mentionIndex].id}`
                  : undefined
              }
              onKeyDownCapture={(event) => {
                if (!mentionQuery || pending || event.nativeEvent.isComposing)
                  return
                if (event.key === "Escape") {
                  event.preventDefault()
                  event.stopPropagation()
                  setMentionQuery(undefined)
                } else if (
                  ["ArrowDown", "ArrowUp"].includes(event.key) &&
                  mentionBots.length
                ) {
                  event.preventDefault()
                  event.stopPropagation()
                  setMentionIndex(
                    (index) =>
                      (index +
                        (event.key === "ArrowDown" ? 1 : -1) +
                        mentionBots.length) %
                      mentionBots.length
                  )
                } else if (
                  ["Enter", "Tab"].includes(event.key) &&
                  !event.shiftKey &&
                  mentionBots[mentionIndex]
                ) {
                  event.preventDefault()
                  event.stopPropagation()
                  chooseMention(mentionBots[mentionIndex])
                }
              }}
              placeholder={
                groupBots
                  ? "Message a bot, or type @ to mention one…"
                  : "What would you like to know?"
              }
              value={input}
              onChange={(event) => {
                setInput(event.currentTarget.value)
                if (groupBots) {
                  setMentionQuery(
                    getMentionQuery(
                      event.currentTarget.value,
                      event.currentTarget.selectionStart
                    )
                  )
                  setMentionIndex(0)
                }
              }}
              onSelect={(event) => {
                if (groupBots) {
                  setMentionQuery(
                    getMentionQuery(
                      event.currentTarget.value,
                      event.currentTarget.selectionStart
                    )
                  )
                  setMentionIndex(0)
                }
              }}
              onBlur={() => setMentionQuery(undefined)}
            />
          </PromptInputBody>
          <PromptInputFooter>
            <PromptInputTools className="min-w-0 flex-wrap">
              {groupBots ? (
                <PromptInputSelect
                  value={botId}
                  onValueChange={(value) => {
                    if (typeof value === "string") {
                      setSelectedBotId(value)
                      const next = groupBots.find((bot) => bot.id === value)
                      const current = resolveBotMention(input, groupBots, botId)
                      if (next && current.mention)
                        setInput(
                          `${input.slice(0, current.mention.start)}@${next.name}${input.slice(current.mention.start + current.mention.length)}`
                        )
                    }
                  }}
                  disabled={pending}
                >
                  <PromptInputSelectTrigger
                    aria-label="Choose which bot to talk to"
                    className="max-w-64"
                  >
                    {selectedBot ? (
                      <ChatAvatar
                        seed={selectedBot.avatar}
                        className="size-5 shrink-0 rounded-full"
                      />
                    ) : null}
                    <PromptInputSelectValue>
                      {selectedBot
                        ? `${selectedBot.name} (${selectedBot.job})`
                        : "Choose a bot"}
                    </PromptInputSelectValue>
                  </PromptInputSelectTrigger>
                  <PromptInputSelectContent>
                    {groupBots.map((bot) => (
                      <PromptInputSelectItem key={bot.id} value={bot.id}>
                        {bot.name} ({bot.job})
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
