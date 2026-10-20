import { auth } from "@clerk/nextjs/server"
import { NextRequest, NextResponse } from "next/server"
import { timingSafeEqual } from "node:crypto"
import { finishChatGPT, cancelChatGPTAttempt } from "@/lib/chatgpt"

export async function GET(request: NextRequest) {
  const { userId } = await auth()
  if (!userId) return new Response("Sign in required", { status: 401 })
  const state = request.nextUrl.searchParams.get("state") ?? ""
  const expected = request.cookies.get("chatgpt_oauth_state")?.value ?? ""
  const code = request.nextUrl.searchParams.get("code")
  let outcome = "failed"
  if (
    /^[A-Za-z0-9_-]{43}$/.test(state) &&
    expected &&
    state.length === expected.length &&
    timingSafeEqual(Buffer.from(state), Buffer.from(expected))
  ) {
    try {
      if (code && !request.nextUrl.searchParams.has("error")) {
        await finishChatGPT(userId, state, code)
        outcome = "connected"
      } else {
        await cancelChatGPTAttempt(userId, state)
      }
    } catch {
      /* Tokens and raw OAuth failures must not enter URLs or telemetry. */
    }
  }
  const redirect = new URL(
    "/api-keys",
    process.env.CHATGPT_REDIRECT_URI ?? request.url
  )
  redirect.searchParams.set("chatgpt", outcome)
  const response = NextResponse.redirect(redirect)
  response.cookies.set("chatgpt_oauth_state", "", {
    path: "/api/connections/chatgpt",
    maxAge: 0,
  })
  response.headers.set("Cache-Control", "no-store")
  response.headers.set("Referrer-Policy", "no-referrer")
  return response
}
