import assert from "node:assert/strict"
import test from "node:test"
import { createComputerTools } from "../lib/ai/computer-tools.ts"

function desktop() {
  let image = "AA=="
  let scrolls = 0
  let nextImage
  const sandbox = {
    computerUse: {
      start: async () => {},
      screenshot: { takeFullScreen: async () => ({ screenshot: image }) },
      mouse: {
        scroll: async () => {
          scrolls++
          if (nextImage) image = nextImage
        },
      },
    },
  }
  const tool = createComputerTools(async () => sandbox, true).mouseScroll
  const scroll = (input = {}) =>
    tool.execute(
      { x: 200, y: 300, direction: "down", amount: 3, ...input },
      { toolCallId: "test", messages: [] }
    )
  return {
    tool,
    scroll,
    count: () => scrolls,
    setImage: (value) => {
      image = value
    },
    setNext: (value) => {
      nextImage = value
    },
  }
}

test("unchanged screen reports no progress and prevents another wheel event", async () => {
  const d = desktop()
  const result = await d.scroll()
  assert.equal(result.scrollEventSent, true)
  assert.equal(result.screenChanged, false)
  assert.equal(d.count(), 1)
  assert.match(result.message, /Do not repeat/)
  const blocked = await d.scroll({ amount: 50 })
  assert.equal(blocked.blocked, true)
  assert.equal(blocked.scrollEventSent, false)
  assert.equal(d.count(), 1)
  const modelOutput = await d.tool.toModelOutput({ output: result })
  assert.equal(modelOutput.value[1].type, "file")
})

test("a changed screen, reverse direction, or different container can make progress", async () => {
  const d = desktop()
  await d.scroll()
  d.setNext("AQ==")
  assert.equal((await d.scroll({ direction: "up" })).screenChanged, true)
  d.setImage("Ag==")
  assert.equal((await d.scroll()).screenChanged, true)
  d.setNext("Aw==")
  assert.equal((await d.scroll({ x: 700 })).screenChanged, true)
  assert.equal(d.count(), 4)
})

test("text-only models cannot send desktop scroll events", async () => {
  let resolved = false
  const tool = createComputerTools(async () => {
    resolved = true
  }, false).mouseScroll
  assert.throws(
    () =>
      tool.execute(
        { x: 0, y: 0, direction: "down", amount: 3 },
        { toolCallId: "test", messages: [] }
      ),
    /image-capable/
  )
  assert.equal(resolved, false)
})
