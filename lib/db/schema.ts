import { relations } from "drizzle-orm"
import {
  index,
  boolean,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core"
import { createInsertSchema } from "drizzle-zod"
import { nanoid } from "nanoid"
import { z } from "zod"

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
