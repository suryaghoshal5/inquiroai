import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import RoleSelector from "./RoleSelector";
import FileUpload from "./FileUpload";
import { 
  Info, 
  CheckCircle, 
  ListTodo, 
  Database, 
  AlertTriangle, 
  Lightbulb, 
  Star, 
  Users, 
  Bot,
  UserCheck,
  Rocket
} from "lucide-react";
import type { ChatConfig, AIProvider } from "@/types";

// Helper function to count words
const countWords = (text: string): number => {
  return text.trim() === '' ? 0 : text.trim().split(/\s+/).length;
};

const chatConfigSchema = z.object({
  role: z.enum(["researcher", "product_manager", "developer", "content_writer", "designer", "presales_consultant", "custom"]),
  customRole: z.string().optional(),
  context: z.string().refine(val => countWords(val) <= 1000, "Context must be 1000 words or less"),
  task: z.string().refine(val => countWords(val) <= 200, "Task must be 200 words or less"),
  inputData: z.string().refine(val => countWords(val) <= 10000, "Input data must be 10000 words or less"),
  constraints: z.string().refine(val => countWords(val) <= 200, "Constraints must be 200 words or less"),
  examples: z.string().refine(val => countWords(val) <= 10000, "Examples must be 10000 words or less"),
  optional: z.string().refine(val => countWords(val) <= 200, "Optional field must be 200 words or less"),
  audience: z.string().refine(val => countWords(val) <= 200, "Audience must be 200 words or less"),
  aiProvider: z.enum(["openai", "gemini", "claude", "grok"]),
  aiModel: z.string().min(1, "AI model is required"),
  title: z.string().min(1, "Title is required").max(100, "Title must be 100 characters or less"),
});

interface NewChatFormProps {
  onSubmit: (config: ChatConfig) => void;
  isLoading: boolean;
}

