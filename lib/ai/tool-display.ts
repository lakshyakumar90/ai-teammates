import { getToolName, isToolUIPart, type UIMessage } from "ai"

export function isVisibleMessagePart(part: UIMessage["parts"][number]) {
  if (isToolUIPart(part)) return getToolName(part) !== "viewScreen"
  return part.type === "file" || (part.type === "text" && Boolean(part.text))
}

export function screenImageUrl(output: unknown) {
  if (
    typeof output !== "object" ||
    output === null ||
    !("image" in output) ||
    typeof output.image !== "string" ||
    !("mediaType" in output) ||
    output.mediaType !== "image/png" ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(output.image)
  )
    return undefined
  return `data:image/png;base64,${output.image}`
}
