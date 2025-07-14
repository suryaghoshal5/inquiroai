import OpenAI from "openai";
import { GoogleGenAI } from "@google/genai";
import Anthropic from "@anthropic-ai/sdk";
import { storage } from "../storage";
import { CryptoService } from "./cryptoService";

export interface AIProvider {
  name: string;
  models: string[];
  defaultModel: string;
  lastUpdated?: Date;
}

export const AI_PROVIDERS: Record<string, AIProvider> = {
  openai: {
    name: "OpenAI",
    models: [
      "gpt-4.5", // Latest flagship model (July 2025)
      "gpt-4.1", // April 2025 release
      "gpt-4.1-mini", // Smaller version of GPT-4.1
      "o4-mini", // Optimized reasoning model
      "o3", // Latest reasoning model
      "o3-pro", // Professional reasoning model
      "gpt-4o", // Previous flagship
      "gpt-4o-mini", // Smaller version
      "gpt-4-turbo"
    ],
    defaultModel: "gpt-4.5"
  },
  gemini: {
    name: "Google Gemini",
    models: [
      "gemini-2.5-pro", // Latest flagship (March 2025)
      "gemini-2.0-pro", // Previous version
      "gemini-2.0-flash-exp", // Experimental version
      "gemini-1.5-pro", // Previous generation
      "gemini-1.5-flash" // Faster version
    ],
    defaultModel: "gemini-2.5-pro"
  },
  claude: {
    name: "Anthropic Claude",
    models: [
      "claude-4", // Latest flagship (May 2025)
      "claude-4-opus", // Most powerful Claude 4 variant
      "claude-4-sonnet", // Balanced Claude 4 variant
      "claude-3.7-sonnet", // Hybrid reasoning model (Feb 2025)
      "claude-3-5-sonnet-20241022", // Previous generation
      "claude-3-opus-20240229", // Most capable Claude 3
      "claude-3-haiku-20240307" // Fastest Claude 3
    ],
    defaultModel: "claude-4"
  },
  grok: {
    name: "Grok",
    models: [
      "grok-4", // Latest flagship (2025)
      "grok-4-heavy", // Most powerful variant
      "grok-3", // Previous generation (Feb 2025)
      "grok-3-think", // Reasoning mode
      "grok-beta", // Beta version
      "grok-vision-beta" // Vision capabilities
    ],
    defaultModel: "grok-4"
  }
};

// Dynamic model fetching functions
class ModelUpdater {
  private static async fetchOpenAIModels(): Promise<string[]> {
    try {
      // Try to fetch from OpenAI API if we have a valid API key
      const apiKey = process.env.OPENAI_API_KEY;
      if (apiKey) {
        const openai = new OpenAI({ apiKey });
        const models = await openai.models.list();
        // Filter for GPT models and sort by relevance
        const gptModels = models.data
          .filter(model => model.id.startsWith('gpt-') || model.id.startsWith('o3') || model.id.startsWith('o4'))
          .map(model => model.id)
          .sort((a, b) => {
            // Sort by model priority (newer first)
            const priority = ['gpt-4.5', 'gpt-4.1', 'o4-mini', 'o3', 'gpt-4o', 'gpt-4o-mini'];
            return priority.indexOf(a) - priority.indexOf(b);
          });
        
        if (gptModels.length > 0) {
          return gptModels;
        }
      }
    } catch (error) {
      console.log("Could not fetch OpenAI models dynamically, using static list");
    }
    
    // Fallback to static list if API call fails
    return [
      "gpt-4.5", "gpt-4.1", "gpt-4.1-mini", "o4-mini", "o3", "o3-pro", 
      "gpt-4o", "gpt-4o-mini", "gpt-4-turbo"
    ];
  }

  private static async fetchGeminiModels(): Promise<string[]> {
    // In a real implementation, this would fetch from Google's API
    return [
      "gemini-2.5-pro", "gemini-2.0-pro", "gemini-2.0-flash-exp", 
      "gemini-1.5-pro", "gemini-1.5-flash"
    ];
  }

  private static async fetchClaudeModels(): Promise<string[]> {
    // In a real implementation, this would fetch from Anthropic's API
    return [
      "claude-4", "claude-4-opus", "claude-4-sonnet", "claude-3.7-sonnet",
      "claude-3-5-sonnet-20241022", "claude-3-opus-20240229", "claude-3-haiku-20240307"
    ];
  }

