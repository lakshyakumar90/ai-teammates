import { UsersIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { ChatAvatar } from "@/components/chat-avatar"

export type GroupAvatarBot = { id: string; name: string; avatar: string }

export function GroupChatAvatar({
  bots,
  className,
}: {
  bots: GroupAvatarBot[]
  className?: string
}) {
  const count = bots.length
  const positions =
    count === 2
      ? ["left-0 top-1/4 size-3/5", "right-0 top-1/4 size-3/5"]
      : count === 3
        ? [
            "left-1/4 top-0 size-1/2",
            "bottom-0 left-0 size-1/2",
            "bottom-0 right-0 size-1/2",
          ]
        : [
            "left-0 top-0 size-1/2",
            "right-0 top-0 size-1/2",
            "bottom-0 left-0 size-1/2",
          ]
  return (
    <span
      role="img"
      aria-label={`Group chat: ${bots.map((bot) => bot.name).join(", ") || "no bots"}`}
      className={cn("relative inline-block size-8 shrink-0", className)}
    >
      <span aria-hidden="true" className="absolute inset-0">
        {count === 0 ? (
          <UsersIcon className="size-full rounded-full bg-muted p-1 text-muted-foreground" />
        ) : null}
        {bots.slice(0, 3).map((bot, index) => (
          <span
            key={bot.id}
            className={cn(
              "absolute overflow-hidden rounded-full",
              count === 1 ? "inset-0" : positions[index]
            )}
          >
            <ChatAvatar seed={bot.avatar} className="size-full rounded-full" />
          </span>
        ))}
        {count > 3 ? (
          <span className="absolute right-0 bottom-0 flex size-1/2 items-center justify-center rounded-full bg-muted text-[10px] font-medium text-muted-foreground">
            +{count - 3}
          </span>
        ) : null}
      </span>
    </span>
  )
}
