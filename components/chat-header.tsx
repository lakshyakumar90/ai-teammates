"use client";

import * as React from "react";
import { MonitorIcon } from "lucide-react";

import { BotDialog, type BotEdit } from "@/components/bot-dialog";
import { ChatAvatar } from "@/components/chat-avatar";
import { Button } from "@/components/ui/button";

export function ChatHeader({
  title,
  avatarSeed,
  bot,
}: {
  title: string;
  avatarSeed: string;
  bot?: BotEdit | null;
}) {
  const [editOpen, setEditOpen] = React.useState(false);

  return (
    <header className="flex items-center justify-between gap-2 p-2">
      {bot ? (
        <button
          type="button"
          onClick={() => setEditOpen(true)}
          className="flex min-w-0 cursor-pointer items-center gap-2 rounded-md hover:bg-muted"
        >
          <ChatAvatar
            seed={bot.avatar}
            className="size-7 shrink-0 rounded-full"
          />
          <span className="truncate font-medium">{title}</span>
        </button>
      ) : (
        <div className="flex min-w-0 items-center gap-2">
          <ChatAvatar
            seed={avatarSeed}
            className="size-7 shrink-0 rounded-full"
          />
          <span className="truncate font-medium">{title}</span>
        </div>
      )}
      <Button size="icon" variant="ghost">
        <MonitorIcon />
      </Button>
      {bot ? (
        <BotDialog key={bot.id} open={editOpen} onOpenChange={setEditOpen} bot={bot} />
      ) : null}
    </header>
  );
}
