import { beforeEach, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
import { z } from "zod"

const backend = vi.hoisted(() => ({
  auth: vi.fn(),
  enabled: vi.fn(),
  connect: vi.fn(),
  disconnect: vi.fn(),
}))
vi.mock("@clerk/nextjs/server", () => ({ auth: backend.auth }))
vi.mock("@/lib/community-chatgpt", () => ({
  communityChatGPTEnabled: backend.enabled,
  communitySessionSchema: z.object({
    accessToken: z.string(),
    refreshToken: z.string(),
    accountId: z.string(),
  }),
  connectCommunityChatGPT: backend.connect,
  disconnectCommunityChatGPT: backend.disconnect,
}))
import { POST, DELETE } from "@/app/api/connections/chatgpt/community/route"
const origin = "https://app.example"
const session = {
  accessToken: "secret-access",
  refreshToken: "secret-refresh",
  accountId: "account",
}
const request = (method = "POST", body: unknown = session, from = origin) =>
  new NextRequest(origin + "/api/connections/chatgpt/community", {
    method,
    headers: { Origin: from, "Content-Type": "application/json" },
    ...(method === "POST" ? { body: JSON.stringify(body) } : {}),
  })
beforeEach(() => {
  vi.clearAllMocks()
  backend.auth.mockResolvedValue({ userId: "owner-a" })
  backend.enabled.mockReturnValue(true)
  backend.connect.mockResolvedValue(undefined)
  backend.disconnect.mockResolvedValue(false)
})

it("rejects cross-origin, anonymous, disabled, malformed and oversized connections", async () => {
  expect(
    (await POST(request("POST", session, "https://attacker.test"))).status
  ).toBe(403)
  backend.auth.mockResolvedValueOnce({ userId: null })
  expect((await POST(request())).status).toBe(403)
  backend.enabled.mockReturnValueOnce(false)
  expect((await POST(request())).status).toBe(503)
  expect((await POST(request("POST", {}))).status).toBe(400)
  expect((await POST(request("POST", "x".repeat(46000)))).status).toBe(413)
  expect(backend.connect).not.toHaveBeenCalled()
})

it("saves only for the Clerk owner and never returns credentials or upstream errors", async () => {
  const response = await POST(request())
  expect(response.status).toBe(200)
  expect(response.headers.get("cache-control")).toBe("no-store")
  expect(await response.json()).toEqual({ connected: true })
  expect(backend.connect).toHaveBeenCalledWith("owner-a", session)
  backend.connect.mockRejectedValueOnce(
    new Error("secret-access upstream-body")
  )
  expect(await (await POST(request())).text()).not.toContain("secret-access")
})

it("disconnects for the owner even with sign-in disabled and reports failed remote revocation", async () => {
  backend.enabled.mockReturnValue(false)
  expect(
    (await DELETE(request("DELETE", undefined, "https://attacker.test"))).status
  ).toBe(403)
  const response = await DELETE(request("DELETE"))
  expect(backend.disconnect).toHaveBeenCalledWith("owner-a")
  expect((await response.json()).warning).toMatch(
    /revocation could not be confirmed/
  )
})
