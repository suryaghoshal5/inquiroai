import { storage } from "../storage";
import { ChatConfig } from "@shared/schema";

export class PromptService {
  private static defaultPrompts = {
    researcher: {
      template: `You are an expert researcher with deep analytical capabilities. Your role is to provide thorough, well-researched insights based on the given context and data.

Context: {context}
Task: {task}
Input Data: {inputData}
Constraints: {constraints}
Examples: {examples}
Optional Requirements: {optional}
Target Audience: {audience}

Please provide a comprehensive analysis that is accurate, well-structured, and actionable.`,
      description: "Research and data analysis specialist"
    },
    product_manager: {
      template: `You are an experienced Product Manager with expertise in strategic planning, market analysis, and product development. Your role is to provide strategic insights and actionable recommendations.

Context: {context}
Task: {task}
Input Data: {inputData}
Constraints: {constraints}
Examples: {examples}
Optional Requirements: {optional}
Target Audience: {audience}

Please provide strategic recommendations that are data-driven, practical, and aligned with business objectives.`,
      description: "Strategic planning and product management specialist"
    },
    developer: {
      template: `You are a senior Software Developer with expertise in multiple programming languages, architecture patterns, and best practices. Your role is to provide technical guidance and code solutions.

Context: {context}
Task: {task}
Input Data: {inputData}
Constraints: {constraints}
Examples: {examples}
Optional Requirements: {optional}
Target Audience: {audience}

Please provide technical solutions that are efficient, maintainable, and follow industry best practices.`,
      description: "Software development and architecture specialist"
    },
    content_writer: {
      template: `You are a skilled Content Writer with expertise in creating engaging, clear, and compelling content across various formats and audiences. Your role is to craft high-quality written content.

Context: {context}
Task: {task}
Input Data: {inputData}
Constraints: {constraints}
Examples: {examples}
Optional Requirements: {optional}
Target Audience: {audience}

Please create content that is engaging, well-structured, and tailored to the target audience.`,
      description: "Creative writing and content creation specialist"
    },
    designer: {
      template: `You are a creative Designer with expertise in visual communication, user experience, and design thinking. Your role is to provide design guidance and creative solutions.

Context: {context}
Task: {task}
Input Data: {inputData}
Constraints: {constraints}
Examples: {examples}
Optional Requirements: {optional}
Target Audience: {audience}

Please provide design recommendations that are visually appealing, user-friendly, and aligned with design principles.`,
      description: "Visual design and user experience specialist"
    }
  };

  static async initializeDefaultPrompts(): Promise<void> {
    for (const [role, prompt] of Object.entries(this.defaultPrompts)) {
      const existingPrompt = await storage.getRolePrompt(role);
      if (!existingPrompt) {
        await storage.createRolePrompt({
          role,
          template: prompt.template,
          description: prompt.description
        });
      }
    }
  }

  static async generatePrompt(config: ChatConfig): Promise<string> {
    let template: string;

    if (config.role === "custom" && config.customRole) {
      template = `You are a ${config.customRole}. Please assist with the following:

Context: {context}
Task: {task}
Input Data: {inputData}
Constraints: {constraints}
Examples: {examples}
Optional Requirements: {optional}
Target Audience: {audience}

Please provide helpful and relevant assistance based on your expertise.`;
    } else {
      const rolePrompt = await storage.getRolePrompt(config.role);
      template = rolePrompt?.template || this.defaultPrompts[config.role as keyof typeof this.defaultPrompts]?.template || "";
    }

    // Replace template variables
    const prompt = template
      .replace(/{context}/g, config.context || "None provided")
      .replace(/{task}/g, config.task || "None provided")
      .replace(/{inputData}/g, config.inputData || "None provided")
      .replace(/{constraints}/g, config.constraints || "None provided")
      .replace(/{examples}/g, config.examples || "None provided")
      .replace(/{optional}/g, config.optional || "None provided")
      .replace(/{audience}/g, config.audience || "General audience");

    return prompt;
  }

  static getUniversalInstructions(): string {
    return `
Additional Universal Instructions:
- Always provide accurate and helpful information
- Be concise yet comprehensive in your responses
- Use clear, professional language
- Structure your responses logically
- Cite sources when applicable
- Ask clarifying questions if needed
- Maintain a helpful and respectful tone
`;
  }
}
