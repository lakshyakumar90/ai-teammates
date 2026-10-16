import { auth } from "@clerk/nextjs/server"
import { PlusIcon } from "lucide-react"
import { nanoid } from "nanoid"
import { ChatAvatar } from "@/components/chat-avatar"
import { BotDialog } from "@/components/bot-dialog"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"

export default async function DashboardPage() {
  await auth.protect()

  return (
    <main className="flex min-h-svh flex-col p-6">
      <Empty>
        <EmptyHeader>
          <EmptyMedia>
            <ChatAvatar seed={nanoid()} className="size-10 rounded-full" />
          </EmptyMedia>
          <EmptyTitle>Meet your first bot</EmptyTitle>
          <EmptyDescription>
            Every bot gets its own personality, memory, and face. Spin one up
            and start the conversation.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <BotDialog>
            <Button variant="secondary">
              <PlusIcon data-icon="inline-start" />
              Create a new bot
            </Button>
          </BotDialog>
        </EmptyContent>
      </Empty>
    </main>
  )
}