  private static async fetchGrokModels(): Promise<string[]> {
    // In a real implementation, this would fetch from xAI's API
    return [
      "grok-4", "grok-4-heavy", "grok-3", "grok-3-think", 
      "grok-beta", "grok-vision-beta"
    ];
  }

  static async updateAllProviders(): Promise<Record<string, AIProvider>> {
    try {
      const [openaiModels, geminiModels, claudeModels, grokModels] = await Promise.all([
        this.fetchOpenAIModels(),
        this.fetchGeminiModels(),
        this.fetchClaudeModels(),
        this.fetchGrokModels()
      ]);

      const updatedProviders: Record<string, AIProvider> = {
        openai: {
          name: "OpenAI",
          models: openaiModels,
          defaultModel: "gpt-4.5",
          lastUpdated: new Date()
        },
        gemini: {
          name: "Google Gemini",
          models: geminiModels,
          defaultModel: "gemini-2.5-pro",
          lastUpdated: new Date()
        },
        claude: {
          name: "Anthropic Claude",
          models: claudeModels,
          defaultModel: "claude-4",
          lastUpdated: new Date()
        },
        grok: {
          name: "Grok",
          models: grokModels,
          defaultModel: "grok-4",
          lastUpdated: new Date()
        }
      };

      // Update the main AI_PROVIDERS object
      Object.assign(AI_PROVIDERS, updatedProviders);
      
      return updatedProviders;
    } catch (error) {
      console.error("Failed to update AI providers:", error);
      return AI_PROVIDERS;
    }
  }

  static async getLatestProviders(): Promise<Record<string, AIProvider>> {
    const lastUpdate = AI_PROVIDERS.openai.lastUpdated;
    const hoursSinceUpdate = lastUpdate ? 
      (Date.now() - lastUpdate.getTime()) / (1000 * 60 * 60) : 24;
    
    // Update models if more than 24 hours old or never updated
    if (hoursSinceUpdate > 24) {
      return await this.updateAllProviders();
    }
    
    return AI_PROVIDERS;
  }
}

export class AIOrchestrator {
  private static async getApiKey(userId: string, provider: string): Promise<string> {
    const apiKey = await storage.getApiKey(userId, provider);
    if (!apiKey) {
      throw new Error(`No API key found for provider: ${provider}`);
    }
    
    if (!apiKey.isValid) {
      throw new Error(`API key for ${provider} is invalid`);
    }
    
    try {
      return CryptoService.decrypt(apiKey.encryptedKey);
    } catch (error) {
      console.error(`Error decrypting API key for ${provider}:`, error);
      throw new Error(`Failed to decrypt API key for ${provider}`);
    }
  }

  private static async createOpenAIClient(userId: string): Promise<OpenAI> {
    const apiKey = await this.getApiKey(userId, "openai");
    return new OpenAI({ apiKey });
  }

  private static async createGeminiClient(userId: string): Promise<GoogleGenAI> {
    const apiKey = await this.getApiKey(userId, "gemini");
    return new GoogleGenAI({ apiKey });
  }

  private static async createClaudeClient(userId: string): Promise<Anthropic> {
    const apiKey = await this.getApiKey(userId, "claude");
    return new Anthropic({ apiKey });
  }

  private static async createGrokClient(userId: string): Promise<OpenAI> {
    const apiKey = await this.getApiKey(userId, "grok");
    return new OpenAI({ 
      baseURL: "https://api.x.ai/v1", 
      apiKey 
    });
  }

  static async generateResponse(
    userId: string,
    provider: string,
    model: string,
    prompt: string,
    context: string[] = []
  ): Promise<string> {
    try {
      console.log(`Generating response for ${provider} with model ${model}`);
      switch (provider) {
        case "openai":
          return await this.generateOpenAIResponse(userId, model, prompt, context);
        case "gemini":
          return await this.generateGeminiResponse(userId, model, prompt, context);
        case "claude":
          return await this.generateClaudeResponse(userId, model, prompt, context);
        case "grok":
          return await this.generateGrokResponse(userId, model, prompt, context);
        default:
          throw new Error(`Unsupported provider: ${provider}`);
      }
    } catch (error) {
      console.error(`AI generation error for ${provider}:`, error);
      console.error(`Error details:`, {
        message: error.message,
        stack: error.stack,
        name: error.name
      });
      throw error;
    }
  }

  private static async generateOpenAIResponse(
    userId: string,
    model: string,
    prompt: string,
    context: string[]
  ): Promise<string> {
    const client = await this.createOpenAIClient(userId);
    
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: "system", content: prompt },
      ...context.map((msg, idx) => ({
        role: (idx % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
        content: msg
      }))
    ];

