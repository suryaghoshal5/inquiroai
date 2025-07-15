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
      "gpt-4o", // Latest flagship model
      "gpt-4o-mini", // Smaller version
      "gpt-4-turbo", // Previous flagship
      "gpt-4", // Standard GPT-4
      "gpt-3.5-turbo" // Lightweight option
    ],
    defaultModel: "gpt-4o"
  },
  gemini: {
    name: "Google Gemini",
    models: [
      "gemini-2.0-flash-exp", // Latest experimental version
      "gemini-1.5-pro", // Most capable production model
      "gemini-1.5-flash", // Faster version
      "gemini-1.5-flash-8b", // Lightweight version
      "gemini-1.0-pro" // Previous generation
    ],
    defaultModel: "gemini-2.0-flash-exp"
  },
  claude: {
    name: "Anthropic Claude",
    models: [
      "claude-3-5-sonnet-20241022", // Latest Claude 3.5 Sonnet
      "claude-3-opus-20240229", // Most capable Claude 3
      "claude-3-haiku-20240307", // Fastest Claude 3
      "claude-3-sonnet-20240229" // Balanced Claude 3
    ],
    defaultModel: "claude-3-5-sonnet-20241022"
  },
  grok: {
    name: "Grok",
    models: [
      "grok-beta", // Main Grok model
      "grok-vision-beta" // Vision capabilities
    ],
    defaultModel: "grok-beta"
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
      "gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-4", "gpt-3.5-turbo"
    ];
  }

  private static async fetchGeminiModels(): Promise<string[]> {
    // Return actual Gemini model names that exist in the API
    return [
      "gemini-2.0-flash-exp", "gemini-1.5-pro", "gemini-1.5-flash", 
      "gemini-1.5-flash-8b", "gemini-1.0-pro"
    ];
  }

  private static async fetchClaudeModels(): Promise<string[]> {
    // Return actual Claude model names that exist in the API
    return [
      "claude-3-5-sonnet-20241022", "claude-3-opus-20240229", 
      "claude-3-haiku-20240307", "claude-3-sonnet-20240229"
    ];
  }

  private static async fetchGrokModels(): Promise<string[]> {
    // Return actual Grok model names that exist in the API
    return [
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
          defaultModel: "gpt-4o",
          lastUpdated: new Date()
        },
        gemini: {
          name: "Google Gemini",
          models: geminiModels,
          defaultModel: "gemini-2.0-flash-exp",
          lastUpdated: new Date()
        },
        claude: {
          name: "Anthropic Claude",
          models: claudeModels,
          defaultModel: "claude-3-5-sonnet-20241022",
          lastUpdated: new Date()
        },
        grok: {
          name: "Grok",
          models: grokModels,
          defaultModel: "grok-beta",
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
    try {
      console.log(`Creating OpenAI client for user ${userId}`);
      const client = await this.createOpenAIClient(userId);
      
      console.log(`Preparing OpenAI messages for model: ${model}`);
      const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
        { role: "system", content: prompt },
        ...context.map((msg, idx) => ({
          role: (idx % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
          content: msg
        }))
      ];

      console.log(`Sending request to OpenAI API...`);
      const response = await client.chat.completions.create({
        model,
        messages,
        max_tokens: 2000,
        temperature: 0.7,
      });

      console.log(`OpenAI response received successfully`);
      return response.choices[0]?.message?.content || "No response generated";
    } catch (error) {
      console.error(`OpenAI API error:`, error);
      console.error(`Error details:`, {
        message: error.message,
        stack: error.stack,
        name: error.name,
        code: error.code
      });
      throw error;
    }
  }

  private static async generateGeminiResponse(
    userId: string,
    model: string,
    prompt: string,
    context: string[]
  ): Promise<string> {
    try {
      console.log(`Creating Gemini client for user ${userId}`);
      const client = await this.createGeminiClient(userId);
      
      console.log(`Getting generative model: ${model}`);
      // Get the generative model
      const generativeModel = client.getGenerativeModel({ model });
      
      console.log(`Preparing conversation history, context length: ${context.length}`);
      // Prepare the conversation history
      const history = context.map((msg, idx) => ({
        role: idx % 2 === 0 ? "user" : "model",
        parts: [{ text: msg }]
      }));

      console.log(`Sending request to Gemini API...`);
      
      // If we have history, start a chat session
      if (history.length > 0) {
        console.log(`Starting chat with history`);
        const chat = generativeModel.startChat({ history });
        const result = await chat.sendMessage(prompt);
        console.log(`Gemini chat response received`);
        return result.response.text() || "No response generated";
      } else {
        console.log(`Generating content directly (no history)`);
        const result = await generativeModel.generateContent(prompt);
        console.log(`Gemini direct response received`);
        return result.response.text() || "No response generated";
      }
    } catch (error) {
      console.error(`Gemini API error:`, error);
      console.error(`Error details:`, {
        message: error.message,
        stack: error.stack,
        name: error.name,
        code: error.code
      });
      throw error;
    }
  }

  private static async generateClaudeResponse(
    userId: string,
    model: string,
    prompt: string,
    context: string[]
  ): Promise<string> {
    try {
      console.log(`Creating Claude client for user ${userId}`);
      const client = await this.createClaudeClient(userId);
      
      console.log(`Preparing Claude messages for model: ${model}`);
      const messages: Anthropic.MessageParam[] = [
        ...context.map((msg, idx) => ({
          role: (idx % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
          content: msg
        }))
      ];

      console.log(`Sending request to Claude API...`);
      const response = await client.messages.create({
        model,
        max_tokens: 2000,
        system: prompt,
        messages,
      });

      console.log(`Claude response received successfully`);
      return response.content[0]?.type === "text" ? response.content[0].text : "No response generated";
    } catch (error) {
      console.error(`Claude API error:`, error);
      console.error(`Error details:`, {
        message: error.message,
        stack: error.stack,
        name: error.name,
        code: error.code
      });
      throw error;
    }
  }

  private static async generateGrokResponse(
    userId: string,
    model: string,
    prompt: string,
    context: string[]
  ): Promise<string> {
    try {
      console.log(`Creating Grok client for user ${userId}`);
      const client = await this.createGrokClient(userId);
      
      console.log(`Preparing Grok messages for model: ${model}`);
      const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
        { role: "system", content: prompt },
        ...context.map((msg, idx) => ({
          role: (idx % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
          content: msg
        }))
      ];

      console.log(`Sending request to Grok API...`);
      const response = await client.chat.completions.create({
        model,
        messages,
        max_tokens: 2000,
        temperature: 0.7,
      });

      console.log(`Grok response received successfully`);
      return response.choices[0]?.message?.content || "No response generated";
    } catch (error) {
      console.error(`Grok API error:`, error);
      console.error(`Error details:`, {
        message: error.message,
        stack: error.stack,
        name: error.name,
        code: error.code
      });
      throw error;
    }
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
          return "grok-beta"; // Latest Grok model for research
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
