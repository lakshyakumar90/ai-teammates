"use client"

import * as React from "react"
import { MonitorIcon } from "lucide-react"

import {
  GroupChatDialog,
  type GroupChatEdit,
} from "@/components/group-chat-dialog"
import { BotDialog, type BotEdit } from "@/components/bot-dialog"
import {
  GroupChatAvatar,
  type GroupAvatarBot,
} from "@/components/group-chat-avatar"
import { ChatAvatar } from "@/components/chat-avatar"
import { useChatDesktop } from "@/components/chat-desktop"
import { Button } from "@/components/ui/button"
import { usePaidAccess } from "@/components/paid-access"

export function ChatHeader({
  title,
  avatarSeed,
  bot,
  groupBots,
  group,
  availableBots,
}: {
  group?: GroupChatEdit
  availableBots?: (GroupAvatarBot & { job: string })[]
  groupBots?: GroupAvatarBot[]
  title: string
  avatarSeed: string
  bot?: BotEdit | null
}) {
  const [editOpen, setEditOpen] = React.useState(false)
  const desktop = useChatDesktop()
  const requirePaidAccess = usePaidAccess()

  return (
    <header className="flex items-center justify-between gap-2 p-2">
      {!groupBots && bot ? (
        <button
          type="button"
          onClick={() => {
            if (requirePaidAccess()) setEditOpen(true)
          }}
          className="flex min-w-0 cursor-pointer items-center gap-2 rounded-md hover:bg-muted"
        >
          <ChatAvatar
            seed={bot.avatar}
            className="size-7 shrink-0 rounded-full"
          />
          <span className="truncate font-medium">{title}</span>
        </button>
      ) : (
        <button
          type="button"
          disabled={!group}
          onClick={() => {
            if (requirePaidAccess()) setEditOpen(true)
          }}
          className="flex min-w-0 cursor-pointer items-center gap-2 rounded-md hover:bg-muted"
        >
          {groupBots ? (
            <GroupChatAvatar bots={groupBots} className="size-7" />
          ) : (
            <ChatAvatar
              seed={avatarSeed}
              className="size-7 shrink-0 rounded-full"
            />
          )}
          <span className="truncate font-medium">{title}</span>
        </button>
      )}
      {!groupBots ? (
        <Button
          type="button"
          size="icon"
          variant="ghost"
          aria-label={
            desktop.open ? "Hide desktop panel" : "Show desktop panel"
          }
          aria-expanded={desktop.open}
          aria-controls={desktop.open ? "chat-desktop" : undefined}
          onClick={desktop.toggle}
        >
          <MonitorIcon />
        </Button>
      ) : null}
      {group && availableBots ? (
        <GroupChatDialog
          key={`${group.id}-${group.name}-${group.botIds.join(",")}`}
          group={group}
          bots={availableBots}
          open={editOpen}
          onOpenChange={setEditOpen}
        />
      ) : null}
      {!groupBots && bot ? (
        <BotDialog
          key={bot.id}
          open={editOpen}
          onOpenChange={setEditOpen}
          bot={bot}
        />
      ) : null}
    </header>
  )
}
