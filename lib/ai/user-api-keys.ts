// Shared by the Next.js server and Trigger.dev worker. Never import into client UI.
import { createClerkClient } from "@clerk/backend"
import type { ApiKeyProvider } from "../api-key-schema"

export function apiKeyClient() {
  return createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY })
}

export async function getUserApiKeys(userId: string) {
  const user = await apiKeyClient().users.getUser(userId)
  const stored = user.privateMetadata.providerApiKeys
  const keys: Partial<Record<ApiKeyProvider, string>> = {}
  if (stored && typeof stored === "object") {
    for (const provider of ["gemini", "openrouter"] as const) {
      const key = (stored as Record<string, unknown>)[provider]
      if (typeof key === "string" && key.trim()) keys[provider] = key
    }
  }
  return keys
}
