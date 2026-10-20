import { auth } from "@clerk/nextjs/server"
import { NextRequest, NextResponse } from "next/server"
import {
  communityChatGPTEnabled,
  communitySessionSchema,
  connectCommunityChatGPT,
  disconnectCommunityChatGPT,
} from "@/lib/community-chatgpt"

export const runtime = "nodejs"
const headers = { "Cache-Control": "no-store" }
async function owner(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) return null
  return (await auth()).userId
}

export async function POST(request: NextRequest) {
  const userId = await owner(request)
  if (!userId)
    return NextResponse.json(
      { error: "Unauthorized request." },
      { status: 403, headers }
    )
  if (!communityChatGPTEnabled())
    return NextResponse.json(
      { error: "Experimental ChatGPT is disabled." },
      { status: 503, headers }
    )
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    return NextResponse.json(
      { error: "Expected JSON." },
      { status: 415, headers }
    )
  // Bound the stream itself: Content-Length is optional and cannot be trusted.
  let size = 0
  const chunks: Uint8Array[] = []
  const reader = request.body?.getReader()
  if (!reader)
    return NextResponse.json(
      { error: "Missing connection." },
      { status: 400, headers }
    )
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > 45000) {
      await reader.cancel()
      return NextResponse.json(
        { error: "Connection too large." },
        { status: 413, headers }
      )
    }
    chunks.push(value)
  }
  let session
  try {
    session = communitySessionSchema.parse(
      JSON.parse(Buffer.concat(chunks).toString("utf8"))
    )
  } catch {
    return NextResponse.json(
      { error: "Invalid ChatGPT connection." },
      { status: 400, headers }
    )
  }
  try {
    await connectCommunityChatGPT(userId, session)
    return NextResponse.json({ connected: true }, { headers })
  } catch {
    return NextResponse.json(
      {
        error:
          "ChatGPT could not verify or save this connection. Try again or use an API key.",
      },
      { status: 502, headers }
    )
  }
}

export async function DELETE(request: NextRequest) {
  const userId = await owner(request)
  if (!userId)
    return NextResponse.json(
      { error: "Unauthorized request." },
      { status: 403, headers }
    )
  const revoked = await disconnectCommunityChatGPT(userId)
  return NextResponse.json(
    {
      connected: false,
      warning: revoked
        ? null
        : "Disconnected here. Upstream revocation could not be confirmed; review connected access in your OpenAI account.",
    },
    { headers }
  )
}
