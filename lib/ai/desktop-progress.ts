import type { PrepareStepFunction, ToolSet } from "ai"

// Bound unproductive action loops even when animations prevent identical screenshots.
export function desktopProgressPolicy<T extends ToolSet>(
  tools: T
): PrepareStepFunction<T> {
  const toolNames = Object.keys(tools) as Extract<keyof T, string>[]
  return ({ steps, stepNumber, initialInstructions }) => {
    const calls = steps.flatMap((step) => step.toolCalls)
    const recent = calls.slice(-3)
    const repeated =
      recent.length === 3 &&
      recent.every(
        (call) =>
          call.toolName === recent[0].toolName &&
          JSON.stringify(call.input) === JSON.stringify(recent[0].input)
      ) &&
      !["viewScreen", "readMemory"].includes(recent[0].toolName)
    let scrolls = 0
    for (const call of calls.toReversed()) {
      if (call.toolName === "viewScreen") continue
      if (call.toolName !== "mouseScroll") break
      scrolls++
    }
    if (stepNumber >= 19)
      return {
        toolChoice: "none",
        instructions: `${initialInstructions}\nFinish this turn now with what you verified. Explain any remaining limitation honestly; do not claim the task completed without evidence.`,
      }
    const blocked = new Set<string>()
    if (repeated) blocked.add(recent[0].toolName)
    if (scrolls >= 6) blocked.add("mouseScroll")
    if (blocked.size)
      return {
        activeTools: toolNames.filter((name) => !blocked.has(name)),
        instructions: `${initialInstructions}\nProgress guard: ${[...blocked].join(", ")} is temporarily unavailable because of repeated actions. Inspect available evidence and change approach. For a bottom-of-page request, read the footer and report the contact methods and links you actually observed. If you cannot proceed, explain the obstacle.`,
      }
    return { activeTools: toolNames, instructions: initialInstructions }
  }
}
