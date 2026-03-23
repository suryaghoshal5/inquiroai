export interface User {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  profileImageUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Chat {
  id: number;
  userId: string;
  projectId?: number | null;
  title: string;
  role: string;
  customRole?: string | null;
  context?: string | null;
  task?: string | null;
  inputData?: string | null;
  constraints?: string | null;
  examples?: string | null;
  optional?: string | null;
  audience?: string | null;
  aiProvider: string;
  aiModel: string;
  configuration?: any;
  compressionCount?: number | null;
  totalTokensUsed?: number | null;
  totalCostUsd?: number | null;
  notionPageId?: string | null;
  archivedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
  lastMessage?: string | null;
  lastMessageTime?: Date | null;
}

export interface Message {
  id: number;
  chatId: number;
  role: "user" | "assistant" | "system";
  content: string;
  metadata?: any;
  createdAt: Date;
}

export interface ApiKey {
  id: number;
  userId: string;
  provider: string;
  keyPreview?: string | null;
  isValid: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface AIProvider {
  name: string;
  models: string[];
  defaultModel: string;
}

export interface ChatConfig {
  role: "researcher" | "product_manager" | "developer" | "content_writer" | "designer" | "presales_consultant" | "custom";
  customRole?: string;
  context: string;
  task: string;
  inputData: string;
  constraints: string;
  examples: string;
  optional: string;
  audience: string;
  aiProvider: string;
  aiModel: string;
  title?: string;
}

export interface Project {
  id: number;
  userId: string;
  name: string;
  description?: string | null;
  role?: string | null;
  customRole?: string | null;
  context?: string | null;
  constraints?: string | null;
  audience?: string | null;
  examples?: string | null;
  optional?: string | null;
  aiProvider?: string | null;
  aiModel?: string | null;
  localFolderPath?: string | null;
  configuration?: unknown;
  isArchived: boolean;
  createdAt: Date;
  updatedAt: Date;
  chats?: Chat[];
}

export interface ProjectFile {
  name: string;
  relativePath: string;
  size: number;
  extension: string;
  modifiedAt: string;
}

export interface RoleOption {
  value: string;
  label: string;
  description: string;
  icon: string;
  gradient: string;
}
