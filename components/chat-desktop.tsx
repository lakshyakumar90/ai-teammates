"use client"
import {
  usePaidAccess,
  useVerifiedPaidAccess,
  handleBillingFailure,
} from "@/components/paid-access"
import { verifyPaidAccess } from "@/actions/billing"
import { toast } from "@/components/ui/toast"

import {
  createContext,
  useContext,
  useState,
  type ReactNode,
  type Dispatch,
  type SetStateAction,
} from "react"

type DesktopConnection = {
  state: "loading" | "ready" | "error"
  error?: string
}

const ChatDesktopContext = createContext<{
  open: boolean
  toggle: () => void
  hasOpened: boolean
  fullscreen: boolean
  setFullscreen: Dispatch<SetStateAction<boolean>>
  previewElement: HTMLDivElement | null
  setPreviewElement: Dispatch<SetStateAction<HTMLDivElement | null>>
  connection: DesktopConnection
  setConnection: Dispatch<SetStateAction<DesktopConnection>>
  aspectRatio: number
  setAspectRatio: Dispatch<SetStateAction<number>>
  attempt: number
  retry: () => void
} | null>(null)

export function ChatDesktopProvider({ children }: { children: ReactNode }) {
  const requirePaidAccess = usePaidAccess()
  const paid = useVerifiedPaidAccess()
  const [open, setOpen] = useState(false)
  const [hasOpened, setHasOpened] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const [previewElement, setPreviewElement] = useState<HTMLDivElement | null>(
    null
  )
  const [connection, setConnection] = useState<DesktopConnection>({
    state: "loading",
  })
  const [attempt, setAttempt] = useState(0)
  const [aspectRatio, setAspectRatio] = useState(4 / 3)

  return (
    <ChatDesktopContext
      value={{
        open: paid && open,
        toggle: () => {
          if (open) {
            setOpen(false)
            return
          }
          if (!requirePaidAccess()) return
          void verifyPaidAccess()
            .then((result) => {
              if (handleBillingFailure(result)) return
              setHasOpened(true)
              setOpen(true)
            })
            .catch(() =>
              toast.add({
                title: "Could not check subscription",
                description: "Please retry before opening the desktop.",
                type: "error",
              })
            )
        },
        hasOpened: paid && hasOpened,
        fullscreen: paid && fullscreen,
        setFullscreen,
        previewElement,
        setPreviewElement,
        connection,
        setConnection,
        aspectRatio,
        setAspectRatio,
        attempt,
        retry: () => {
          if (requirePaidAccess()) setAttempt((value) => value + 1)
        },
      }}
    >
      {children}
    </ChatDesktopContext>
  )
}

export function useChatDesktop() {
  const context = useContext(ChatDesktopContext)
  if (!context) throw new Error("Chat desktop requires ChatDesktopProvider")
  return context
}

export function ChatDesktopWhenOpen({ children }: { children: ReactNode }) {
  const { open } = useChatDesktop()
  return open ? children : null
}
