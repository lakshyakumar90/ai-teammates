"use client"

import type RFB from "@novnc/novnc"
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react"
import { MaximizeIcon, MinimizeIcon } from "lucide-react"

import { loadChatDesktop } from "@/actions/desktop"
import { useChatDesktop } from "@/components/chat-desktop"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog"
import { FieldError } from "@/components/ui/field"
import { Spinner } from "@/components/ui/spinner"

function DesktopStatus() {
  const { connection, retry } = useChatDesktop()
  if (connection.state === "ready") return null
  return (
    <div
      className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-4"
      role={connection.state === "error" ? "alert" : "status"}
    >
      {connection.state === "error" ? (
        <>
          <FieldError>{connection.error}</FieldError>
          <Button variant="outline" size="sm" onClick={retry}>
            Retry
          </Button>
        </>
      ) : (
        <>
          <Spinner />
          <span className="text-sm text-muted-foreground">
            Connecting to desktop…
          </span>
        </>
      )}
    </div>
  )
}

export function ChatDesktopPreview() {
  const { setPreviewElement, setFullscreen, connection, aspectRatio } =
    useChatDesktop()
  return (
    <div className="w-full min-w-0 p-3">
      <div className="relative w-full overflow-hidden" style={{ aspectRatio }}>
        <div
          ref={setPreviewElement}
          className="size-full overflow-hidden [&_canvas]:my-0!"
        />
        <DesktopStatus />
        {connection.state === "ready" && (
          <button
            type="button"
            className="absolute inset-0 cursor-zoom-in"
            aria-label="Open desktop fullscreen"
            onClick={() => setFullscreen(true)}
          >
            <MaximizeIcon className="absolute top-3 right-3 size-4" />
          </button>
        )}
      </div>
    </div>
  )
}

// This component stays mounted outside the conditional panel. Only the existing
// canvas host moves; the RFB instance and its WebSocket stay alive in both views.
export function ChatDesktopViewer({ chatId }: { chatId: string }) {
  const {
    open,
    hasOpened,
    fullscreen,
    setFullscreen,
    previewElement,
    connection,
    setConnection,
    setAspectRatio,
    attempt,
  } = useChatDesktop()
  const [host, setHost] = useState<HTMLDivElement | null>(null)
  const [dialogElement, setDialogElement] = useState<HTMLDivElement | null>(
    null
  )
  const parkingElement = useRef<HTMLDivElement>(null)
  const client = useRef<RFB | null>(null)
  const request = useRef<{
    attempt: number
    promise: ReturnType<typeof loadChatDesktop>
  } | null>(null)

  const mountParkingElement = useCallback((parking: HTMLDivElement | null) => {
    if (!parking) return
    parkingElement.current = parking
    const element = document.createElement("div")
    element.className = "size-full overflow-hidden"
    setHost(element)
    return () => element.remove()
  }, [])

  useEffect(() => {
    if (!hasOpened || !host) return
    let active = true
    let rfb: RFB | undefined
    let canvasObserver: MutationObserver | undefined
    setConnection({ state: "loading" })
    if (!request.current || request.current.attempt !== attempt) {
      request.current = { attempt, promise: loadChatDesktop(chatId) }
    }
    const fail = (message: string) => {
      if (active) setConnection({ state: "error", error: message })
    }

    Promise.all([request.current.promise, import("@novnc/novnc")])
      .then(([result, { default: RFB }]) => {
        if (!active) return
        if ("error" in result) {
          fail(result.error)
          return
        }
        rfb = new RFB(host, result.url)
        const canvas = host.querySelector("canvas")
        if (canvas) {
          const updateAspectRatio = () => {
            if (active && canvas.width > 0 && canvas.height > 0) {
              setAspectRatio(canvas.width / canvas.height)
            }
          }
          canvasObserver = new MutationObserver(updateAspectRatio)
          canvasObserver.observe(canvas, {
            attributes: true,
            attributeFilter: ["width", "height"],
          })
          updateAspectRatio()
        }
        rfb.scaleViewport = true
        rfb.viewOnly = true
        rfb.resizeSession = false
        client.current = rfb
        rfb.addEventListener("connect", () => {
          if (active) setConnection({ state: "ready" })
        })
        rfb.addEventListener("disconnect", () =>
          fail("Desktop disconnected. Retry to reconnect.")
        )
        rfb.addEventListener("securityfailure", () =>
          fail("Desktop authentication failed. Retry to reconnect.")
        )
        rfb.addEventListener("credentialsrequired", () =>
          fail(
            "This sandbox requires VNC credentials. Use a Daytona sandbox with the default desktop configuration."
          )
        )
      })
      .catch(() => fail("Could not connect to the desktop. Please retry."))

    return () => {
      active = false
      canvasObserver?.disconnect()
      rfb?.disconnect()
      if (client.current === rfb) client.current = null
    }
  }, [hasOpened, host, chatId, attempt, setConnection, setAspectRatio])

  useLayoutEffect(() => {
    if (!host) return
    const target = fullscreen
      ? dialogElement
      : open
        ? previewElement
        : parkingElement.current
    if (!target) return
    target.appendChild(host)
    if (client.current) {
      client.current.viewOnly = !fullscreen
      if (fullscreen) client.current.focus()
    }
  }, [host, fullscreen, dialogElement, open, previewElement, connection.state])

  return (
    <>
      <div ref={mountParkingElement} className="hidden" aria-hidden="true" />
      <Dialog
        open={fullscreen}
        disablePointerDismissal
        onOpenChange={(nextOpen, details) => {
          if (!nextOpen && details.reason !== "close-press") {
            details.cancel()
            return
          }
          setFullscreen(nextOpen)
        }}
      >
        <DialogContent
          showCloseButton={false}
          initialFocus={false}
          className="inset-0 top-0 left-0 flex h-dvh w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-none p-0 sm:max-w-none"
        >
          <div className="flex shrink-0 items-center justify-between gap-2 border-b p-2">
            <DialogTitle>Sandbox desktop</DialogTitle>
            <DialogDescription className="sr-only">
              Interactive sandbox desktop. Use the exit fullscreen button to
              return to chat.
            </DialogDescription>
            <DialogClose
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Exit fullscreen"
                />
              }
            >
              <MinimizeIcon />
            </DialogClose>
          </div>
          <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden">
            <div ref={setDialogElement} className="size-full overflow-hidden" />
            <DesktopStatus />
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
