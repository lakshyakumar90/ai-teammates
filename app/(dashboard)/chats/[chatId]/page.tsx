import { ChatHeader } from "@/components/chat-header"
import { Chat } from "@/components/chat"
import {
  ChatDesktopPreview,
  ChatDesktopViewer,
} from "@/components/chat-desktop-viewer"
import {
  ChatDesktopProvider,
  ChatDesktopWhenOpen,
} from "@/components/chat-desktop"
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"
import { getBots } from "@/queries/bots"
import { getChat } from "@/queries/chats"
import { defaultModelId, modelOptions } from "@/lib/ai/models"

export default async function ChatPage({
  params,
}: {
  params: Promise<{ chatId: string }>
}) {
  const { chatId } = await params
  const chat = await getChat(chatId)
  const bot = chat?.members[0]?.bot
  if (!chat || !bot) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-1 p-6 text-center">
        <p className="text-lg font-medium">Invalid chat ID</p>
        <p className="text-sm text-muted-foreground">
          This chat doesn&apos;t exist or its bot was deleted.
        </p>
      </div>
    )
  }

  const availableBots = chat.kind === "group" ? await getBots() : undefined

  return (
    <ChatDesktopProvider key={chatId}>
      <div className="flex h-full max-h-dvh min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
        <ResizablePanelGroup
          orientation="horizontal"
          className="min-h-0 min-w-0"
        >
          <ResizablePanel
            id="chat"
            defaultSize="60%"
            minSize="30%"
            className="min-w-0 overflow-hidden"
          >
            <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
              <ChatHeader
                title={chat.name ?? bot.name}
                group={
                  chat.kind === "group"
                    ? {
                        id: chat.id,
                        name: chat.name ?? "Group chat",
                        botIds: chat.members.map(({ bot }) => bot.id),
                      }
                    : undefined
                }
                availableBots={availableBots}
                avatarSeed={bot.avatar}
                bot={chat.kind === "direct" ? bot : undefined}
                groupBots={
                  chat.kind === "group"
                    ? chat.members.map(({ bot }) => bot)
                    : undefined
                }
              />
              <Chat
                key={chatId}
                chatId={chatId}
                groupBots={
                  chat.kind === "group"
                    ? chat.members.map(({ bot }) => ({
                        id: bot.id,
                        name: bot.name,
                        avatar: bot.avatar,
                      }))
                    : undefined
                }
                defaultModelId={defaultModelId}
                modelOptions={modelOptions}
              />
            </div>
          </ResizablePanel>
          {chat.kind === "direct" ? (
            <ChatDesktopWhenOpen>
              <ResizableHandle />
              <ResizablePanel
                id="chat-desktop"
                defaultSize="40%"
                minSize="20%"
                aria-label="Desktop panel"
              >
                <ChatDesktopPreview />
              </ResizablePanel>
            </ChatDesktopWhenOpen>
          ) : null}
        </ResizablePanelGroup>
        {chat.kind === "direct" ? <ChatDesktopViewer chatId={chatId} /> : null}
      </div>
    </ChatDesktopProvider>
  )
}
