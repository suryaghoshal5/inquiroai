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
  real,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Projects table — parent container for chats
export const projects = pgTable("projects", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 200 }).notNull(),
  description: text("description"),
  role: varchar("role"),
  customRole: text("custom_role"),
  context: text("context"),
  constraints: text("constraints"),
  audience: text("audience"),
  examples: text("examples"),
  optional: text("optional"),
  aiProvider: varchar("ai_provider"),
  aiModel: varchar("ai_model"),
  localFolderPath: text("local_folder_path"),
  configuration: jsonb("configuration"),
  isArchived: boolean("is_archived").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

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
  projectId: integer("project_id").references(() => projects.id, { onDelete: "set null" }),
  title: varchar("title").notNull(),
  role: varchar("role").notNull(),
  customRole: text("custom_role"),
  context: text("context"),
  task: text("task"),
  inputData: text("input_data"),
  constraints: text("constraints"),
  examples: text("examples"),
  optional: text("optional"),
  audience: text("audience"),
  aiProvider: varchar("ai_provider").notNull(),
  aiModel: varchar("ai_model").notNull(),
  configuration: jsonb("configuration"),
  compressionCount: integer("compression_count").default(0),
  totalTokensUsed: integer("total_tokens_used").default(0),
  totalCostUsd: real("total_cost_usd").default(0),
  notionPageId: varchar("notion_page_id"),
  archivedAt: timestamp("archived_at"),
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

// Prompt intelligence table for Layer 2
export const promptIntelligence = pgTable('prompt_intelligence', {
  id: serial('id').primaryKey(),
  messageId: integer('message_id').references(() => messages.id),
  chatId: integer('chat_id').references(() => chats.id),
  userId: text('user_id').references(() => users.id),
  originalPrompt: text('original_prompt').notNull(),
  improvedPrompt: text('improved_prompt'),
  promptType: text('prompt_type'),
  complexity: text('complexity'),
  score: integer('score'),
  modelRecommended: text('model_recommended'),
  modelUsed: text('model_used'),
  userAcceptedSuggestion: boolean('user_accepted_suggestion'),
  promptTokens: integer('prompt_tokens'),
  completionTokens: integer('completion_tokens'),
  costUsd: real('cost_usd'),
  createdAt: timestamp('created_at').defaultNow(),
});

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  chats: many(chats),
  apiKeys: many(apiKeys),
  projects: many(projects),
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
  user: one(users, {
    fields: [projects.userId],
    references: [users.id],
  }),
  chats: many(chats),
}));

export const chatsRelations = relations(chats, ({ one, many }) => ({
  user: one(users, {
    fields: [chats.userId],
    references: [users.id],
  }),
  project: one(projects, {
    fields: [chats.projectId],
    references: [projects.id],
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
export const insertProjectSchema = createInsertSchema(projects);
export const insertUserSchema = createInsertSchema(users);
export const insertChatSchema = createInsertSchema(chats);
export const insertMessageSchema = createInsertSchema(messages);
export const insertApiKeySchema = createInsertSchema(apiKeys);
export const insertRolePromptSchema = createInsertSchema(rolePrompts);
export const insertPromptIntelligenceSchema = createInsertSchema(promptIntelligence);

// Types
export type InsertProject = z.infer<typeof insertProjectSchema>;
export type Project = typeof projects.$inferSelect;
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
export type InsertPromptIntelligence = z.infer<typeof insertPromptIntelligenceSchema>;
export type PromptIntelligenceRecord = typeof promptIntelligence.$inferSelect;

// Chat configuration schema
export const chatConfigSchema = z.object({
  role: z.enum(["researcher", "product_manager", "developer", "content_writer", "designer", "presales_consultant", "custom"]),
  customRole: z.string().optional(),
  context: z.string().max(50000),
  task: z.string().max(50000),
  inputData: z.string().max(50000),
  constraints: z.string().max(50000),
  examples: z.string().max(50000),
  optional: z.string().max(50000),
  audience: z.string().max(50000),
  aiProvider: z.enum(["openai", "gemini", "claude", "grok"]),
  aiModel: z.string(),
  title: z.string().max(100).optional(),
});

export type ChatConfig = z.infer<typeof chatConfigSchema>;

export const projectConfigSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(5000).optional(),
  role: z.enum(["researcher", "product_manager", "developer", "content_writer", "designer", "presales_consultant", "custom"]).optional(),
  customRole: z.string().optional(),
  context: z.string().max(50000).optional(),
  constraints: z.string().max(50000).optional(),
  audience: z.string().max(50000).optional(),
  examples: z.string().max(50000).optional(),
  optional: z.string().max(50000).optional(),
  aiProvider: z.string().optional(),
  aiModel: z.string().optional(),
  localFolderPath: z.string().optional(),
});

export type ProjectConfig = z.infer<typeof projectConfigSchema>;
