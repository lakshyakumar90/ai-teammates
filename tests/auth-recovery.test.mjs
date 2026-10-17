import assert from "node:assert/strict"
import test from "node:test"
import {
  authenticationFailure,
  recoverSessionAction,
} from "../lib/auth-policy.ts"
import { checkPaidAccess } from "../lib/access-policy.ts"
import { billingFailure, PaidPlanRequiredError } from "../lib/billing-policy.ts"

test("missing sessions are handled before subscription checks or mutations", async () => {
  let checked = false
  assert.deepEqual(
    await checkPaidAccess(null, async () => {
      checked = true
    }),
    authenticationFailure
  )
  assert.equal(checked, false)
})

test("subscription denials stay distinct from authentication and backend failures", async () => {
  assert.equal(await checkPaidAccess("test-user", async () => {}), undefined)
  assert.deepEqual(
    await checkPaidAccess("test-user", async () => {
      throw new PaidPlanRequiredError()
    }),
    billingFailure
  )
  await assert.rejects(
    checkPaidAccess("test-user", async () => {
      throw new Error("provider unavailable")
    }),
    /provider unavailable/
  )
})

test("a stale session is refreshed once before safely retrying", async () => {
  let requests = 0,
    refreshes = 0,
    mutations = 0
  const result = await recoverSessionAction(
    async () => {
      requests++
      if (requests === 1) return authenticationFailure
      mutations++
      return { allowed: true }
    },
    async () => {
      refreshes++
      return "synthetic-token"
    }
  )
  assert.deepEqual(result, { allowed: true })
  assert.deepEqual(
    { requests, refreshes, mutations },
    { requests: 2, refreshes: 1, mutations: 1 }
  )
})

test("signed-out and repeatedly rejected sessions do not retry indefinitely", async () => {
  let requests = 0,
    refreshes = 0
  const action = async () => {
    requests++
    return authenticationFailure
  }
  assert.deepEqual(
    await recoverSessionAction(action, async () => {
      refreshes++
      return null
    }),
    authenticationFailure
  )
  assert.equal(requests, 1)
  assert.deepEqual(
    await recoverSessionAction(action, async () => {
      refreshes++
      return "synthetic-token"
    }),
    authenticationFailure
  )
  assert.equal(requests, 3)
  assert.equal(refreshes, 2)
})

test("success, plan denials, network errors, and failed mutations are never replayed", async () => {
  for (const result of [
    { allowed: true },
    billingFailure,
    { error: "mutation failed" },
  ]) {
    let requests = 0
    assert.deepEqual(
      await recoverSessionAction(
        async () => {
          requests++
          return result
        },
        async () => {
          throw new Error("must not refresh")
        }
      ),
      result
    )
    assert.equal(requests, 1)
  }
  await assert.rejects(
    recoverSessionAction(
      async () => {
        throw new Error("network failed")
      },
      async () => {
        throw new Error("must not refresh")
      }
    ),
    /network failed/
  )
})
