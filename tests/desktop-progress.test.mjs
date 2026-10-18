import assert from "node:assert/strict"
import test from "node:test"
import { desktopProgressPolicy } from "../lib/ai/desktop-progress.ts"

const tools = {
  mouseScroll: {},
  mouseClick: {},
  viewScreen: {},
  keyboardPress: {},
}
const policy = desktopProgressPolicy(tools)
const call = (toolName, input) => ({ toolName, input })
const evaluate = (calls, stepNumber = 4) =>
  policy({
    steps: calls.map((toolCall) => ({ toolCalls: [toolCall] })),
    stepNumber,
    initialInstructions: "Read the footer contacts.",
  })

test("repeated actions are disabled while observation and recovery remain available", () => {
  const result = evaluate(
    Array.from({ length: 3 }, () => call("mouseClick", { x: 10, y: 20 }))
  )
  assert.ok(!result.activeTools.includes("mouseClick"))
  assert.ok(result.activeTools.includes("viewScreen"))
  assert.ok(result.activeTools.includes("keyboardPress"))
})

test("scrolling is bounded even if animation changes screenshots or coordinates", () => {
  const result = evaluate(
    Array.from({ length: 6 }, (_, x) =>
      call("mouseScroll", { x, y: 100, direction: "down" })
    )
  )
  assert.ok(!result.activeTools.includes("mouseScroll"))
  assert.ok(result.activeTools.includes("viewScreen"))
  assert.match(result.instructions, /contact methods/)
})

test("observation does not count as a repeated action and last step must answer", () => {
  assert.deepEqual(
    evaluate(Array.from({ length: 3 }, () => call("viewScreen", {})))
      .activeTools,
    Object.keys(tools)
  )
  assert.equal(evaluate([], 19).toolChoice, "none")
})

test("varied productive actions stay available", () => {
  assert.deepEqual(
    evaluate([
      call("mouseScroll", { direction: "down" }),
      call("viewScreen", {}),
      call("keyboardPress", { key: "End", modifiers: ["ctrl"] }),
    ]).activeTools,
    Object.keys(tools)
  )
})

test("a navigation or recovery action restores scrolling for the new context", () => {
  const calls = Array.from({ length: 6 }, (_, x) =>
    call("mouseScroll", { x, direction: "down" })
  )
  calls.push(call("keyboardPress", { key: "End", modifiers: ["ctrl"] }))
  assert.ok(evaluate(calls).activeTools.includes("mouseScroll"))
})
