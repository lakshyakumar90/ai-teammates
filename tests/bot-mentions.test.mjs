import assert from "node:assert/strict"
import test from "node:test"
import { getMentionQuery, resolveBotMention } from "../lib/ai/bot-mentions.ts"
const bots = [
  { id: "ada", name: "Ada", job: "Research" },
  { id: "adaa", name: "Adaa", job: "Writer" },
  { id: "code", name: "Code Reviewer", job: "Code review" },
  { id: "special", name: "Ada (Research)", job: "Research" },
]
test("dropdown recipient works without a typed mention", () => {
  const result = resolveBotMention("Please review this", bots, "code")
  assert.equal(result.bot.id, "code")
  assert.equal(result.text, "Please review this")
})
test("typed mentions override the dropdown without duplicating the rendered prefix", () => {
  const result = resolveBotMention("@Adaa Write this", bots, "ada")
  assert.equal(result.bot.id, "adaa")
  assert.equal(result.text, "Write this")
})
test("full names, case differences and special characters work", () => {
  assert.equal(
    resolveBotMention("@code reviewer Check this", bots).bot.id,
    "code"
  )
  assert.equal(
    resolveBotMention("@Ada (Research) Investigate", bots).bot.id,
    "special"
  )
})
test("mentions inside the prompt route the request and leave its content", () => {
  const result = resolveBotMention("Please @Adaa write a post", bots, "ada")
  assert.equal(result.bot.id, "adaa")
  assert.equal(result.text.replace(/\s+/g, " "), "Please write a post")
})
test("emails and unknown mentions do not change recipients", () => {
  assert.equal(
    resolveBotMention("Email me@Adaa please", bots, "ada").bot.id,
    "ada"
  )
  assert.equal(
    resolveBotMention("@unknown hello", bots, "ada").text,
    "@unknown hello"
  )
})
test("mention suggestions use the caret and ignore email addresses", () => {
  assert.deepEqual(getMentionQuery("hi @Ad later", 6), {
    start: 3,
    end: 6,
    query: "Ad",
  })
  assert.deepEqual(getMentionQuery("@", 1), { start: 0, end: 1, query: "" })
  assert.equal(getMentionQuery("me@Ada", 6), undefined)
})
