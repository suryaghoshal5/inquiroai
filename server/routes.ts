import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, isAuthenticated } from "./replitAuth";
import { AIOrchestrator, AI_PROVIDERS } from "./services/aiOrchestrator";
import { PromptService } from "./services/promptService";
import { FileProcessor } from "./services/fileProcessor";
import { CryptoService } from "./services/cryptoService";
import { chatConfigSchema, insertMessageSchema, insertApiKeySchema } from "@shared/schema";
import { z } from "zod";

export async function registerRoutes(app: Express): Promise<Server> {
  // In development mode, bypass authentication and use mock user
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  if (!isDevelopment) {
    // Auth middleware for production
    await setupAuth(app);
  }

  // Initialize default role prompts
  await PromptService.initializeDefaultPrompts();

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

  // Chat routes
  app.post('/api/chats', mockAuth, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const config = chatConfigSchema.parse(req.body);
      
      const systemPrompt = await PromptService.generatePrompt(config);
      const universalInstructions = PromptService.getUniversalInstructions();
      const fullPrompt = `${systemPrompt}\n\n${universalInstructions}`;
      
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
        configuration: { systemPrompt: fullPrompt }
      });

      // Send the structured prompt to AI and get initial response
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
        // Save the AI's initial response
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
      
      res.json(chat);
    } catch (error) {
      console.error("Error creating chat:", error);
      res.status(400).json({ message: "Failed to create chat" });
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
    try {
      const userId = req.user.claims.sub;
      const chatId = parseInt(req.params.id);
      const { content } = req.body;
      
      if (!content || typeof content !== 'string') {
        return res.status(400).json({ message: "Message content is required" });
      }
      
      const chat = await storage.getChat(chatId);
      if (!chat || chat.userId !== userId) {
        return res.status(404).json({ message: "Chat not found" });
      }
      
      // Save user message
      await storage.createMessage({
        chatId,
        role: "user",
        content
      });
      
      // Get chat history for context
      const messages = await storage.getChatMessages(chatId);
      const context = messages.slice(-10).map(msg => msg.content); // Last 10 messages
      
      // Generate system prompt from chat configuration
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
        aiModel: chat.aiModel,
        title: chat.title
      };
      
      const systemPrompt = await PromptService.generatePrompt(chatConfig);
      const aiResponse = await AIOrchestrator.generateResponse(
        userId,
        chat.aiProvider,
        chat.aiModel,
        systemPrompt,
        context
      );
      
      // Save AI response
      const aiMessage = await storage.createMessage({
        chatId,
        role: "assistant",
        content: aiResponse,
        metadata: { provider: chat.aiProvider, model: chat.aiModel }
      });
      
      // Update chat timestamp
      await storage.updateChat(chatId, { updatedAt: new Date() });
      
      res.json(aiMessage);
    } catch (error) {
      console.error("Error sending message:", error);
      res.status(500).json({ message: "Failed to send message" });
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
        return res.status(400).json({ message: "Invalid API key" });
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

  // Create HTTP server
  const httpServer = createServer(app);

  return httpServer;
}
