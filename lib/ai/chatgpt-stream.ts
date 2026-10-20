import { ChatGPTConnectionError } from "../chatgpt"

export function verifiedChatGPTResponse(response: Response) {
  if (!response.ok || !response.body) return response
  const decoder = new TextDecoder()
  let pending = ""
  let completed = false
  let failed = false
  const inspect = (line: string) => {
    if (!line.startsWith("data:")) return
    try {
      const event = JSON.parse(line.slice(5).trim())
      if (event.type === "response.completed") completed = true
      if (
        event.type === "response.failed" ||
        event.type === "response.incomplete" ||
        event.type === "error"
      )
        failed = true
    } catch {
      /* Other SSE lines are handled by the provider parser. */
    }
  }
  const stream = response.body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        pending += decoder.decode(chunk, { stream: true })
        const lines = pending.split("\n")
        pending = lines.pop() ?? ""
        for (const line of lines) inspect(line)
        controller.enqueue(chunk)
      },
      flush() {
        pending += decoder.decode()
        inspect(pending)
        if (!completed && !failed)
          throw new ChatGPTConnectionError(
            "ChatGPT disconnected before completing the response. Please retry."
          )
        if (failed)
          throw new ChatGPTConnectionError(
            "ChatGPT could not complete the response. Check your plan usage or retry later."
          )
      },
    })
  )
  return new Response(stream, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  })
}
