import { beforeEach, afterEach, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const backend = vi.hoisted(() => ({
  auth: vi.fn(),
  enabled: vi.fn(),
  begin: vi.fn(),
  finish: vi.fn(),
  cancel: vi.fn(),
}))
vi.mock("@clerk/nextjs/server", () => ({ auth: backend.auth }))
vi.mock("@/lib/chatgpt", () => ({
  chatGPTEnabled: backend.enabled,
  beginChatGPT: backend.begin,
  finishChatGPT: backend.finish,
  cancelChatGPTAttempt: backend.cancel,
}))
import { POST } from "@/app/api/connections/chatgpt/start/route"
import { GET } from "@/app/api/connections/chatgpt/callback/route"

const origin = "https://app.example"
const path = "/api/connections/chatgpt/callback"
const state = "a".repeat(43)
beforeEach(() => {
  vi.stubEnv("CHATGPT_REDIRECT_URI", origin + path)
  backend.auth.mockResolvedValue({ userId: "owner-a" })
  backend.enabled.mockReturnValue(true)
  backend.begin.mockResolvedValue({
    url: "https://auth.openai.com/api/accounts/authorize",
    state,
  })
  backend.finish.mockResolvedValue(undefined)
  backend.cancel.mockResolvedValue(undefined)
})
afterEach(() => vi.unstubAllEnvs())

it("requires a signed-in owner, hosted access and same-origin POST before beginning OAuth", async () => {
  const request = () =>
    new Request(origin + "/api/connections/chatgpt/start", {
      method: "POST",
      headers: { Origin: origin },
    })
  backend.auth.mockResolvedValueOnce({ userId: null })
  expect((await POST(request())).status).toBe(401)
  backend.enabled.mockReturnValueOnce(false)
  expect((await POST(request())).status).toBe(503)
  expect(
    (
      await POST(
        new Request(request().url, {
          method: "POST",
          headers: { Origin: "https://attacker.example" },
        })
      )
    ).status
  ).toBe(403)
  expect(backend.begin).not.toHaveBeenCalled()
  const response = await POST(request())
  expect(response.status).toBe(303)
  expect(response.headers.get("set-cookie")).toMatch(/HttpOnly/)
  expect(response.headers.get("set-cookie")).toMatch(/Secure/)
  expect(response.headers.get("set-cookie")).toMatch(/SameSite=lax/i)
  expect(backend.begin).toHaveBeenCalledWith("owner-a")
})

it("rejects missing, mismatched and malformed browser state without exchanging credentials", async () => {
  for (const value of ["", "b".repeat(43), "é".repeat(43)]) {
    const request = new NextRequest(
      `${origin}${path}?state=${encodeURIComponent(value)}&code=private-code`,
      { headers: { cookie: `chatgpt_oauth_state=${state}` } }
    )
    const response = await GET(request)
    expect(response.headers.get("location")).toBe(
      origin + "/api-keys?chatgpt=failed"
    )
    expect(response.headers.get("location")).not.toContain("private-code")
  }
  expect(backend.finish).not.toHaveBeenCalled()
})

it("consumes denied attempts and clears the browser cookie on callback", async () => {
  const request = new NextRequest(
    `${origin}${path}?state=${state}&error=access_denied`,
    { headers: { cookie: `chatgpt_oauth_state=${state}` } }
  )
  const response = await GET(request)
  expect(backend.cancel).toHaveBeenCalledWith("owner-a", state)
  expect(backend.finish).not.toHaveBeenCalled()
  expect(response.headers.get("set-cookie")).toMatch(/Max-Age=0/)
  expect(response.headers.get("cache-control")).toBe("no-store")
})

it("exchanges a matching callback for its authenticated owner and redirects without secrets", async () => {
  const request = new NextRequest(
    `${origin}${path}?state=${state}&code=private-code`,
    { headers: { cookie: `chatgpt_oauth_state=${state}` } }
  )
  const response = await GET(request)
  expect(backend.finish).toHaveBeenCalledWith("owner-a", state, "private-code")
  expect(response.headers.get("location")).toBe(
    origin + "/api-keys?chatgpt=connected"
  )
})
