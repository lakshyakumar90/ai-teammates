import assert from "node:assert/strict"
import test from "node:test"
import {
  hasPaidSubscription,
  isBillingFailure,
  billingFailure,
  paidPlanMessage,
  PaidPlanRequiredError,
} from "../lib/billing-policy.ts"

const now = 1000
const item = (changes = {}) => ({
  plan: { slug: "pro" },
  status: "active",
  periodEnd: 2000,
  endedAt: null,
  ...changes,
})

test("only an active Pro subscription grants access", () => {
  assert.equal(hasPaidSubscription({ subscriptionItems: [item()] }, now), true)
  for (const entry of [
    item({ plan: { slug: "free_user" } }),
    item({ plan: null }),
    ...[
      "incomplete",
      "past_due",
      "ended",
      "abandoned",
      "upcoming",
      "expired",
    ].map((status) => item({ status })),
  ]) {
    assert.equal(
      hasPaidSubscription({ subscriptionItems: [entry] }, now),
      false
    )
  }
  assert.equal(hasPaidSubscription({ subscriptionItems: [] }, now), false)
  assert.equal(
    hasPaidSubscription(
      { subscriptionItems: [item({ periodEnd: now - 1 })] },
      now
    ),
    false
  )
})

test("scheduled cancellation retains access until its paid period ends", () => {
  assert.equal(
    hasPaidSubscription(
      { subscriptionItems: [item({ status: "canceled" })] },
      now
    ),
    true
  )
  assert.equal(
    hasPaidSubscription(
      { subscriptionItems: [item({ status: "canceled", periodEnd: now })] },
      now
    ),
    false
  )
  assert.equal(
    hasPaidSubscription(
      { subscriptionItems: [item({ status: "canceled", periodEnd: null })] },
      now
    ),
    false
  )
  assert.equal(
    hasPaidSubscription({ subscriptionItems: [item({ endedAt: 900 })] }, now),
    false
  )
})

test("billing failures are serializable and preserve the upgrade message", () => {
  assert.equal(
    isBillingFailure(JSON.parse(JSON.stringify(billingFailure))),
    true
  )
  assert.equal(isBillingFailure({ error: "Another failure" }), false)
  assert.equal(isBillingFailure(null), false)
  assert.equal(new PaidPlanRequiredError().message, paidPlanMessage)
})
