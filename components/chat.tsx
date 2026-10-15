"use client"

import { useChat } from "@ai-sdk/react"
import {
  useLoadTranscript,
  useTriggerChatTransport,
} from "@trigger.dev/sdk/chat/react"
import type { TriggerChatTransport } from "@trigger.dev/sdk/chat"
import type { UIMessage } from "ai"
import { CheckIcon, ChevronDownIcon } from "lucide-react"
import { useState } from "react"

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
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  usePromptInputAttachments,
} from "@/components/ai-elements/prompt-input"
import { Button } from "@/components/ui/button"
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
  defaultModelId: ModelId
  modelOptions: ModelOption[]
}

export function Chat(props: ChatProps) {
  const transport = useTriggerChatTransport<typeof chatAgent>({
    task: "chat-agent",
    accessToken: ({ chatId }) => mintChatAccessToken(chatId),
    startSession: ({ chatId, clientData }) =>
      startChatSession({ chatId, clientData }),
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
      return loadChatTranscript({ chatId })
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
          Couldn&apos;t load this conversation. Refresh the page to retry.
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
}: ChatProps & {
  transport: TriggerChatTransport
  initialMessages: UIMessage[]
}) {
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
    <div className="grid min-h-0 min-w-0 flex-1 grid-rows-[minmax(0,1fr)_auto] overflow-hidden">
      <Conversation
        className="min-h-0 min-w-0 overflow-hidden"
        aria-label="Chat messages"
      >
        <ConversationContent
          scrollClassName="min-h-0 overflow-y-auto overscroll-contain"
          className="gap-4 px-3 py-4 sm:px-4"
        >
          {messages
            .filter((message) =>
              message.parts.some(
                (part) =>
                  part.type === "file" || (part.type === "text" && part.text)
              )
            )
            .map((message) => (
              <Message from={message.role} key={message.id}>
                <span className="sr-only">
                  {message.role === "user" ? "You" : "Assistant"}
                </span>
                <MessageContent>
                  {message.parts.map((part, index) => {
                    if (part.type === "text") {
                      return message.role === "user" ? (
                        <p key={index} className="whitespace-pre-wrap">
                          {part.text}
                        </p>
                      ) : (
                        <MessageResponse
                          key={index}
                          isAnimating={
                            status === "streaming" &&
                            message.id === messages.at(-1)?.id
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
      <div className="flex shrink-0 flex-col gap-2 p-2 sm:p-3">
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
                  if (!pending) void regenerate({ metadata: { modelId } })
                }}
              >
                Retry
              </Button>
            )}
          </div>
        )}
        <PromptInput
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
              { metadata: { modelId } }
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
            <PromptInputTools className="min-w-0">
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
