"use server"

import { auth } from "@clerk/nextjs/server"
import { apiKeySchema } from "@/lib/api-key-schema"
import { apiKeyClient } from "@/lib/ai/user-api-keys"
import { validateProviderKey } from "@/lib/ai/provider-key-validation"
import { authenticationFailure } from "@/lib/auth-policy"

export async function saveApiKey(input: unknown) {
  const { userId } = await auth()
  if (!userId) return authenticationFailure
  const parsed = apiKeySchema.safeParse(input)
  if (!parsed.success) return { error: "Enter a valid provider and API key." }
  try {
    const error = await validateProviderKey(
      parsed.data.provider,
      parsed.data.key
    )
    if (error) return { error }
    await apiKeyClient().users.updateUserMetadata(userId, {
      privateMetadata: {
        providerApiKeys: { [parsed.data.provider]: parsed.data.key },
      },
    })
    return { success: true }
  } catch {
    return { error: "Could not save your API key. Try again." }
  }
}

export async function removeApiKey(input: unknown) {
  const { userId } = await auth()
  if (!userId) return authenticationFailure
  const parsed = apiKeySchema.shape.provider.safeParse(input)
  if (!parsed.success) return { error: "Unknown provider." }
  try {
    await apiKeyClient().users.updateUserMetadata(userId, {
      privateMetadata: { providerApiKeys: { [parsed.data]: null } },
    })
    return { success: true }
  } catch {
    return { error: "Could not remove your API key. Try again." }
  }
}
