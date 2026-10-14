"use client";

import * as React from "react";
import { UserButton } from "@clerk/nextjs";
import { formatDistanceToNow } from "date-fns";
import { PlusIcon, UsersIcon } from "lucide-react";

import { BotDialog } from "@/components/bot-dialog";
import { Button } from "@/components/ui/button";
import { ChatAvatar } from "@/components/chat-avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import type { ChatWithBot } from "@/queries/bots";

export function AppSidebar({ chats }: { chats: ChatWithBot[] }) {
  const [botDialogOpen, setBotDialogOpen] = React.useState(false);

  return (
    <Sidebar>
      <SidebarHeader className="flex-row justify-end">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button size="icon" variant="ghost">
                <PlusIcon />
              </Button>
            }
          />
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuGroup>
              <DropdownMenuItem onClick={() => setBotDialogOpen(true)}>
                <PlusIcon />
                Create new bot
              </DropdownMenuItem>
              <DropdownMenuItem>
                <UsersIcon />
                Create group chat
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarHeader>
      <SidebarContent>
        {chats.length > 0 ? (
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {chats.map((chat) => {
                  const bot = chat.members[0]?.bot;
                  return (
                    <SidebarMenuItem key={chat.id}>
                      <SidebarMenuButton
                        size="lg"
                        className="h-auto cursor-pointer"
                      >
                        <ChatAvatar
                          seed={bot?.avatar ?? chat.id}
                          className="size-10 shrink-0 rounded-full"
                        />
                        <div className="flex min-w-0 flex-1 flex-col">
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="truncate font-medium">
                              {chat.name ?? bot?.name ?? "New chat"}
                            </span>
                            <span className="shrink-0 text-xs text-muted-foreground">
                              {formatDistanceToNow(chat.lastMessageAt)}
                            </span>
                          </div>
                          <span className="truncate text-xs text-muted-foreground">
                            {chat.lastMessagePreview ?? bot?.job ?? ""}
                          </span>
                        </div>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ) : null}
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              render={
                <UserButton
                  showName
                  appearance={{
                    elements: {
                      rootBox: "w-full",
                      userButtonBox: "w-full",
                      userButtonTrigger:
                        "flex! w-full! items-center! justify-start! gap-2! rounded-md! p-2! text-sm! hover:bg-sidebar-accent! hover:text-sidebar-accent-foreground! focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:outline-hidden",
                      userButtonAvatarBox: "order-first size-8 shrink-0",
                      userButtonOuterIdentifier:
                        "order-last min-w-0 flex-1 truncate text-left text-sm text-sidebar-foreground",
                    },
                  }}
                />
              }
            />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <BotDialog open={botDialogOpen} onOpenChange={setBotDialogOpen} />
    </Sidebar>
  );
}
