import { tool } from "ai"
import { z } from "zod"

export const memoryScopeSchema = z.enum(["global", "group", "bot"])
export type MemoryScope = z.infer<typeof memoryScopeSchema>
export type MemoryFact = { scope: MemoryScope; key: string; value: string }
export const defaultMemoryPreferences = {
  automaticMemory: true,
  globalMemory: true,
  groupMemory: true,
  botMemoryInGroups: false,
}
export type MemoryPreferences = typeof defaultMemoryPreferences
export type MemoryStore = {
  read: (scope: MemoryScope) => Promise<string>
  write: (
    scope: MemoryScope,
    facts: Omit<MemoryFact, "scope">[]
  ) => Promise<void>
}

export function allowedMemoryScope(
  scope: MemoryScope,
  group: boolean,
  preferences: MemoryPreferences
) {
  if (scope === "global") return preferences.globalMemory
  if (scope === "group") return group && preferences.groupMemory
  return !group || preferences.botMemoryInGroups
}

export function automaticMemoryScope(
  fact: MemoryFact,
  group: boolean,
  preferences: MemoryPreferences
): MemoryScope | undefined {
  if (!preferences.automaticMemory) return
  let scope = fact.scope
  if (scope === "global" && !preferences.globalMemory)
    scope = group ? "group" : "bot"
  if (scope === "group" && !group) scope = "bot"
  return allowedMemoryScope(scope, group, preferences) ? scope : undefined
}

export function createMemoryManager({
  group,
  preferences,
  store,
}: {
  group: boolean
  preferences: MemoryPreferences
  store: MemoryStore
}) {
  async function write(scope: MemoryScope, facts: Omit<MemoryFact, "scope">[]) {
    if (scope === "bot") {
      const shared = (
        await Promise.all(
          (["global", "group"] as const)
            .filter((entry) => allowedMemoryScope(entry, group, preferences))
            .map((entry) => store.read(entry))
        )
      ).join("\n")
      const lines = new Set(
        shared.split(/\r?\n/).map((line) => line.trim().toLowerCase())
      )
      facts = facts.filter(
        ({ key, value }) => !lines.has(`- ${key}: ${value}`.toLowerCase())
      )
    }
    if (facts.length) await store.write(scope, facts)
  }
  async function read(scope?: MemoryScope) {
    if (scope) {
      if (!allowedMemoryScope(scope, group, preferences))
        throw new Error(
          "This memory scope is disabled or unavailable in this chat."
        )
      return { [scope]: await store.read(scope) }
    }
    const entries = await Promise.all(
      memoryScopeSchema.options
        .filter((entry) => allowedMemoryScope(entry, group, preferences))
        .map(async (entry) => [entry, await store.read(entry)] as const)
    )
    return Object.fromEntries(entries)
  }
  async function remember(facts: MemoryFact[]) {
    const buckets = new Map<MemoryScope, Omit<MemoryFact, "scope">[]>()
    for (const fact of facts) {
      const scope = automaticMemoryScope(fact, group, preferences)
      if (!scope) continue
      const bucket = buckets.get(scope) ?? []
      bucket.push({ key: fact.key, value: fact.value })
      buckets.set(scope, bucket)
    }
    // Shared writes first so duplicate bot notes in the same extraction are skipped.
    for (const scope of memoryScopeSchema.options) {
      const entries = buckets.get(scope)
      if (entries) await write(scope, entries)
    }
  }
  const tools = {
    readMemory: tool({
      description:
        "Read authorized memory: global user facts, this group's shared notes, or your individual bot notes. Omit scope to read all available levels. Never access other users, groups, or bots.",
      inputSchema: z.object({ scope: memoryScopeSchema.optional() }),
      execute: async ({ scope }, { abortSignal }) => {
        abortSignal?.throwIfAborted()
        return read(scope)
      },
    }),
    writeMemory: tool({
      description:
        "Save or update useful facts in ONE memory level. Global: personal facts/preferences and important user context useful across chats, regardless of which chat supplied them. Group: this group's local projects/decisions. Bot: individual context or information explicitly marked private. Do not duplicate shared facts into bot notes. Write - snake_case_key: value bullets. Use [forgotten] to delete a fact. Never store secrets, speculation, code or transcripts.",
      inputSchema: z.object({
        scope: memoryScopeSchema.optional(),
        content: z.string().max(32000),
      }),
      execute: async ({ scope = "bot", content }, { abortSignal }) => {
        abortSignal?.throwIfAborted()
        if (!allowedMemoryScope(scope, group, preferences))
          throw new Error(
            "This memory scope is disabled by your privacy settings."
          )
        if (
          /```|~~~|#include|\b(?:int|void)\s+main\s*\(|std::|\bconsole\.log\s*\(/.test(
            content
          )
        )
          throw new Error("Memory cannot contain program source.")
        const lines = content.split(/\r?\n/).filter((line) => line.trim())
        const facts = lines.map((line) => {
          const match =
            /^\s*[-*]\s+([a-z][a-z0-9_]{0,59}):\s*(\S[^\r\n]*)$/.exec(line)
          if (!match || match[2].length > 500)
            throw new Error("Use - snake_case_key: value fact bullets.")
          return { key: match[1], value: match[2].trim() }
        })
        if (
          !preferences.automaticMemory &&
          facts.some(({ value }) => value !== "[forgotten]")
        )
          throw new Error(
            "Saving new memory is paused in your memory settings. Existing facts can still be deleted."
          )
        if (facts.length) await write(scope, facts)
        return { scope, written: true }
      },
    }),
  }
  return { read, remember, tools }
}

// Resolve again for each execution: handoffs change the active bot, and the
// user can change privacy preferences between turns.
export function createRoutedMemoryTools(
  resolve: () => Promise<ReturnType<typeof createMemoryManager>>
) {
  const template = createMemoryManager({
    group: false,
    preferences: defaultMemoryPreferences,
    store: { read: async () => "", write: async () => {} },
  }).tools
  return {
    readMemory: {
      ...template.readMemory,
      execute: async (
        ...args: Parameters<NonNullable<typeof template.readMemory.execute>>
      ) => (await resolve()).tools.readMemory.execute!(...args),
    },
    writeMemory: {
      ...template.writeMemory,
      execute: async (
        ...args: Parameters<NonNullable<typeof template.writeMemory.execute>>
      ) => (await resolve()).tools.writeMemory.execute!(...args),
    },
  }
}
