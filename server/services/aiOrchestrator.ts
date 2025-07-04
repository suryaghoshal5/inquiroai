import OpenAI from "openai";
import { GoogleGenAI } from "@google/genai";
import Anthropic from "@anthropic-ai/sdk";
import { storage } from "../storage";
import { CryptoService } from "./cryptoService";

export interface AIProvider {
  name: string;
  models: string[];
  defaultModel: string;
}

export const AI_PROVIDERS: Record<string, AIProvider> = {
  openai: {
    name: "OpenAI",
    models: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo"],
    defaultModel: "gpt-4o" // the newest OpenAI model is "gpt-4o" which was released May 13, 2024
  },
  gemini: {
    name: "Google Gemini",
    models: ["gemini-2.0-flash-exp", "gemini-1.5-pro", "gemini-1.5-flash"],
    defaultModel: "gemini-2.0-flash-exp"
  },
  claude: {
    name: "Anthropic Claude",
    models: ["claude-3-5-sonnet-20241022", "claude-3-opus-20240229", "claude-3-haiku-20240307"],
    defaultModel: "claude-3-5-sonnet-20241022"
  },
  grok: {
    name: "Grok",
    models: ["grok-beta", "grok-vision-beta"],
    defaultModel: "grok-beta"
  }
};

export class AIOrchestrator {
  private static async getApiKey(userId: string, provider: string): Promise<string> {
    const apiKey = await storage.getApiKey(userId, provider);
    if (!apiKey) {
      throw new Error(`No API key found for provider: ${provider}`);
    }
    
    if (!apiKey.isValid) {
      throw new Error(`API key for ${provider} is invalid`);
    }
    
    return CryptoService.decrypt(apiKey.encryptedKey);
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

  static getRecommendedModel(provider: string, task: string): string {
    const taskKeywords = task.toLowerCase();
    
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
