import { beforeEach, describe, expect, it, vi } from "vitest"
import { saveApiKey, removeApiKey } from "@/actions/api-keys"

const backend = vi.hoisted(() => ({
  auth: vi.fn(),
  verify: vi.fn(),
  update: vi.fn(),
}))
vi.mock("@clerk/nextjs/server", () => ({ auth: backend.auth }))
vi.mock("@/lib/ai/provider-key-validation", () => ({
  validateProviderKey: backend.verify,
}))
vi.mock("@/lib/ai/user-api-keys", () => ({
  apiKeyClient: () => ({ users: { updateUserMetadata: backend.update } }),
}))

beforeEach(() => {
  backend.auth.mockResolvedValue({ userId: "signed-in-user" })
  backend.verify.mockResolvedValue(undefined)
  backend.update.mockResolvedValue({})
})

describe("API key server actions", () => {
  it("rejects signed-out requests before validation, provider calls, or writes", async () => {
    backend.auth.mockResolvedValue({ userId: null })
    expect(
      await saveApiKey({ provider: "gemini", key: "secret" })
    ).toMatchObject({ code: "AUTHENTICATION_REQUIRED" })
    expect(await removeApiKey("gemini")).toMatchObject({
      code: "AUTHENTICATION_REQUIRED",
    })
    expect(backend.verify).not.toHaveBeenCalled()
    expect(backend.update).not.toHaveBeenCalled()
  })

  it("takes ownership from Clerk and returns no secret after saving", async () => {
    const result = await saveApiKey({
      provider: "gemini",
      key: " private-key ",
      userId: "someone-else",
    })
    expect(backend.verify).toHaveBeenCalledWith("gemini", "private-key")
    expect(backend.update).toHaveBeenCalledWith("signed-in-user", {
      privateMetadata: { providerApiKeys: { gemini: "private-key" } },
    })
    expect(result).toEqual({ success: true })
    expect(JSON.stringify(result)).not.toContain("private-key")
  })

  it("does not overwrite an existing key when provider verification fails", async () => {
    backend.verify.mockResolvedValue("Gemini rejected this API key.")
    expect(await saveApiKey({ provider: "gemini", key: "invalid" })).toEqual({
      error: "Gemini rejected this API key.",
    })
    expect(backend.update).not.toHaveBeenCalled()
  })

  it("validates providers and key input on the server", async () => {
    for (const input of [
      { provider: "other", key: "key" },
      { provider: "gemini", key: " " },
      { provider: "openrouter", key: "with spaces" },
    ])
      expect(await saveApiKey(input)).toHaveProperty("error")
    expect(await removeApiKey("other")).toHaveProperty("error")
    expect(backend.verify).not.toHaveBeenCalled()
    expect(backend.update).not.toHaveBeenCalled()
  })

  it("removes only the selected provider for the signed-in user", async () => {
    expect(await removeApiKey("openrouter")).toEqual({ success: true })
    expect(backend.update).toHaveBeenCalledWith("signed-in-user", {
      privateMetadata: { providerApiKeys: { openrouter: null } },
    })
  })

  it("does not expose provider secrets or backend errors when persistence fails", async () => {
    backend.update.mockRejectedValue(
      new Error("sensitive internal details private-key")
    )
    const result = await saveApiKey({
      provider: "openrouter",
      key: "private-key",
    })
    expect(result).toHaveProperty("error")
    expect(JSON.stringify(result)).not.toMatch(/sensitive|private-key/)
    expect(await removeApiKey("openrouter")).toEqual({
      error: "Could not remove your API key. Try again.",
    })
  })
})