    const response = await client.chat.completions.create({
      model,
      messages,
      max_tokens: 2000,
      temperature: 0.7,
    });

    return response.choices[0]?.message?.content || "No response generated";
  }

  private static async generateGeminiResponse(
    userId: string,
    model: string,
    prompt: string,
    context: string[]
  ): Promise<string> {
    const client = await this.createGeminiClient(userId);
    
    // Prepare the conversation history
    const contents = context.map((msg, idx) => ({
      role: idx % 2 === 0 ? "user" : "model",
      parts: [{ text: msg }]
    }));

    // Add the current prompt
    contents.push({
      role: "user",
      parts: [{ text: prompt }]
    });

    const result = await client.models.generateContent({
      model,
      contents
    });

    return result.text || "No response generated";
  }

  private static async generateClaudeResponse(
    userId: string,
    model: string,
    prompt: string,
    context: string[]
  ): Promise<string> {
    const client = await this.createClaudeClient(userId);
    
    const messages: Anthropic.MessageParam[] = [
      ...context.map((msg, idx) => ({
        role: (idx % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
        content: msg
      }))
    ];

    const response = await client.messages.create({
      model,
      max_tokens: 2000,
      system: prompt,
      messages,
    });

    return response.content[0]?.type === "text" ? response.content[0].text : "No response generated";
  }

  private static async generateGrokResponse(
    userId: string,
    model: string,
    prompt: string,
    context: string[]
  ): Promise<string> {
    const client = await this.createGrokClient(userId);
    
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: "system", content: prompt },
      ...context.map((msg, idx) => ({
        role: (idx % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
        content: msg
      }))
    ];

    const response = await client.chat.completions.create({
      model,
      messages,
      max_tokens: 2000,
      temperature: 0.7,
    });

    return response.choices[0]?.message?.content || "No response generated";
  }

  static getRecommendedModel(provider: string, task: string, role?: string): string {
    const taskKeywords = task.toLowerCase();
    
    // For researcher role, prioritize deep research models
    if (role === "researcher") {
      switch (provider) {
        case "openai":
          return "gpt-4o"; // Most capable OpenAI model for research
        case "gemini":
          return "gemini-1.5-pro"; // Best for analysis and research
        case "claude":
          return "claude-3-opus-20240229"; // Most capable Claude model for deep research
        case "grok":
          return "grok-4"; // Latest Grok model for research
        default:
          return AI_PROVIDERS[provider]?.defaultModel || "";
      }
    }
    
    // Original logic for other roles
    switch (provider) {
      case "openai":
        if (taskKeywords.includes("code") || taskKeywords.includes("programming")) {
          return "gpt-4o";
        }
        return "gpt-4o";
      case "gemini":
        if (taskKeywords.includes("analysis") || taskKeywords.includes("research")) {
          return "gemini-1.5-pro";
        }
        return "gemini-2.0-flash-exp";
      case "claude":
        return "claude-3-5-sonnet-20241022";
      case "grok":
        return "grok-beta";
      default:
        return AI_PROVIDERS[provider]?.defaultModel || "";
    }
  }

  static async getAvailableProviders(): Promise<Record<string, AIProvider>> {
    return await ModelUpdater.getLatestProviders();
  }

  static async refreshProviders(): Promise<Record<string, AIProvider>> {
    return await ModelUpdater.updateAllProviders();
  }

  static async validateApiKey(provider: string, apiKey: string): Promise<boolean> {
    try {
      switch (provider) {
        case "openai":
          const openai = new OpenAI({ apiKey });
          await openai.models.list();
          return true;
        case "gemini":
          const gemini = new GoogleGenAI({ apiKey });
          await gemini.models.generateContent({
            model: "gemini-1.5-flash",
            contents: [{ role: "user", parts: [{ text: "test" }] }]
          });
          return true;
        case "claude":
          const claude = new Anthropic({ apiKey });
          await claude.messages.create({
            model: "claude-3-haiku-20240307",
            max_tokens: 1,
            messages: [{ role: "user", content: "test" }]
          });
          return true;
        case "grok":
          const grok = new OpenAI({ baseURL: "https://api.x.ai/v1", apiKey });
          await grok.models.list();
          return true;
        default:
          return false;
      }
    } catch (error) {
      console.error(`API key validation failed for ${provider}:`, error);
      return false;
    }
  }
}
