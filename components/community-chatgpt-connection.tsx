"use client"
import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

export function CommunityChatGPTConnection({
  enabled,
  connected,
  label,
}: {
  enabled: boolean
  connected: boolean
  label: string | null
}) {
  const router = useRouter()
  const completing = useRef(false)
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState("")
  const [installUrl, setInstallUrl] = useState<string>()
  useEffect(() => {
    const url = new URL(window.location.href)
    if (
      (!url.searchParams.has("code") && !url.searchParams.has("error")) ||
      completing.current
    )
      return
    completing.current = true
    // Remove authorization data from the address bar before loading anything else.
    window.history.replaceState(null, "", "/api-keys")
    setPending(true)
    void (async () => {
      try {
        const { completeLogin } = await import("@openai-oauth/web")
        const session = await completeLogin({
          url: url.href,
          sessionStore: {
            get: async () => null,
            clear: async () => {},
            set: async (session) => {
              const response = await fetch(
                "/api/connections/chatgpt/community",
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(session),
                  credentials: "same-origin",
                }
              )
              if (!response.ok) throw new Error("Connection rejected")
            },
          },
        })
        setMessage(
          session
            ? "ChatGPT connected. Its Codex models are available in your chats."
            : "ChatGPT sign-in was cancelled."
        )
        router.refresh()
      } catch {
        setMessage(
          "ChatGPT could not connect. Check the extension, then start sign-in again or use a personal API key."
        )
      } finally {
        setPending(false)
      }
    })()
  }, [router])

  return (
    <section
      aria-labelledby="experimental-chatgpt-title"
      className="flex flex-col gap-4 rounded-xl border p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="experimental-chatgpt-title" className="text-lg font-semibold">
          ChatGPT subscription
        </h2>
        <Badge variant="outline">
          {connected ? "Connected · Experimental" : "Experimental"}
        </Badge>
      </div>
      <p className="text-sm text-muted-foreground">
        This community integration uses your ChatGPT account’s Codex access and
        limits. It requires the Sign in with ChatGPT extension for Chrome or
        Firefox. It is unofficial and may stop working if OpenAI changes access.
      </p>
      <p className="text-sm text-muted-foreground">
        Your credentials are encrypted on our server so your bots can work in
        the background. AI Teammates Pro is $9/month; it does not include or
        increase your ChatGPT limits.
      </p>
      {label && <p className="text-sm">{label}</p>}
      {message && (
        <p role="status" className="text-sm">
          {message}
        </p>
      )}
      {!enabled && (
        <p className="text-sm">
          New connections are currently disabled. Personal API keys remain
          available.
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        <Button
          disabled={!enabled || pending}
          onClick={async () => {
            setPending(true)
            setMessage("")
            setInstallUrl(undefined)
            try {
              const { startLogin } = await import("@openai-oauth/web")
              const result = await startLogin({
                callbackPath: "/api-keys",
                returnTo: "/api-keys",
              })
              if (result.status === "needs-extension") {
                // Never turn an arbitrary callback query parameter into an install link.
                const url = new URL(result.installUrl)
                if (
                  !["chromewebstore.google.com", "addons.mozilla.org"].includes(
                    url.hostname
                  ) ||
                  url.protocol !== "https:"
                )
                  throw new Error("Unsupported extension URL")
                setInstallUrl(url.href)
                setMessage(
                  "Install the browser extension, then return here and start sign-in again. Safari is not supported."
                )
              }
            } catch {
              setMessage(
                "Could not start ChatGPT sign-in. Use Chrome or Firefox with the extension installed."
              )
            } finally {
              setPending(false)
            }
          }}
        >
          {pending
            ? "Connecting…"
            : connected
              ? "Reconnect ChatGPT"
              : "Connect ChatGPT (experimental)"}
        </Button>
        {connected && (
          <Button
            variant="outline"
            disabled={pending}
            onClick={async () => {
              setPending(true)
              try {
                const response = await fetch(
                  "/api/connections/chatgpt/community",
                  { method: "DELETE", credentials: "same-origin" }
                )
                if (!response.ok) throw new Error("Disconnect failed")
                const result = await response.json()
                setMessage(result.warning || "ChatGPT disconnected.")
                router.refresh()
              } catch {
                setMessage("Could not disconnect. Try again.")
              } finally {
                setPending(false)
              }
            }}
          >
            Disconnect
          </Button>
        )}
        {installUrl && (
          <a
            href={installUrl}
            target="_blank"
            rel="noreferrer"
            className="self-center text-sm underline"
          >
            Install browser extension
          </a>
        )}
        <a
          href="https://github.com/EvanZhouDev/openai-oauth"
          target="_blank"
          rel="noreferrer"
          className="self-center text-sm underline"
        >
          About this integration
        </a>
        <a
          href="/licenses/openai-oauth/LICENSE.txt"
          target="_blank"
          rel="noreferrer"
          className="self-center text-sm underline"
        >
          Open-source license
        </a>
      </div>
      <p className="text-xs text-muted-foreground">
        OpenAI OAuth · Copyright 2026 Evan Zhou and OpenAI OAuth contributors ·
        Apache 2.0.
      </p>
    </section>
  )
}
