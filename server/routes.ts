import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, isAuthenticated } from "./replitAuth";
import { AIOrchestrator, AI_PROVIDERS } from "./services/aiOrchestrator";
import { PromptService } from "./services/promptService";
import { FileProcessor } from "./services/fileProcessor";
import { CryptoService } from "./services/cryptoService";
import { chatConfigSchema, insertMessageSchema, insertApiKeySchema, promptIntelligence, projects, chats, messages as messagesTable, projectConfigSchema } from "@shared/schema";
import { evaluatePrompt } from "./promptEvaluator";
import { recommendModel } from "./modelRouter";
import { manageContext, estimateMessagesTokens, estimateTokens } from "./contextManager";
import { classifyAndArchiveChat } from "./notionMemory";
import { extractEntities } from "./obsidianGraph";
import { writeEntitiesToVault } from "./obsidianWriter";
import { db } from "./db";
import { eq, and, desc, ilike, inArray, or } from "drizzle-orm";
import { z } from "zod";
import fs from "fs/promises";
import path from "path";
import {
  MAX_FILES_RETURNED,
  MAX_FOLDER_DEPTH,
  ALLOWED_EXTENSIONS,
} from "./config";

export async function registerRoutes(app: Express): Promise<Server> {
  // In development mode, bypass authentication and use mock user
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  if (!isDevelopment) {
    // Auth middleware for production
    await setupAuth(app);
  }

  // Initialize default role prompts (non-fatal if DB is temporarily unavailable)
  try {
    await PromptService.initializeDefaultPrompts();
  } catch (err) {
    console.warn("Could not initialize default prompts (DB may be unavailable):", err);
  }

  // Create mock user for development
  if (isDevelopment) {
    try {
      await storage.upsertUser({
        id: "dev-user",
        email: "dev@inquiroai.com",
        firstName: "Development",
        lastName: "User",
        profileImageUrl: null,
      });
    } catch (error) {
      console.error("Error creating mock user:", error);
    }
  }

  // Mock authentication middleware for development
  const mockAuth = (req: any, res: any, next: any) => {
    if (isDevelopment) {
      req.user = { claims: { sub: "dev-user" } };
      req.isAuthenticated = () => true;
      next();
    } else {
      isAuthenticated(req, res, next);
    }
  };

  // Auth routes
  app.get('/api/auth/user', mockAuth, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // Initialize prompts endpoint
  app.post('/api/initialize-prompts', async (req: any, res) => {
    try {
      await PromptService.initializeDefaultPrompts();
      res.json({ message: "Prompts initialized successfully" });
    } catch (error) {
      console.error("Error initializing prompts:", error);
      res.status(500).json({ message: "Failed to initialize prompts" });
    }
  });

  // Chat routes
  app.post('/api/chats', mockAuth, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const config = chatConfigSchema.parse(req.body);
      
      const systemPrompt = await PromptService.generatePrompt(config);
      const universalInstructions = PromptService.getUniversalInstructions();
      const fullPrompt = `${systemPrompt}\n\n${universalInstructions}`;
      
      // Validate projectId belongs to this user if provided
      if (config.projectId) {
        const project = await db.select().from(projects)
          .where(and(eq(projects.id, config.projectId), eq(projects.userId, userId)));
        if (!project.length) {
          res.status(403).json({ message: "Project not found or access denied" });
          return;
        }
      }

      const chat = await storage.createChat({
        userId,
        title: config.title || `${config.role.charAt(0).toUpperCase() + config.role.slice(1).replace('_', ' ')} Chat`,
        role: config.role,
        customRole: config.customRole,
        context: config.context,
        task: config.task,
        inputData: config.inputData,
        constraints: config.constraints,
        examples: config.examples,
        optional: config.optional,
        audience: config.audience,
        aiProvider: config.aiProvider,
        aiModel: config.aiModel,
        projectId: config.projectId ?? null,
        configuration: { systemPrompt: fullPrompt }
      });

      // Try to generate initial AI response, but don't fail chat creation if it fails
      try {
        console.log("Generating initial AI response for chat", chat.id);
        const aiResponse = await AIOrchestrator.generateResponse(
          userId,
          config.aiProvider,
          config.aiModel,
          fullPrompt,
          []
        );

        console.log("AI response generated successfully, saving to database");
        await storage.createMessage({
          chatId: chat.id,
          role: "assistant",
          content: aiResponse,
          metadata: { provider: config.aiProvider, model: config.aiModel }
        });
        console.log("Initial AI response saved successfully");
      } catch (error) {
        console.error("Error generating initial AI response:", error);
        // Continue without initial response - user can still chat
      }
      
      // Return a more concise response for the frontend
      res.json({
        id: chat.id,
        userId: chat.userId,
        title: chat.title,
        role: chat.role,
        customRole: chat.customRole,
        context: chat.context,
        task: chat.task,
        inputData: chat.inputData,
        constraints: chat.constraints,
        examples: chat.examples,
        optional: chat.optional,
        audience: chat.audience,
        aiProvider: chat.aiProvider,
        aiModel: chat.aiModel,
        createdAt: chat.createdAt,
        updatedAt: chat.updatedAt
      });
    } catch (error) {
      console.error("Error creating chat:", error);
      res.status(500).json({ message: "Failed to create chat. Please try again." });
    }
  });

  app.get('/api/chats', mockAuth, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const chats = await storage.getUserChats(userId);
      
      // Include last message for each chat
      const chatsWithLastMessage = await Promise.all(
        chats.map(async (chat) => {
          const lastMessage = await storage.getLastMessage(chat.id);
          return {
            ...chat,
            lastMessage: lastMessage?.content || null,
            lastMessageTime: lastMessage?.createdAt || null
          };
        })
      );
      
      res.json(chatsWithLastMessage);
    } catch (error) {
      console.error("Error fetching chats:", error);
      res.status(500).json({ message: "Failed to fetch chats" });
    }
  });

  app.get('/api/chats/:id', mockAuth, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const chatId = parseInt(req.params.id);
      
      const chat = await storage.getChat(chatId);
      if (!chat || chat.userId !== userId) {
        return res.status(404).json({ message: "Chat not found" });
      }
      
      const messages = await storage.getChatMessages(chatId);
      res.json({ chat, messages });
    } catch (error) {
      console.error("Error fetching chat:", error);
      res.status(500).json({ message: "Failed to fetch chat" });
    }
  });

  app.post('/api/chats/:id/messages', mockAuth, async (req: any, res) => {
    const userId = req.user.claims.sub;
    const chatId = parseInt(req.params.id);
    const { content, modelOverride } = req.body;

    // --- Validation (before SSE headers are set, so errors can still be JSON) ---
    if (!content || typeof content !== 'string') {
      return res.status(400).json({ message: "Message content is required" });
    }

    const chat = await storage.getChat(chatId);
    if (!chat || chat.userId !== userId) {
      return res.status(404).json({ message: "Chat not found" });
    }

    // --- Layer 2: Prompt Intelligence Pipeline (runs before stream starts) ---
    let userMessage: any;
    let evaluation: any;
    try {
      [userMessage, evaluation] = await Promise.all([
        storage.createMessage({ chatId, role: "user", content }),
        evaluatePrompt(content),
      ]);
    } catch (error: any) {
      console.error("Error in pre-stream setup:", error);
      return res.status(500).json({ message: "Failed to process message", error: error.message });
    }

    const recommendation = recommendModel(evaluation.prompt_type, evaluation.complexity);
    const modelToUse = modelOverride || recommendation.model;
    console.log(`Prompt score: ${evaluation.score}, recommended: ${recommendation.model}, using: ${modelToUse}`);

    // --- Layer 3: Context Manager (runs before stream starts) ---
    let contextResult: any;
    let systemPrompt: string;
    try {
      const chatMessages = await storage.getChatMessages(chatId);
      const chatConfig = {
        role: chat.role as "custom" | "researcher" | "product_manager" | "developer" | "content_writer" | "designer",
        customRole: chat.customRole || undefined,
        context: chat.context || "",
        task: chat.task || "",
        inputData: chat.inputData || "",
        constraints: chat.constraints || "",
        examples: chat.examples || "",
        optional: chat.optional || "",
        audience: chat.audience || "",
        aiProvider: chat.aiProvider as "openai" | "gemini" | "claude" | "grok",
        aiModel: modelToUse,
        title: chat.title,
      };
      systemPrompt = await PromptService.generatePrompt(chatConfig);

      const rawMessages = chatMessages.map(m => ({
        role: m.role as 'user' | 'assistant' | 'system',
        content: m.content,
      }));
      contextResult = await manageContext(rawMessages, modelToUse, systemPrompt, chat.compressionCount ?? 0);
      console.log(`Context: ${contextResult.current_tokens}/${contextResult.limit_tokens} tokens, compressed: ${contextResult.was_compressed}`);
    } catch (error: any) {
      console.error("Error in context setup:", error);
      return res.status(500).json({ message: "Failed to build context", error: error.message });
    }

    const context = contextResult.messages.map((m: any) => m.content);

    // --- Switch to SSE mode — no more res.json() from here on ---
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const sendEvent = (payload: object) => {
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    };

    // Send metadata first so the frontend can update banner/model chip immediately
    sendEvent({
      type: 'metadata',
      evaluation: {
        score: evaluation.score,
        issues: evaluation.issues,
        improved_prompt: evaluation.improved_prompt,
        prompt_type: evaluation.prompt_type,
        complexity: evaluation.complexity,
        show_suggestion: evaluation.show_suggestion,
      },
      recommendation: {
        model: recommendation.model,
        display_name: recommendation.display_name,
        reasoning: recommendation.reasoning,
        estimated_cost_per_1k_tokens: recommendation.estimated_cost_per_1k_tokens,
      },
      context_status: {
        current_tokens: contextResult.current_tokens,
        limit_tokens: contextResult.limit_tokens,
        compression_count: contextResult.compression_count,
        was_compressed: contextResult.was_compressed,
      },
    });

    // --- Stream AI response ---
    try {
      let fullContent = '';
      const streamResult = await AIOrchestrator.streamResponse(
        userId,
        chat.aiProvider,
        modelToUse,
        systemPrompt!,
        context,
        (token: string) => {
          sendEvent({ type: 'token', token });
        }
      );
      fullContent = streamResult.content;

      // Save assistant message
      const aiMessage = await storage.createMessage({
        chatId,
        role: "assistant",
        content: fullContent,
        metadata: { provider: chat.aiProvider, model: modelToUse },
      });

      // Update chat: timestamp + compression count + token usage
      const tokenDelta = estimateTokens(content) + estimateTokens(fullContent);
      await storage.updateChat(chatId, {
        updatedAt: new Date(),
        compressionCount: contextResult.compression_count,
        totalTokensUsed: (chat.totalTokensUsed ?? 0) + tokenDelta,
      });

      sendEvent({ type: 'done', messageId: aiMessage.id });
      res.end();

      // Persist prompt intelligence record (fire-and-forget)
      db.insert(promptIntelligence).values({
        messageId: userMessage.id,
        chatId,
        userId,
        originalPrompt: content,
        improvedPrompt: evaluation.improved_prompt,
        promptType: evaluation.prompt_type,
        complexity: evaluation.complexity,
        score: evaluation.score,
        modelRecommended: recommendation.model,
        modelUsed: modelToUse,
        userAcceptedSuggestion: modelOverride ? true : null,
      }).catch((err: any) => console.warn('Failed to save prompt intelligence record:', err));

    } catch (error: any) {
      console.error("Error during AI stream:", error);
      sendEvent({ type: 'error', error: error.message || 'Stream failed' });
      res.end();
    }
  });

  app.delete('/api/chats/:id', mockAuth, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const chatId = parseInt(req.params.id);
      
      const chat = await storage.getChat(chatId);
      if (!chat || chat.userId !== userId) {
        return res.status(404).json({ message: "Chat not found" });
      }
      
      await storage.deleteChat(chatId);
      res.json({ message: "Chat deleted successfully" });
    } catch (error) {
      console.error("Error deleting chat:", error);
      res.status(500).json({ message: "Failed to delete chat" });
    }
  });

  // PATCH /api/chats/reorder — bulk update sortOrder for a list of chats (must be before /:id)
  app.patch('/api/chats/reorder', mockAuth, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const schema = z.array(z.object({ id: z.number().int().positive(), sortOrder: z.number().int() }));
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid data" });

      // Update each chat's sortOrder — enforce userId to prevent cross-user tampering
      await Promise.all(parsed.data.map(({ id, sortOrder }) =>
        db.update(chats).set({ sortOrder }).where(and(eq(chats.id, id), eq(chats.userId, userId)))
      ));
      res.json({ message: "Order saved" });
    } catch (error) {
      console.error("Error reordering chats:", error);
      res.status(500).json({ message: "Failed to reorder chats" });
    }
  });

  // PATCH /api/chats/:id — update chat metadata (e.g. link/unlink project)
  app.patch('/api/chats/:id', mockAuth, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const chatId = parseInt(req.params.id);

      const chat = await storage.getChat(chatId);
      if (!chat || chat.userId !== userId) {
        return res.status(404).json({ message: "Chat not found" });
      }

      const allowedFields = ['projectId', 'title', 'sortOrder', 'role', 'customRole'] as const;
      const updates: Record<string, unknown> = {};
      for (const field of allowedFields) {
        if (field in req.body) updates[field] = req.body[field];
      }

      // Validate projectId if provided — must belong to same user or be null
      if ('projectId' in updates && updates.projectId !== null) {
        const [proj] = await db.select().from(projects)
          .where(and(eq(projects.id, updates.projectId as number), eq(projects.userId, userId)));
        if (!proj) return res.status(400).json({ message: "Project not found or not yours" });
      }

      const [updated] = await db.update(chats)
        .set({ ...updates, updatedAt: new Date() })
        .where(and(eq(chats.id, chatId), eq(chats.userId, userId)))
        .returning();

      res.json(updated);
    } catch (error) {
      console.error("Error updating chat:", error);
      res.status(500).json({ message: "Failed to update chat" });
    }
  });

  // API Key routes
  app.get('/api/api-keys', mockAuth, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const apiKeys = await storage.getUserApiKeys(userId);
      
      // Don't send encrypted keys to client
      const safeKeys = apiKeys.map(key => ({
        ...key,
        encryptedKey: undefined
      }));
      
      res.json(safeKeys);
    } catch (error) {
      console.error("Error fetching API keys:", error);
      res.status(500).json({ message: "Failed to fetch API keys" });
    }
  });

  app.post('/api/api-keys', mockAuth, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { provider, apiKey } = req.body;
      
      if (!provider || !apiKey) {
        return res.status(400).json({ message: "Provider and API key are required" });
      }
      
      // Validate API key
      const isValid = await AIOrchestrator.validateApiKey(provider, apiKey);
      if (!isValid) {
        const errorMessage = provider === "grok" 
          ? "Invalid Grok API key. Please check your API key from https://console.x.ai/ and ensure it's correctly formatted."
          : "Invalid API key";
        return res.status(400).json({ message: errorMessage });
      }
      
      // Check if key already exists for this provider
      const existingKey = await storage.getApiKey(userId, provider);
      if (existingKey) {
        return res.status(400).json({ message: "API key already exists for this provider" });
      }
      
      // Encrypt and store key
      const encryptedKey = CryptoService.encrypt(apiKey);
      const keyPreview = CryptoService.generateKeyPreview(apiKey);
      
      const newKey = await storage.createApiKey({
        userId,
        provider,
        encryptedKey,
        keyPreview,
        isValid: true
      });
      
      res.json({
        ...newKey,
        encryptedKey: undefined
      });
    } catch (error) {
      console.error("Error creating API key:", error);
      res.status(500).json({ message: "Failed to create API key" });
    }
  });

  app.delete('/api/api-keys/:id', mockAuth, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const keyId = parseInt(req.params.id);
      
      // Verify ownership
      const apiKeys = await storage.getUserApiKeys(userId);
      const keyToDelete = apiKeys.find(key => key.id === keyId);
      
      if (!keyToDelete) {
        return res.status(404).json({ message: "API key not found" });
      }
      
      await storage.deleteApiKey(keyId);
      res.json({ message: "API key deleted successfully" });
    } catch (error) {
      console.error("Error deleting API key:", error);
      res.status(500).json({ message: "Failed to delete API key" });
    }
  });

  // AI Providers route
  app.get('/api/ai-providers', async (req, res) => {
    try {
      const providers = await AIOrchestrator.getAvailableProviders();
      res.json(providers);
    } catch (error) {
      console.error("Error fetching AI providers:", error);
      res.status(500).json({ message: "Failed to fetch AI providers" });
    }
  });

  // AI Providers refresh route
  app.post('/api/ai-providers/refresh', async (req, res) => {
    try {
      const providers = await AIOrchestrator.refreshProviders();
      res.json(providers);
    } catch (error) {
      console.error("Error refreshing AI providers:", error);
      res.status(500).json({ message: "Failed to refresh AI providers" });
    }
  });

  // File upload route
  app.post('/api/upload', mockAuth, FileProcessor.getUploadMiddleware(), async (req: any, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }
      
      const content = await FileProcessor.processFile(req.file.path, req.file.originalname);
      res.json({ content, filename: req.file.originalname });
    } catch (error) {
      console.error("Error processing file:", error);
      res.status(500).json({ message: "Failed to process file" });
    }
  });

  // Role prompts route
  app.get('/api/role-prompts', async (req, res) => {
    try {
      const prompts = await storage.getRolePrompts();
      res.json(prompts);
    } catch (error) {
      console.error("Error fetching role prompts:", error);
      res.status(500).json({ message: "Failed to fetch role prompts" });
    }
  });

  // ─── Layer 0: Project routes ──────────────────────────────────────────────

  // POST /api/projects — create project
  app.post('/api/projects', mockAuth, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      // Strip surrounding shell quotes from localFolderPath before validation
      if (req.body.localFolderPath) {
        req.body.localFolderPath = req.body.localFolderPath.trim().replace(/^(['"])(.*)\1$/, "$2").trim();
      }

      const parsed = projectConfigSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid project data", errors: parsed.error.errors });

      const { localFolderPath } = parsed.data;
      if (localFolderPath) {
        try {
          await fs.access(localFolderPath, fs.constants.R_OK);
        } catch {
          return res.status(400).json({ message: `Local folder path is not accessible: "${localFolderPath}". Ensure the path exists and is readable.` });
        }
      }

      const [project] = await db.insert(projects).values({ ...parsed.data, userId }).returning();
      res.status(201).json(project);
    } catch (error) {
      console.error("Error creating project:", error);
      res.status(500).json({ message: "Failed to create project" });
    }
  });

  // GET /api/projects — list user projects (with chat counts)
  app.get('/api/projects', mockAuth, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const userProjects = await db.select().from(projects)
        .where(and(eq(projects.userId, userId), eq(projects.isArchived, false)))
        .orderBy(desc(projects.updatedAt));

      // Attach chats for each project
      const projectsWithChats = await Promise.all(userProjects.map(async (proj) => {
        const projectChats = await db.select().from(chats)
          .where(eq(chats.projectId, proj.id))
          .orderBy(desc(chats.updatedAt));
        return { ...proj, chats: projectChats };
      }));

      res.json(projectsWithChats);
    } catch (error) {
      console.error("Error fetching projects:", error);
      res.status(500).json({ message: "Failed to fetch projects" });
    }
  });

  // GET /api/projects/:id — get single project with chats
  app.get('/api/projects/:id', mockAuth, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const projectId = parseInt(req.params.id);
      const [project] = await db.select().from(projects)
        .where(and(eq(projects.id, projectId), eq(projects.userId, userId)));
      if (!project) return res.status(404).json({ message: "Project not found" });

      const projectChats = await db.select().from(chats)
        .where(eq(chats.projectId, projectId))
        .orderBy(desc(chats.updatedAt));

      res.json({ ...project, chats: projectChats });
    } catch (error) {
      console.error("Error fetching project:", error);
      res.status(500).json({ message: "Failed to fetch project" });
    }
  });

  // PATCH /api/projects/:id — update project
  app.patch('/api/projects/:id', mockAuth, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const projectId = parseInt(req.params.id);
      const [existing] = await db.select().from(projects)
        .where(and(eq(projects.id, projectId), eq(projects.userId, userId)));
      if (!existing) return res.status(404).json({ message: "Project not found" });

      // Strip surrounding shell quotes from localFolderPath before validation
      if (req.body.localFolderPath) {
        req.body.localFolderPath = req.body.localFolderPath.trim().replace(/^(['"])(.*)\1$/, "$2").trim();
      }

      const parsed = projectConfigSchema.partial().safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid data", errors: parsed.error.errors });

      const { localFolderPath } = parsed.data;
      if (localFolderPath) {
        try {
          await fs.access(localFolderPath, fs.constants.R_OK);
        } catch {
          return res.status(400).json({ message: `Local folder path is not accessible: "${localFolderPath}". Ensure the path exists and is readable.` });
        }
      }

      const [updated] = await db.update(projects)
        .set({ ...parsed.data, updatedAt: new Date() })
        .where(eq(projects.id, projectId))
        .returning();
      res.json(updated);
    } catch (error) {
      console.error("Error updating project:", error);
      res.status(500).json({ message: "Failed to update project" });
    }
  });

  // DELETE /api/projects/:id — soft delete (archive)
  app.delete('/api/projects/:id', mockAuth, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const projectId = parseInt(req.params.id);
      const [existing] = await db.select().from(projects)
        .where(and(eq(projects.id, projectId), eq(projects.userId, userId)));
      if (!existing) return res.status(404).json({ message: "Project not found" });

      await db.update(projects)
        .set({ isArchived: true, updatedAt: new Date() })
        .where(eq(projects.id, projectId));
      res.json({ message: "Project archived" });
    } catch (error) {
      console.error("Error archiving project:", error);
      res.status(500).json({ message: "Failed to archive project" });
    }
  });

  // POST /api/projects/:id/chats — create chat within project (inherits defaults)
  app.post('/api/projects/:id/chats', mockAuth, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const projectId = parseInt(req.params.id);
      const [project] = await db.select().from(projects)
        .where(and(eq(projects.id, projectId), eq(projects.userId, userId)));
      if (!project) return res.status(404).json({ message: "Project not found" });

      const overrides = req.body;
      const merged = {
        // C1: role is chat-specific only — never inherited from project
        role: overrides.role || 'researcher',
        customRole: overrides.customRole || null,
        context: overrides.context || project.context || '',
        constraints: overrides.constraints || project.constraints || '',
        audience: overrides.audience || project.audience || '',
        examples: overrides.examples || project.examples || '',
        optional: overrides.optional || project.optional || '',
        // C2: 'auto' sentinel or omitted → router picks model on first message
        aiProvider: overrides.aiProvider || project.aiProvider || 'openai',
        aiModel: overrides.aiModel || project.aiModel || 'openai/gpt-4o',
        title: overrides.title || 'New Chat',
        task: overrides.task || '',
        inputData: overrides.inputData || '',
      };

      const [chat] = await db.insert(chats).values({
        ...merged,
        userId,
        projectId,
      }).returning();
      res.status(201).json(chat);
    } catch (error) {
      console.error("Error creating project chat:", error);
      res.status(500).json({ message: "Failed to create chat" });
    }
  });

  // GET /api/projects/:id/files — list files in project's local folder
  async function walkDirectory(dirPath: string, maxDepth: number, currentDepth = 1): Promise<{ name: string; path: string; size: number; modifiedAt: string }[]> {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    const files: { name: string; path: string; size: number; modifiedAt: string }[] = [];
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isFile()) {
        try {
          const stat = await fs.stat(fullPath);
          files.push({ name: entry.name, path: fullPath, size: stat.size, modifiedAt: stat.mtime.toISOString() });
        } catch { /* skip unreadable files */ }
      } else if (entry.isDirectory() && currentDepth < maxDepth) {
        const subFiles = await walkDirectory(fullPath, maxDepth, currentDepth + 1);
        files.push(...subFiles);
      }
    }
    return files;
  }

  app.get('/api/projects/:id/files', mockAuth, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const projectId = parseInt(req.params.id);
      const [project] = await db.select().from(projects)
        .where(and(eq(projects.id, projectId), eq(projects.userId, userId)));
      if (!project) return res.status(404).json({ message: "Project not found" });
      if (!project.localFolderPath) return res.status(400).json({ message: "No local folder configured" });

      const recursive = req.query.recursive === 'true';
      const extFilter = req.query.extensions
        ? (req.query.extensions as string).split(',').map(e => e.startsWith('.') ? e : `.${e}`)
        : null;

      await fs.access(project.localFolderPath, fs.constants.R_OK);
      const rawFiles = await walkDirectory(project.localFolderPath, recursive ? MAX_FOLDER_DEPTH : 1);

      const filtered = rawFiles
        .filter(f => {
          const ext = path.extname(f.name).toLowerCase();
          if (extFilter) return extFilter.includes(ext);
          return ALLOWED_EXTENSIONS.has(ext);
        })
        .slice(0, MAX_FILES_RETURNED)
        .map(f => ({
          name: f.name,
          relativePath: path.relative(project.localFolderPath!, f.path),
          size: f.size,
          extension: path.extname(f.name).toLowerCase(),
          modifiedAt: f.modifiedAt,
        }));

      res.json(filtered);
    } catch (error: any) {
      if (error.code === 'ENOENT' || error.code === 'EACCES') {
        return res.status(400).json({ message: "Folder not accessible" });
      }
      console.error("Error listing project files:", error);
      res.status(500).json({ message: "Failed to list files" });
    }
  });

  // GET /api/projects/:id/files/* — read/extract a specific file
  app.get('/api/projects/:id/files/*', mockAuth, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const projectId = parseInt(req.params.id);
      const [project] = await db.select().from(projects)
        .where(and(eq(projects.id, projectId), eq(projects.userId, userId)));
      if (!project) return res.status(404).json({ message: "Project not found" });
      if (!project.localFolderPath) return res.status(400).json({ message: "No local folder configured" });

      const relativePath = req.params[0] as string;

      // Security: prevent path traversal
      const resolved = path.resolve(project.localFolderPath, relativePath);
      if (!resolved.startsWith(path.resolve(project.localFolderPath))) {
        return res.status(403).json({ message: "Path traversal detected" });
      }

      const stat = await fs.stat(resolved);
      if (stat.size > 10 * 1024 * 1024) {
        return res.status(400).json({ message: "File too large (max 10MB)" });
      }

      // Use existing FileProcessor for extraction (PDF, DOCX, XLSX)
      const ext = path.extname(resolved).toLowerCase();
      let content: string;

      if (['.pdf', '.docx', '.doc', '.xlsx', '.xls'].includes(ext)) {
        // FileProcessor expects a path and original filename
        content = await FileProcessor.processFile(resolved, path.basename(resolved));
      } else {
        content = await fs.readFile(resolved, 'utf-8');
      }

      res.json({
        content,
        fileName: path.basename(resolved),
        fileType: ext,
        size: stat.size,
      });
    } catch (error: any) {
      if (error.code === 'ENOENT') return res.status(404).json({ message: "File not found" });
      if (error.code === 'EACCES') return res.status(403).json({ message: "File not accessible" });
      console.error("Error reading project file:", error);
      res.status(500).json({ message: "Failed to read file" });
    }
  });

  // ─── End Layer 0 ──────────────────────────────────────────────────────────

  // ─── Layer 4: Archive to Notion Memory ────────────────────────────────────

  // POST /api/chats/:chatId/archive — classify + write to Notion
  app.post('/api/chats/:chatId/archive', mockAuth, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const chatId = parseInt(req.params.chatId);

      const chat = await storage.getChat(chatId);
      if (!chat || chat.userId !== userId) {
        return res.status(404).json({ message: "Chat not found" });
      }

      // Fetch all messages for classification
      const chatMessages = await storage.getChatMessages(chatId);
      if (chatMessages.length === 0) {
        return res.status(400).json({ message: "No messages to archive" });
      }

      const messages = chatMessages.map(m => ({
        role: m.role as 'user' | 'assistant' | 'system',
        content: m.content,
      }));

      // Resolve project name if chat belongs to a project
      let projectName: string | undefined;
      if (chat.projectId) {
        const [project] = await db.select().from(projects)
          .where(eq(projects.id, chat.projectId));
        projectName = project?.name;
      }

      const appUrl = process.env.APP_URL ?? 'http://localhost:5000';
      const chatUrl = `${appUrl}/chat/${chatId}`;

      const entry = await classifyAndArchiveChat(messages, {
        model: chat.aiModel,
        total_tokens: chat.totalTokensUsed ?? 0,
        cost_usd: chat.totalCostUsd ?? 0,
        chat_url: chatUrl,
        project_name: projectName,
      });

      // Update chat: mark as archived and store notion page reference
      await storage.updateChat(chatId, {
        archivedAt: new Date(),
      });

      // Chain: auto-extract to Obsidian graph if vault path is configured (fire-and-forget)
      const user = await storage.getUser(userId);
      const vaultPath = user?.obsidianVaultPath ?? process.env.OBSIDIAN_VAULT_PATH;
      if (vaultPath) {
        extractEntities(messages, entry.project).then(({ entities }) => {
          if (entities.length > 0) {
            writeEntitiesToVault(vaultPath, entities, chatId).catch(() => {});
          }
        }).catch(() => {});
      }

      res.json(entry);
    } catch (error: any) {
      console.error("Error archiving chat:", error);
      // Archive failure must not break the chat — return partial entry if possible
      res.status(500).json({ message: "Failed to archive chat", error: error.message });
    }
  });

  // ─── End Layer 4 ──────────────────────────────────────────────────────────

  // ─── Layer 5: Obsidian Knowledge Graph ────────────────────────────────────

  // POST /api/chats/:chatId/extract-graph — extract entities + write to Obsidian vault
  app.post('/api/chats/:chatId/extract-graph', mockAuth, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const chatId = parseInt(req.params.chatId);

      const chat = await storage.getChat(chatId);
      if (!chat || chat.userId !== userId) {
        return res.status(404).json({ message: "Chat not found" });
      }

      const chatMessages = await storage.getChatMessages(chatId);
      if (chatMessages.length === 0) {
        return res.status(400).json({ message: "No messages to extract" });
      }

      const messages = chatMessages.map(m => ({
        role: m.role as 'user' | 'assistant' | 'system',
        content: m.content,
      }));

      // Resolve project name
      let projectName: string | undefined;
      if (chat.projectId) {
        const [project] = await db.select().from(projects)
          .where(eq(projects.id, chat.projectId));
        projectName = project?.name;
      }

      const { entities } = await extractEntities(messages, projectName);

      if (entities.length === 0) {
        return res.json({ entities_created: 0, entities_updated: 0, entities });
      }

      // Determine vault path: user setting > env fallback
      const user = await storage.getUser(userId);
      const vaultPath = user?.obsidianVaultPath ?? process.env.OBSIDIAN_VAULT_PATH;

      let entities_created = 0;
      let entities_updated = 0;

      if (vaultPath) {
        const result = await writeEntitiesToVault(vaultPath, entities, chatId);
        entities_created = result.created;
        entities_updated = result.updated;
      }

      res.json({ entities_created, entities_updated, entities, vault_configured: !!vaultPath });
    } catch (error: any) {
      console.error("Error extracting graph:", error);
      res.status(500).json({ message: "Failed to extract graph", error: error.message });
    }
  });

  // ─── User Settings ─────────────────────────────────────────────────────────

  // GET /api/user/settings — get current user settings
  app.get('/api/user/settings', mockAuth, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      if (!user) return res.status(404).json({ message: "User not found" });
      res.json({ obsidianVaultPath: user.obsidianVaultPath ?? '' });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to get settings" });
    }
  });

  // PATCH /api/user/settings — update user settings (obsidian vault path, etc.)
  app.patch('/api/user/settings', mockAuth, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { obsidianVaultPath } = req.body as { obsidianVaultPath?: string };

      const updates: Partial<{ obsidianVaultPath: string | null }> = {};

      if (obsidianVaultPath !== undefined) {
        const cleaned = obsidianVaultPath.trim().replace(/^(['"])(.*)\1$/, "$2").trim();
        if (cleaned) {
          // Verify folder is accessible
          try {
            await fs.access(cleaned);
          } catch {
            return res.status(400).json({
              message: `Vault folder not accessible: ${cleaned}. Check the path and try again.`,
            });
          }
          updates.obsidianVaultPath = cleaned;
        } else {
          updates.obsidianVaultPath = null;
        }
      }

      const updated = await storage.updateUser(userId, updates as any);
      res.json({ obsidianVaultPath: updated.obsidianVaultPath ?? '' });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to update settings", error: error.message });
    }
  });

  // ─── End Layer 5 ──────────────────────────────────────────────────────────

  // ─── B9: Chat Search ───────────────────────────────────────────────────────

  // GET /api/search?q= — full-text search: chat titles + message content (ILIKE)
  app.get('/api/search', mockAuth, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const q = (req.query.q as string || '').trim();
      if (!q || q.length < 2) return res.json([]);

      const pattern = `%${q}%`;

      // 1. Title matches
      const titleMatches = await db
        .select({
          chatId: chats.id,
          chatTitle: chats.title,
          projectId: chats.projectId,
          projectName: projects.name,
          updatedAt: chats.updatedAt,
        })
        .from(chats)
        .leftJoin(projects, eq(chats.projectId, projects.id))
        .where(and(eq(chats.userId, userId), ilike(chats.title, pattern)))
        .limit(10);

      const titleChatIds = new Set(titleMatches.map(m => m.chatId));

      // 2. Message content matches — find chats not already matched by title
      const msgMatches = await db
        .select({ chatId: messagesTable.chatId, content: messagesTable.content })
        .from(messagesTable)
        .innerJoin(chats, eq(messagesTable.chatId, chats.id))
        .where(and(eq(chats.userId, userId), ilike(messagesTable.content, pattern)))
        .limit(50);

      // Deduplicate: one chat per content match, skip chats already in title matches
      const uniqueMsgChatIds: number[] = [];
      const snippetMap = new Map<number, string>();
      for (const m of msgMatches) {
        if (!titleChatIds.has(m.chatId) && !snippetMap.has(m.chatId)) {
          uniqueMsgChatIds.push(m.chatId);
          const lc = m.content.toLowerCase();
          const idx = lc.indexOf(q.toLowerCase());
          const start = Math.max(0, idx - 50);
          const end = Math.min(m.content.length, idx + q.length + 50);
          const snippet = (start > 0 ? '…' : '') + m.content.slice(start, end) + (end < m.content.length ? '…' : '');
          snippetMap.set(m.chatId, snippet);
        }
      }

      let msgResults: any[] = [];
      if (uniqueMsgChatIds.length > 0) {
        const chatDetails = await db
          .select({
            chatId: chats.id,
            chatTitle: chats.title,
            projectId: chats.projectId,
            projectName: projects.name,
            updatedAt: chats.updatedAt,
          })
          .from(chats)
          .leftJoin(projects, eq(chats.projectId, projects.id))
          .where(and(eq(chats.userId, userId), inArray(chats.id, uniqueMsgChatIds)));

        msgResults = chatDetails.map(c => ({
          chatId: c.chatId,
          chatTitle: c.chatTitle,
          projectId: c.projectId,
          projectName: c.projectName,
          matchType: 'message' as const,
          snippet: snippetMap.get(c.chatId) ?? '',
          updatedAt: c.updatedAt,
        }));
      }

      const titleResults = titleMatches.map(m => ({
        chatId: m.chatId,
        chatTitle: m.chatTitle,
        projectId: m.projectId,
        projectName: m.projectName,
        matchType: 'title' as const,
        snippet: m.chatTitle,
        updatedAt: m.updatedAt,
      }));

      res.json([...titleResults, ...msgResults].slice(0, 20));
    } catch (error) {
      console.error("Error searching:", error);
      res.status(500).json({ message: "Search failed" });
    }
  });

  // ─── End B9 ────────────────────────────────────────────────────────────────

  // Create HTTP server
  const httpServer = createServer(app);

  return httpServer;
}
