import assert from "node:assert/strict"
import test from "node:test"
import { tokenCost, resetCountdown } from "../lib/usage-policy.ts"

test("token costs include output reasoning and round up to micro-dollars", () => {
  assert.equal(tokenCost(1000, 2000, { input: 0.5, output: 3 }), 6500)
  assert.equal(tokenCost(1, 0, { input: 0.075, output: 0.3 }), 1)
  assert.equal(tokenCost(200, 300, { input: 0, output: 0 }), 0)
  assert.throws(() => tokenCost(-1, 0, { input: 1, output: 1 }))
  assert.throws(() => tokenCost(1, 0, { input: NaN, output: 1 }))
})

test("countdown never shows negative time after the billing period ends", () => {
  assert.equal(resetCountdown(100, 101), "Reset pending")
  assert.equal(resetCountdown(90000000, 0), "1d 1h")
  assert.equal(resetCountdown(60000, 0), "0h 1m")
})
