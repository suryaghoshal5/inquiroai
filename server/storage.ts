import {
  users,
  chats,
  messages,
  apiKeys,
  rolePrompts,
  type User,
  type UpsertUser,
  type Chat,
  type InsertChat,
  type Message,
  type InsertMessage,
  type ApiKey,
  type InsertApiKey,
  type RolePrompt,
  type InsertRolePrompt,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and } from "drizzle-orm";

export interface IStorage {
  // User operations (required for Replit Auth)
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  updateUser(id: string, updates: Partial<User>): Promise<User>;

  // Chat operations
  createChat(chat: InsertChat): Promise<Chat>;
  getUserChats(userId: string): Promise<Chat[]>;
  getChat(id: number): Promise<Chat | undefined>;
  updateChat(id: number, updates: Partial<Chat>): Promise<Chat>;
  deleteChat(id: number): Promise<void>;

  // Message operations
  createMessage(message: InsertMessage): Promise<Message>;
  getChatMessages(chatId: number): Promise<Message[]>;
  getLastMessage(chatId: number): Promise<Message | undefined>;

  // API Key operations
  createApiKey(apiKey: InsertApiKey): Promise<ApiKey>;
  getUserApiKeys(userId: string): Promise<ApiKey[]>;
  getApiKey(userId: string, provider: string): Promise<ApiKey | undefined>;
  updateApiKey(id: number, updates: Partial<ApiKey>): Promise<ApiKey>;
  deleteApiKey(id: number): Promise<void>;

  // Role prompt operations
  getRolePrompts(): Promise<RolePrompt[]>;
  getRolePrompt(role: string): Promise<RolePrompt | undefined>;
  createRolePrompt(prompt: InsertRolePrompt): Promise<RolePrompt>;
  updateRolePrompt(role: string, updates: Partial<RolePrompt>): Promise<RolePrompt>;
}

export class DatabaseStorage implements IStorage {
  // User operations
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async updateUser(id: string, updates: Partial<User>): Promise<User> {
    const [updated] = await db
      .update(users)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return updated;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          ...userData,
          updatedAt: new Date(),
        },
      })
      .returning();
    return user;
  }

  // Chat operations
  async createChat(chat: InsertChat): Promise<Chat> {
    const [newChat] = await db.insert(chats).values(chat).returning();
    return newChat;
  }

  async getUserChats(userId: string): Promise<Chat[]> {
    return await db
      .select()
      .from(chats)
      .where(eq(chats.userId, userId))
      .orderBy(desc(chats.updatedAt));
  }

  async getChat(id: number): Promise<Chat | undefined> {
    const [chat] = await db.select().from(chats).where(eq(chats.id, id));
    return chat;
  }

  async updateChat(id: number, updates: Partial<Chat>): Promise<Chat> {
    const [updatedChat] = await db
      .update(chats)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(chats.id, id))
      .returning();
    return updatedChat;
  }

  async deleteChat(id: number): Promise<void> {
    await db.delete(chats).where(eq(chats.id, id));
  }

  // Message operations
  async createMessage(message: InsertMessage): Promise<Message> {
    const [newMessage] = await db.insert(messages).values(message).returning();
    return newMessage;
  }

  async getChatMessages(chatId: number): Promise<Message[]> {
    return await db
      .select()
      .from(messages)
      .where(eq(messages.chatId, chatId))
      .orderBy(messages.createdAt);
  }

  async getLastMessage(chatId: number): Promise<Message | undefined> {
    const [message] = await db
      .select()
      .from(messages)
      .where(eq(messages.chatId, chatId))
      .orderBy(desc(messages.createdAt))
      .limit(1);
    return message;
  }

  // API Key operations
  async createApiKey(apiKey: InsertApiKey): Promise<ApiKey> {
    const [newKey] = await db.insert(apiKeys).values(apiKey).returning();
    return newKey;
  }

  async getUserApiKeys(userId: string): Promise<ApiKey[]> {
    return await db
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.userId, userId))
      .orderBy(apiKeys.createdAt);
  }

  async getApiKey(userId: string, provider: string): Promise<ApiKey | undefined> {
    const [key] = await db
      .select()
      .from(apiKeys)
      .where(and(eq(apiKeys.userId, userId), eq(apiKeys.provider, provider)));
    return key;
  }

  async updateApiKey(id: number, updates: Partial<ApiKey>): Promise<ApiKey> {
    const [updatedKey] = await db
      .update(apiKeys)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(apiKeys.id, id))
      .returning();
    return updatedKey;
  }

  async deleteApiKey(id: number): Promise<void> {
    await db.delete(apiKeys).where(eq(apiKeys.id, id));
  }

  // Role prompt operations
  async getRolePrompts(): Promise<RolePrompt[]> {
    return await db.select().from(rolePrompts).orderBy(rolePrompts.role);
  }

  async getRolePrompt(role: string): Promise<RolePrompt | undefined> {
    const [prompt] = await db
      .select()
      .from(rolePrompts)
      .where(eq(rolePrompts.role, role));
    return prompt;
  }

  async createRolePrompt(prompt: InsertRolePrompt): Promise<RolePrompt> {
    const [newPrompt] = await db.insert(rolePrompts).values(prompt).returning();
    return newPrompt;
  }

  async updateRolePrompt(role: string, updates: Partial<RolePrompt>): Promise<RolePrompt> {
    const [updatedPrompt] = await db
      .update(rolePrompts)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(rolePrompts.role, role))
      .returning();
    return updatedPrompt;
  }
}

export const storage = new DatabaseStorage();