export default function NewChatForm({ onSubmit, isLoading }: NewChatFormProps) {
  const [selectedProvider, setSelectedProvider] = useState<string>("openai");

  const { data: aiProviders } = useQuery<Record<string, AIProvider>>({
    queryKey: ["/api/ai-providers"],
  });

  const form = useForm<ChatConfig>({
    resolver: zodResolver(chatConfigSchema),
    defaultValues: {
      role: "researcher",
      customRole: "",
      context: "",
      task: "",
      inputData: "",
      constraints: "",
      examples: "",
      optional: "",
      audience: "",
      aiProvider: "openai",
      aiModel: "",
      title: "",
    },
  });

  const watchedRole = form.watch("role");
  const watchedProvider = form.watch("aiProvider");
  


  // Update selected provider when form value changes
  React.useEffect(() => {
    setSelectedProvider(watchedProvider);
  }, [watchedProvider]);

  // Auto-select default model when provider changes
  React.useEffect(() => {
    if (aiProviders && watchedProvider) {
      const provider = aiProviders[watchedProvider];
      if (provider && provider.defaultModel) {
        form.setValue("aiModel", provider.defaultModel);
      }
    }
  }, [watchedProvider, aiProviders, form]);

  const handleSubmit = (data: ChatConfig) => {
    onSubmit(data);
  };

  const handleFileUpload = (content: string, fieldName: 'inputData' | 'examples') => {
    const currentValue = form.getValues(fieldName);
    const newValue = currentValue ? `${currentValue}\n\n${content}` : content;
    form.setValue(fieldName, newValue);
  };

  const getWordCount = (field: string) => {
    const value = form.watch(field as keyof ChatConfig) as string;
    return value ? countWords(value) : 0;
  };

  const getRecommendedModel = () => {
    const task = form.watch("task");
    const provider = form.watch("aiProvider");
    
    if (!aiProviders || !task || !provider) return null;

    const taskLower = task.toLowerCase();
    const providerData = aiProviders[provider];
    
    if (!providerData) return null;

    // Simple recommendation logic
    if (taskLower.includes("code") || taskLower.includes("programming")) {
      return provider === "openai" ? "gpt-4o" : providerData.defaultModel;
    }
    if (taskLower.includes("analysis") || taskLower.includes("research")) {
      return provider === "gemini" ? "gemini-1.5-pro" : providerData.defaultModel;
    }
    
    return providerData.defaultModel;
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
        {/* Title */}
        <Card>
          <CardContent className="p-6">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-semibold text-gray-900 flex items-center">
                    <CheckCircle className="w-4 h-4 mr-2 text-blue-600" />
                    Chat Title
                  </FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Give your chat a descriptive title..."
                      {...field}
                      className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </FormControl>
                  <div className="flex justify-between items-center mt-2">
                    <FormMessage />
                    <span className="text-sm text-gray-400">
                      {form.watch("title")?.length || 0} / 100 chars
                    </span>
                  </div>
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {/* Role Selection */}
        <Card>
          <CardContent className="p-6">
            <FormField
              control={form.control}
              name="role"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-semibold text-gray-900 flex items-center">
                    <UserCheck className="w-4 h-4 mr-2 text-blue-600" />
                    Role Selection
                  </FormLabel>
                  <FormControl>
                    <RoleSelector
                      value={field.value}
                      onChange={field.onChange}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {watchedRole === "custom" && (
              <FormField
                control={form.control}
                name="customRole"
                render={({ field }) => (
                  <FormItem className="mt-4">
                    <FormControl>
                      <Input
                        placeholder="Describe your custom role..."
                        {...field}
                        className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
          </CardContent>
        </Card>

        {/* Context */}
        <Card>
          <CardContent className="p-6">
            <FormField
              control={form.control}
              name="context"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-semibold text-gray-900 flex items-center">
                    <Info className="w-4 h-4 mr-2 text-blue-600" />
                    Context <span className="text-gray-500 font-normal ml-1">(1000 words max)</span>
                  </FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Provide background information and context for your conversation..."
                      className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                      rows={4}
                      {...field}
                    />
                  </FormControl>
                  <div className="flex justify-between items-center mt-2">
                    <FormMessage />
                    <span className={`text-sm ${getWordCount("context") > 900 ? "text-red-500" : "text-gray-400"}`}>
                      {getWordCount("context")} / 1000 words
                    </span>
                  </div>
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {/* Task */}
        <Card>
          <CardContent className="p-6">
            <FormField
              control={form.control}
              name="task"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-semibold text-gray-900 flex items-center">
                    <ListTodo className="w-4 h-4 mr-2 text-blue-600" />
                    Task <span className="text-gray-500 font-normal ml-1">(200 words max)</span>
                  </FormLabel>
                  <FormControl>
                    <Input
                      placeholder="• Define specific tasks (use bullet points)"
                      {...field}
                      className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </FormControl>
                  <div className="flex justify-between items-center mt-2">
                    <FormMessage />
                    <span className={`text-sm ${getWordCount("task") > 180 ? "text-red-500" : "text-gray-400"}`}>
                      {getWordCount("task")} / 200 words
                    </span>
                  </div>
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {/* Input Data */}
        <Card>
          <CardContent className="p-6">
            <FormField
              control={form.control}
              name="inputData"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-semibold text-gray-900 flex items-center">
                    <Database className="w-4 h-4 mr-2 text-blue-600" />
                    Input Data <span className="text-gray-500 font-normal ml-1">(10000 words max)</span>
                  </FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Provide your data, documents, or information..."
                      className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                      rows={4}
                      {...field}
                    />
                  </FormControl>
                  <div className="mt-4 flex items-center justify-between">
                    <FileUpload
                      onUpload={(content) => handleFileUpload(content, 'inputData')}
                      acceptedTypes={['.pdf', '.xlsx', '.xls', '.docx', '.doc', '.md', '.txt']}
                    />
                    <span className={`text-sm ${getWordCount("inputData") > 9000 ? "text-red-500" : "text-gray-400"}`}>
                      {getWordCount("inputData")} / 10000 words
                    </span>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {/* Constraints */}
        <Card>
          <CardContent className="p-6">
            <FormField
              control={form.control}
              name="constraints"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-semibold text-gray-900 flex items-center">
                    <AlertTriangle className="w-4 h-4 mr-2 text-blue-600" />
                    Constraints <span className="text-gray-500 font-normal ml-1">(200 words max)</span>
                  </FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Specify any limitations or constraints..."
                      {...field}
                      className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </FormControl>
                  <div className="flex justify-between items-center mt-2">
                    <FormMessage />
                    <span className={`text-sm ${getWordCount("constraints") > 180 ? "text-red-500" : "text-gray-400"}`}>
                      {getWordCount("constraints")} / 200 words
                    </span>
                  </div>
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {/* Examples */}
        <Card>
          <CardContent className="p-6">
            <FormField
              control={form.control}
              name="examples"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-semibold text-gray-900 flex items-center">
                    <Lightbulb className="w-4 h-4 mr-2 text-blue-600" />
                    Examples <span className="text-gray-500 font-normal ml-1">(10000 words max)</span>
                  </FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Provide examples of desired outputs or formats..."
                      className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                      rows={4}
                      {...field}
                    />
                  </FormControl>
                  <div className="mt-4 flex items-center justify-between">
                    <FileUpload
                      onUpload={(content) => handleFileUpload(content, 'examples')}
                      acceptedTypes={['.pdf', '.xlsx', '.xls', '.docx', '.doc', '.md', '.txt']}
                    />
                    <span className={`text-sm ${getWordCount("examples") > 9000 ? "text-red-500" : "text-gray-400"}`}>
                      {getWordCount("examples")} / 10000 words
                    </span>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {/* Optional & Audience */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardContent className="p-6">
              <FormField
                control={form.control}
                name="optional"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-semibold text-gray-900 flex items-center">
                      <Star className="w-4 h-4 mr-2 text-blue-600" />
                      Optional <span className="text-gray-500 font-normal ml-1">(200 words max)</span>
                    </FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Additional requirements..."
                        {...field}
                        className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </FormControl>
                    <div className="flex justify-between items-center mt-2">
                      <FormMessage />
                      <span className={`text-sm ${getWordCount("optional") > 180 ? "text-red-500" : "text-gray-400"}`}>
                        {getWordCount("optional")} / 200 words
                      </span>
                    </div>
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <FormField
                control={form.control}
                name="audience"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-semibold text-gray-900 flex items-center">
                      <Users className="w-4 h-4 mr-2 text-blue-600" />
                      Audience <span className="text-gray-500 font-normal ml-1">(200 words max)</span>
                    </FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Target audience specification..."
                        {...field}
                        className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </FormControl>
                    <div className="flex justify-between items-center mt-2">
                      <FormMessage />
                      <span className={`text-sm ${getWordCount("audience") > 180 ? "text-red-500" : "text-gray-400"}`}>
                        {getWordCount("audience")} / 200 words
                      </span>
                    </div>
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>
        </div>

        {/* AI Engine Selection */}
        <Card>
          <CardContent className="p-6">
            <div className="space-y-4">
              <div className="flex items-center space-x-2">
                <Bot className="w-5 h-5 text-blue-600" />
                <h3 className="text-sm font-semibold text-gray-900">AI Engine Selection</h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="aiProvider"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-medium text-gray-600">Provider</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent">
                            <SelectValue placeholder="Select AI Provider" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {aiProviders && Object.entries(aiProviders).map(([key, provider]) => (
                            <SelectItem key={key} value={key}>
                              {provider.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="aiModel"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-medium text-gray-600">Model</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent">
                            <SelectValue placeholder="Select Model" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {aiProviders && aiProviders[selectedProvider]?.models.map((model) => (
                            <SelectItem key={model} value={model}>
                              {model}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {getRecommendedModel() && (
                <div className="p-4 bg-blue-50 rounded-xl">
                  <div className="flex items-center space-x-2">
                    <Info className="w-4 h-4 text-blue-500" />
                    <span className="text-sm text-blue-700">
                      <strong>Recommended:</strong> {getRecommendedModel()} for your task type
                    </span>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Action Buttons */}
        <div className="flex justify-end space-x-4 pt-6">
          <Button
            type="button"
            variant="outline"
            className="px-6 py-3 border border-gray-300 rounded-xl text-gray-700 font-medium hover:bg-gray-50"
          >
            Save as Template
          </Button>
          <Button
            type="submit"
            disabled={isLoading}
            className="px-8 py-3 gradient-bg text-white rounded-xl font-medium hover:shadow-lg transition-all duration-200"
          >
            {isLoading ? "Creating..." : "Start Conversation"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
