"use client"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { disconnectChatGPTAction } from "@/actions/chatgpt"

export function ChatGPTConnection({
  enabled,
  connected,
  label,
  outcome,
}: {
  enabled: boolean
  connected: boolean
  label: string | null
  outcome?: string
}) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<string>()
  return (
    <section
      aria-labelledby="chatgpt-title"
      className="flex flex-col gap-4 rounded-xl border p-5"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 id="chatgpt-title" className="text-lg font-semibold">
          ChatGPT subscription
        </h2>
        <Badge variant="outline">
          {connected
            ? "Connected"
            : enabled
              ? "Not connected"
              : "Not available yet"}
        </Badge>
      </div>
      <p className="text-sm text-muted-foreground">
        {enabled
          ? "Eligible requests use your ChatGPT plan and its limits. Your AI Teammates subscription covers app access separately."
          : "ChatGPT plan connections will be available once hosted access is enabled for AI Teammates. You can use your OpenAI API key now."}
      </p>
      {label && <p className="text-sm">{label}</p>}
      {outcome === "connected" && (
        <p role="status" className="text-sm">
          You’re using your ChatGPT plan. Manage usage in ChatGPT settings.
        </p>
      )}
      {outcome === "failed" && (
        <p role="alert" className="text-sm">
          ChatGPT could not be connected. Check that you granted plan usage,
          then try again.
        </p>
      )}
      {message && (
        <p role="status" className="text-sm">
          {message}
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        <form method="post" action="/api/connections/chatgpt/start">
          <Button type="submit" disabled={!enabled || pending}>
            Continue with ChatGPT
          </Button>
        </form>
        {connected && (
          <Button
            variant="outline"
            disabled={pending}
            onClick={async () => {
              setPending(true)
              try {
                const result = await disconnectChatGPTAction()
                setMessage(
                  result.error ?? result.warning ?? "ChatGPT disconnected."
                )
                router.refresh()
              } catch {
                setMessage("Could not disconnect ChatGPT. Try again.")
              } finally {
                setPending(false)
              }
            }}
          >
            Disconnect
          </Button>
        )}
        <a
          href="https://chatgpt.com/settings/usage"
          target="_blank"
          rel="noreferrer"
          className="self-center text-sm underline underline-offset-4"
        >
          Manage ChatGPT usage
        </a>
      </div>
    </section>
  )
}
