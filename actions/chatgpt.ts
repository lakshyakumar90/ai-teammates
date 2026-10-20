"use server"
import { auth } from "@clerk/nextjs/server"
import { disconnectChatGPT } from "@/lib/chatgpt"
import { revalidatePath } from "next/cache"

export async function disconnectChatGPTAction() {
  const { userId } = await auth()
  if (!userId) return { error: "Sign in to manage your connection." }
  try {
    const revoked = await disconnectChatGPT(userId)
    revalidatePath("/api-keys")
    return {
      success: true,
      warning: revoked
        ? undefined
        : "Disconnected locally. Remote revocation was not confirmed; disconnect AI Teammates in ChatGPT settings too.",
    }
  } catch {
    return { error: "Could not disconnect ChatGPT. Try again." }
  }
}
