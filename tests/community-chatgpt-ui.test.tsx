import { afterEach, expect, it, vi } from "vitest"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
const oauth = vi.hoisted(() => ({
  start: vi.fn(),
  complete: vi.fn(),
  refresh: vi.fn(),
}))
vi.mock("@openai-oauth/web", () => ({
  startLogin: oauth.start,
  completeLogin: oauth.complete,
}))
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: oauth.refresh }),
}))
import { CommunityChatGPTConnection } from "@/components/community-chatgpt-connection"
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
  window.history.replaceState(null, "", "/")
})

it("explains experimental access and offers the extension when missing", async () => {
  oauth.start.mockResolvedValue({
    status: "needs-extension",
    installUrl: "https://chromewebstore.google.com/detail/test",
  })
  render(<CommunityChatGPTConnection enabled connected={false} label={null} />)
  expect(screen.getByText(/It is unofficial/)).toBeTruthy()
  await userEvent.click(
    screen.getByRole("button", { name: "Connect ChatGPT (experimental)" })
  )
  expect(
    await screen.findByRole("link", { name: "Install browser extension" })
  ).toHaveProperty("href", "https://chromewebstore.google.com/detail/test")
  expect(oauth.start).toHaveBeenCalledWith({
    callbackPath: "/api-keys",
    returnTo: "/api-keys",
  })
})

it("clears callback secrets immediately and persists via a custom server session store", async () => {
  window.history.replaceState(null, "", "/api-keys?code=secret&state=nonce")
  const request = vi.fn().mockResolvedValue(Response.json({ connected: true }))
  vi.stubGlobal("fetch", request)
  const session = {
    accessToken: "access",
    refreshToken: "refresh",
    accountId: "account",
  }
  oauth.complete.mockImplementation(async (options) => {
    expect(window.location.search).toBe("")
    expect(await options.sessionStore.get()).toBeNull()
    await options.sessionStore.set(session)
    return session
  })
  render(<CommunityChatGPTConnection enabled connected={false} label={null} />)
  await screen.findByText(/ChatGPT connected/)
  expect(request).toHaveBeenCalledWith(
    "/api/connections/chatgpt/community",
    expect.objectContaining({
      method: "POST",
      body: JSON.stringify(session),
      credentials: "same-origin",
    })
  )
  expect(oauth.refresh).toHaveBeenCalled()
})

it("retains disconnect when the feature is disabled and reports upstream revocation failures", async () => {
  const request = vi
    .fn()
    .mockResolvedValue(
      Response.json({ warning: "Remote revocation unconfirmed." })
    )
  vi.stubGlobal("fetch", request)
  render(
    <CommunityChatGPTConnection
      enabled={false}
      connected
      label="ChatGPT / Codex"
    />
  )
  await userEvent.click(screen.getByRole("button", { name: "Disconnect" }))
  await waitFor(() =>
    expect(screen.getByRole("status").textContent).toBe(
      "Remote revocation unconfirmed."
    )
  )
  expect(request).toHaveBeenCalledWith(
    "/api/connections/chatgpt/community",
    expect.objectContaining({ method: "DELETE" })
  )
})
