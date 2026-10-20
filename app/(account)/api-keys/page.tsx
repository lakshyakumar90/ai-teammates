import type { Metadata } from "next"
import { auth } from "@clerk/nextjs/server"
import { ApiKeySettings } from "@/components/api-key-settings"
import { ChatGPTConnection } from "@/components/chatgpt-connection"
import { chatGPTStatus } from "@/lib/chatgpt"
import { getUserApiKeys } from "@/lib/ai/user-api-keys"
import { CommunityChatGPTConnection } from "@/components/community-chatgpt-connection"
import { communityChatGPTStatus } from "@/lib/community-chatgpt"

export const metadata: Metadata = {
  title: "API keys — AI Teammates",
  referrer: "no-referrer",
}

export default async function ApiKeysPage({
  searchParams,
}: {
  searchParams: Promise<{ chatgpt?: string }>
}) {
  const { userId } = await auth.protect()
  const keys = await getUserApiKeys(userId)
  const connection = await chatGPTStatus(userId)
  const community = await communityChatGPTStatus(userId)
  const { chatgpt } = await searchParams
  return (
    <section className="min-w-0 flex-1 px-4 py-8 sm:px-8 sm:py-12">
      <div className="mx-auto flex max-w-3xl flex-col gap-8">
        <header>
          <h1 className="text-3xl font-semibold tracking-tight">API keys</h1>
          <p className="mt-2 text-muted-foreground">
            Connect Gemini, OpenRouter, OpenAI or your ChatGPT plan for your
            bots.
          </p>
        </header>
        {community.enabled || community.connected ? (
          <CommunityChatGPTConnection {...community} />
        ) : (
          <ChatGPTConnection {...connection} outcome={chatgpt} />
        )}
        <ApiKeySettings
          gemini={!!keys.gemini}
          openrouter={!!keys.openrouter}
          openai={!!keys.openai}
        />
      </div>
    </section>
  )
}
