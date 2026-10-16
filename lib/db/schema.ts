import { relations } from "drizzle-orm"
import {
  index,
  boolean,
  integer,
  bigint,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core"
import { createInsertSchema } from "drizzle-zod"
import { nanoid } from "nanoid"
import { z } from "zod"

export const usagePeriods = pgTable(
  "usage_periods",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    aiMicros: bigint("ai_micros", { mode: "number" }).notNull().default(0),
    aiCalls: integer("ai_calls").notNull().default(0),
    sandboxSeconds: integer("sandbox_seconds").notNull().default(0),
    botCreations: integer("bot_creations").notNull().default(0),
  },
  (t) => [index("usage_periods_user_idx").on(t.userId)]
)

export const usageEntries = pgTable(
  "usage_entries",
  {
    id: text("id").primaryKey(),
    periodId: text("period_id")
      .notNull()
      .references(() => usagePeriods.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    modelId: text("model_id"),
    amount: bigint("amount", { mode: "number" }).notNull(),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    settled: boolean("settled").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("usage_entries_period_idx").on(t.periodId)]
)

// One runtime lease per user, including provisioning and stopping. Never
// discard an expired lease until Daytona confirms that its sandbox stopped.
export const sandboxLeases = pgTable("sandbox_leases", {
  userId: text("user_id").primaryKey(),
  id: text("id").notNull().unique(),
  sandboxId: text("sandbox_id").notNull(),
  entryId: text("entry_id"),
  startsAt: timestamp("starts_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  ready: boolean("ready").notNull().default(false),
  stoppingUntil: timestamp("stopping_until", { withTimezone: true }),
})

export const botCapacity = pgTable("bot_capacity", {
  userId: text("user_id").primaryKey(),
  count: integer("count").notNull().default(0),
})

export const bots = pgTable(
  "bots",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => nanoid()),
    userId: text("user_id").notNull(),
    name: text("name").notNull(),
    avatar: text("avatar")
      .notNull()
      .$defaultFn(() => nanoid()),
    job: text("job").notNull(),
    instructions: text("instructions"),
    sandboxId: text("sandbox_id"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("bots_user_id_idx").on(table.userId)]
)

export const insertBotSchema = createInsertSchema(bots, {
  name: z.string().min(1, "Name is required").max(100),
  job: z.string().min(1, "Job is required").max(200),
  instructions: z.string().max(2000).optional(),
  avatar: z.string().min(1),
})

export const memoryPreferences = pgTable("memory_preferences", {
  userId: text("user_id").primaryKey(),
  automaticMemory: boolean("automatic_memory").notNull().default(true),
  globalMemory: boolean("global_memory").notNull().default(true),
  groupMemory: boolean("group_memory").notNull().default(true),
  botMemoryInGroups: boolean("bot_memory_in_groups").notNull().default(false),
})

export const memoryPreferencesFormSchema = createInsertSchema(memoryPreferences)
  .omit({ userId: true })
  .required()

export const userMemories = pgTable(
  "user_memories",
  {
    userId: text("user_id").notNull(),
    key: text("key").notNull(),
    value: text("value").notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.key] })]
)

export const chatKindEnum = pgEnum("chat_kind", ["direct", "group"])

export const chats = pgTable(
  "chats",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => nanoid()),
    userId: text("user_id").notNull(),
    kind: chatKindEnum("kind").notNull().default("direct"),
    name: text("name"),
    lastMessagePreview: text("last_message_preview"),
    lastMessageAt: timestamp("last_message_at").defaultNow().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("chats_user_id_idx").on(table.userId)]
)

export const insertChatSchema = createInsertSchema(chats, {
  name: z.string().trim().min(1, "Group name is required").max(100),
})

export const groupChatFormSchema = insertChatSchema
  .omit({
    id: true,
    userId: true,
    kind: true,
    lastMessagePreview: true,
    lastMessageAt: true,
    createdAt: true,
  })
  .extend({
    botIds: z
      .array(z.string().min(1))
      .min(2, "Select at least two bots")
      .refine(
        (ids) => new Set(ids).size === ids.length,
        "Select each bot only once"
      ),
  })

export const chatMembers = pgTable(
  "chat_members",
  {
    chatId: text("chat_id")
      .notNull()
      .references(() => chats.id, { onDelete: "cascade" }),
    botId: text("bot_id")
      .notNull()
      .references(() => bots.id, { onDelete: "cascade" }),
    joinedAt: timestamp("joined_at").defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.chatId, table.botId] }),
    index("chat_members_bot_id_idx").on(table.botId),
  ]
)

export const groupMemories = pgTable(
  "group_memories",
  {
    chatId: text("chat_id")
      .notNull()
      .references(() => chats.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    value: text("value").notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [primaryKey({ columns: [table.chatId, table.key] })]
)

export const botsRelations = relations(bots, ({ many }) => ({
  memberships: many(chatMembers),
}))

export const chatsRelations = relations(chats, ({ many }) => ({
  members: many(chatMembers),
}))

export const chatMembersRelations = relations(chatMembers, ({ one }) => ({
  chat: one(chats, {
    fields: [chatMembers.chatId],
    references: [chats.id],
  }),
  bot: one(bots, {
    fields: [chatMembers.botId],
    references: [bots.id],
  }),
}))
