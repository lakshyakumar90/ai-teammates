import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { ApiKeySettings } from "@/components/api-key-settings"

const actions = vi.hoisted(() => ({
  save: vi.fn(),
  remove: vi.fn(),
  refresh: vi.fn(),
  toast: vi.fn(),
}))
vi.mock("@/actions/api-keys", () => ({
  saveApiKey: actions.save,
  removeApiKey: actions.remove,
}))
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: actions.refresh }),
}))
vi.mock("@/hooks/use-session-action", () => ({
  useSessionAction: () => (action: () => Promise<unknown>) => action(),
}))
vi.mock("@/components/ui/toast", () => ({ toast: { add: actions.toast } }))

afterEach(cleanup)
beforeEach(() => {
  actions.save.mockResolvedValue({ success: true })
  actions.remove.mockResolvedValue({ success: true })
})

const providerForm = (provider: string) =>
  within(screen.getByRole("form", { name: `${provider} API key settings` }))
const providerSection = (provider: string) =>
  within(screen.getByRole("region", { name: provider }))

describe("API key settings", () => {
  it("shows both providers and prevents empty keys from reaching the server", async () => {
    const user = userEvent.setup()
    render(<ApiKeySettings gemini={false} openrouter={false} />)
    expect(screen.getAllByText("Key required")).toHaveLength(3)
    await user.click(
      providerForm("Gemini").getByRole("button", { name: "Save Gemini key" })
    )
    expect(await screen.findByText("Enter an API key")).toBeTruthy()
    expect(actions.save).not.toHaveBeenCalled()
  })

  it("saves a key, clears and masks the input, and immediately offers replacement/removal", async () => {
    const user = userEvent.setup()
    render(<ApiKeySettings gemini={false} openrouter={false} />)
    const form = providerForm("Gemini")
    const input = form.getByLabelText("API key") as HTMLInputElement
    expect(input.type).toBe("password")
    await user.type(input, "personal-google-key")
    await user.click(form.getByRole("button", { name: "Show Gemini API key" }))
    expect(input.type).toBe("text")
    await user.click(form.getByRole("button", { name: "Save Gemini key" }))
    await waitFor(() =>
      expect(actions.save).toHaveBeenCalledWith({
        provider: "gemini",
        key: "personal-google-key",
      })
    )
    expect(providerSection("Gemini").getByText("Using your key")).toBeTruthy()
    expect(input.value).toBe("")
    expect(input.type).toBe("password")
    expect(
      form.getByRole("button", { name: "Replace Gemini key" })
    ).toBeTruthy()
    expect(form.getByRole("button", { name: "Remove Gemini key" })).toBeTruthy()
    expect(providerSection("OpenRouter").getByText("Key required")).toBeTruthy()
    expect(actions.refresh).toHaveBeenCalledOnce()
  })

  it("preserves an existing key's status when a replacement is rejected", async () => {
    actions.save.mockResolvedValue({ error: "Gemini rejected this API key." })
    const user = userEvent.setup()
    render(<ApiKeySettings gemini openrouter={false} />)
    const form = providerForm("Gemini")
    await user.type(form.getByLabelText("Replace API key"), "invalid-key")
    await user.click(form.getByRole("button", { name: "Replace Gemini key" }))
    expect(
      await screen.findByText("Gemini rejected this API key.")
    ).toBeTruthy()
    expect(providerSection("Gemini").getByText("Using your key")).toBeTruthy()
    expect(actions.toast).not.toHaveBeenCalled()
    expect(actions.refresh).not.toHaveBeenCalled()
  })

  it("disables the pending provider's controls without blocking the other provider", async () => {
    let complete!: (value: { success: boolean }) => void
    actions.save.mockReturnValue(
      new Promise((resolve) => {
        complete = resolve
      })
    )
    const user = userEvent.setup()
    render(<ApiKeySettings gemini openrouter={false} />)
    const form = providerForm("Gemini")
    const input = form.getByLabelText("Replace API key") as HTMLInputElement
    await user.type(input, "replacement-key")
    await user.click(form.getByRole("button", { name: "Replace Gemini key" }))
    expect(input.disabled).toBe(true)
    expect(
      (
        form.getByRole("button", {
          name: "Remove Gemini key",
        }) as HTMLButtonElement
      ).disabled
    ).toBe(true)
    expect(
      (
        providerForm("OpenRouter").getByRole("button", {
          name: "Save OpenRouter key",
        }) as HTMLButtonElement
      ).disabled
    ).toBe(false)
    complete({ success: true })
    await waitFor(() => expect(input.disabled).toBe(false))
  })

  it("removes only the selected provider's key and switches its status to the app key", async () => {
    const user = userEvent.setup()
    render(<ApiKeySettings gemini openrouter />)
    await user.click(
      providerForm("OpenRouter").getByRole("button", {
        name: "Remove OpenRouter key",
      })
    )
    await waitFor(() =>
      expect(actions.remove).toHaveBeenCalledWith("openrouter")
    )
    expect(providerSection("OpenRouter").getByText("Key required")).toBeTruthy()
    expect(providerSection("Gemini").getByText("Using your key")).toBeTruthy()
    expect(
      providerForm("OpenRouter").queryByRole("button", {
        name: "Remove OpenRouter key",
      })
    ).toBeNull()
    expect(actions.refresh).toHaveBeenCalledOnce()
  })

  it("keeps saved-key controls available and displays failures when removal fails", async () => {
    actions.remove.mockResolvedValue({
      error: "Could not remove your API key. Try again.",
    })
    const user = userEvent.setup()
    render(<ApiKeySettings gemini openrouter={false} />)
    await user.click(
      providerForm("Gemini").getByRole("button", { name: "Remove Gemini key" })
    )
    expect(
      await screen.findByText("Could not remove your API key. Try again.")
    ).toBeTruthy()
    expect(providerSection("Gemini").getByText("Using your key")).toBeTruthy()
    expect(actions.toast).not.toHaveBeenCalled()
  })
})
