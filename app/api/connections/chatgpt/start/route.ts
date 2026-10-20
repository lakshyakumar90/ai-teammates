import { auth } from "@clerk/nextjs/server"
import { NextResponse } from "next/server"
import { beginChatGPT, chatGPTEnabled } from "@/lib/chatgpt"

export async function POST(request: Request) {
  const { userId } = await auth()
  if (!userId) return new Response("Sign in required", { status: 401 })
  if (!chatGPTEnabled())
    return new Response(
      "Hosted ChatGPT plan access is not enabled for this app.",
      { status: 503 }
    )
  const callback = new URL(process.env.CHATGPT_REDIRECT_URI!)
  if (request.headers.get("origin") !== callback.origin)
    return new Response("Invalid origin", { status: 403 })
  const { url, state } = await beginChatGPT(userId)
  const response = NextResponse.redirect(url, 303)
  response.cookies.set("chatgpt_oauth_state", state, {
    httpOnly: true,
    secure: callback.protocol === "https:",
    sameSite: "lax",
    path: "/api/connections/chatgpt",
    maxAge: 600,
  })
  response.headers.set("Cache-Control", "no-store")
  return response
}
