"use client";

import * as React from "react";
import { UserButton } from "@clerk/nextjs";
import { formatDistanceToNow } from "date-fns";
import { PlusIcon, SearchIcon, UsersIcon } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";

import { BotDialog } from "@/components/bot-dialog";
import { Button } from "@/components/ui/button";
import { ChatAvatar } from "@/components/chat-avatar";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Kbd } from "@/components/ui/kbd";
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
  SidebarRail,
} from "@/components/ui/sidebar";
import type { ChatWithBot } from "@/queries/bots";

export function AppSidebar({ chats }: { chats: ChatWithBot[] }) {
  const [botDialogOpen, setBotDialogOpen] = React.useState(false);
  const [searchOpen, setSearchOpen] = React.useState(false);
  const router = useRouter();
  const params = useParams();
  const routeChatId = params.chatId;
  const activeChatId = Array.isArray(routeChatId)
    ? routeChatId[0]
    : routeChatId;

  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen((open) => !open);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex flex-row justify-end">
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
        </div>
        <Button
          variant="ghost"
          onClick={() => setSearchOpen(true)}
          className="h-8 w-full min-w-0 justify-start rounded-lg border border-input bg-transparent px-2.5 py-1 text-base transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:border-transparent! group-data-[collapsible=icon]:px-0! group-data-[collapsible=icon]:dark:bg-transparent! md:text-sm dark:bg-input/30"
        >
          <SearchIcon data-icon="inline-start" />
          <span className="flex-1 text-left font-normal text-muted-foreground group-data-[collapsible=icon]:hidden">
            Search
          </span>
          <Kbd className="group-data-[collapsible=icon]:hidden">⌘K</Kbd>
        </Button>
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
                        className="h-auto cursor-pointer group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:p-0!"
                        render={<Link href={`/chats/${chat.id}`} />}
                        isActive={chat.id === activeChatId}
                      >
                        <ChatAvatar
                          seed={bot?.avatar ?? chat.id}
                          className="size-10 shrink-0 rounded-full group-data-[collapsible=icon]:size-8!"
                        />
                        <div className="flex min-w-0 flex-1 flex-col group-data-[collapsible=icon]:hidden">
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
                        "flex! w-full! items-center! justify-start! gap-2! rounded-md! p-2! text-sm! hover:bg-sidebar-accent! hover:text-sidebar-accent-foreground! focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:outline-hidden group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:justify-center! group-data-[collapsible=icon]:p-0!",
                      userButtonAvatarBox: "order-first size-8 shrink-0",
                      userButtonOuterIdentifier:
                        "order-last min-w-0 flex-1 truncate text-left text-sm text-sidebar-foreground group-data-[collapsible=icon]:hidden",
                    },
                  }}
                />
              }
            />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <BotDialog open={botDialogOpen} onOpenChange={setBotDialogOpen} />
      <CommandDialog
        open={searchOpen}
        onOpenChange={setSearchOpen}
        title="Search chats"
        description="Search your chats by bot name or message..."
      >
        <Command>
          <CommandInput placeholder="Search chats..." />
          <CommandList>
            <CommandEmpty>No chats found.</CommandEmpty>
            <CommandGroup heading="Chats">
              {chats.map((chat) => {
                const bot = chat.members[0]?.bot;
                const name = chat.name ?? bot?.name ?? "New chat";
                return (
                  <CommandItem
                    key={chat.id}
                    value={`${name} ${chat.lastMessagePreview ?? ""}`}
                    onSelect={() => {
                      setSearchOpen(false);
                      router.push(`/chats/${chat.id}`);
                    }}
                  >
                    <ChatAvatar
                      seed={bot?.avatar ?? chat.id}
                      className="size-8 rounded-full"
                    />
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate font-medium">{name}</span>
                      <span className="truncate text-xs text-muted-foreground">
                        {chat.lastMessagePreview ?? bot?.job ?? ""}
                      </span>
                    </div>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </CommandDialog>
      <SidebarRail />
    </Sidebar>
  );
}
