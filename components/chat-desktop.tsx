"use client"

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
        open,
        toggle: () => {
          setHasOpened(true)
          setOpen((value) => !value)
        },
        hasOpened,
        fullscreen,
        setFullscreen,
        previewElement,
        setPreviewElement,
        connection,
        setConnection,
        aspectRatio,
        setAspectRatio,
        attempt,
        retry: () => setAttempt((value) => value + 1),
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
