import {
  pgTable,
  text,
  varchar,
  timestamp,
  jsonb,
  index,
  serial,
  boolean,
  integer,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Session storage table (required for Replit Auth)
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// User storage table (required for Replit Auth)
export const users = pgTable("users", {
  id: varchar("id").primaryKey().notNull(),
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// API Keys table for BYOK functionality
export const apiKeys = pgTable("api_keys", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  provider: varchar("provider").notNull(), // openai, gemini, claude, grok
  encryptedKey: text("encrypted_key").notNull(),
  keyPreview: varchar("key_preview"), // last 4 chars for display
  isValid: boolean("is_valid").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Chats table
export const chats = pgTable("chats", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: varchar("title").notNull(),
  role: varchar("role").notNull(),
  customRole: text("custom_role"),
  context: text("context"),
  task: varchar("task", { length: 200 }),
  inputData: text("input_data"),
  constraints: varchar("constraints", { length: 200 }),
  examples: text("examples"),
  optional: varchar("optional", { length: 200 }),
  audience: varchar("audience", { length: 200 }),
  aiProvider: varchar("ai_provider").notNull(),
  aiModel: varchar("ai_model").notNull(),
  configuration: jsonb("configuration"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Messages table
export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  chatId: integer("chat_id").notNull().references(() => chats.id, { onDelete: "cascade" }),
  role: varchar("role").notNull(), // user, assistant, system
  content: text("content").notNull(),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Role prompts table for template management
export const rolePrompts = pgTable("role_prompts", {
  id: serial("id").primaryKey(),
  role: varchar("role").notNull().unique(),
  template: text("template").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  chats: many(chats),
  apiKeys: many(apiKeys),
}));

export const chatsRelations = relations(chats, ({ one, many }) => ({
  user: one(users, {
    fields: [chats.userId],
    references: [users.id],
  }),
  messages: many(messages),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  chat: one(chats, {
    fields: [messages.chatId],
    references: [chats.id],
  }),
}));

export const apiKeysRelations = relations(apiKeys, ({ one }) => ({
  user: one(users, {
    fields: [apiKeys.userId],
    references: [users.id],
  }),
}));

// Zod schemas for validation
export const insertUserSchema = createInsertSchema(users);
export const insertChatSchema = createInsertSchema(chats);
export const insertMessageSchema = createInsertSchema(messages);
export const insertApiKeySchema = createInsertSchema(apiKeys);
export const insertRolePromptSchema = createInsertSchema(rolePrompts);

// Types
export type UpsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type InsertChat = z.infer<typeof insertChatSchema>;
export type Chat = typeof chats.$inferSelect;
export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type Message = typeof messages.$inferSelect;
export type InsertApiKey = z.infer<typeof insertApiKeySchema>;
export type ApiKey = typeof apiKeys.$inferSelect;
export type InsertRolePrompt = z.infer<typeof insertRolePromptSchema>;
export type RolePrompt = typeof rolePrompts.$inferSelect;

// Chat configuration schema
export const chatConfigSchema = z.object({
  role: z.enum(["researcher", "product_manager", "developer", "content_writer", "designer", "custom"]),
  customRole: z.string().optional(),
  context: z.string().max(5000),
  task: z.string().max(200),
  inputData: z.string().max(5000),
  constraints: z.string().max(200),
  examples: z.string().max(5000),
  optional: z.string().max(200),
  audience: z.string().max(200),
  aiProvider: z.enum(["openai", "gemini", "claude", "grok"]),
  aiModel: z.string(),
  title: z.string().min(1).max(100),
});

export type ChatConfig = z.infer<typeof chatConfigSchema>;
