import type { ComponentProps, ReactNode } from "react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { AppSidebar } from "@/components/app-sidebar"
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { TooltipProvider } from "@/components/ui/tooltip"

const viewport = vi.hoisted(() => ({ mobile: false }))
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useParams: () => ({}),
  usePathname: () => "/api-keys",
}))
vi.mock("next/link", () => ({
  default: ({ children, onClick, ...props }: ComponentProps<"a">) => (
    <a
      {...props}
      onClick={(event) => {
        onClick?.(event)
        event.preventDefault()
      }}
    >
      {children}
    </a>
  ),
}))
vi.mock("@clerk/nextjs", () => ({
  UserButton: Object.assign(() => null, {
    MenuItems: () => null,
    Link: () => null,
  }),
}))
vi.mock("@/components/paid-access", () => ({ usePaidAccess: () => () => true }))
vi.mock("@/components/bot-dialog", () => ({ BotDialog: () => null }))
vi.mock("@/components/group-chat-dialog", () => ({
  GroupChatDialog: () => null,
}))

beforeEach(() => {
  viewport.mobile = false
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: viewport.mobile,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }))
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  )
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function workspace(children?: ReactNode) {
  return (
    <TooltipProvider>
      <SidebarProvider>
        <AppSidebar chats={[]} bots={[]} />
        {children}
      </SidebarProvider>
    </TooltipProvider>
  )
}

it("keeps API keys beside Usage & Billing in the footer and marks the current page", () => {
  const { container } = render(workspace())
  const keys = screen.getByRole("link", { name: "API keys" })
  expect(keys.getAttribute("href")).toBe("/api-keys")
  expect(keys.getAttribute("aria-current")).toBe("page")
  const footer = container.querySelector('[data-slot="sidebar-footer"]')
  expect(footer?.contains(keys)).toBe(true)
  expect(
    footer?.contains(screen.getByRole("link", { name: "Usage & Billing" }))
  ).toBe(true)
})

it("opens on mobile and closes the drawer when API keys is selected", async () => {
  viewport.mobile = true
  const user = userEvent.setup()
  render(workspace(<SidebarTrigger />))
  await user.click(screen.getByRole("button", { name: "Toggle Sidebar" }))
  expect(await screen.findByRole("dialog", { name: "Sidebar" })).toBeTruthy()
  await user.click(screen.getByRole("link", { name: "API keys" }))
  await waitFor(() =>
    expect(screen.queryByRole("dialog", { name: "Sidebar" })).toBeNull()
  )
})
