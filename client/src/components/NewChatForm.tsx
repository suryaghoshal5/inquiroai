import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import RoleSelector from "./RoleSelector";
import FileUpload from "./FileUpload";
import ModelPicker from "./ModelPicker";
import TemplateLibrary, { type TemplateFields } from "./TemplateLibrary";
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
  Plus,
  Trash2,
  X,
  HelpCircle,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { ChatConfig } from "@/types";

// Helper function to count words
const countWords = (text: string): number => {
  return text.trim() === '' ? 0 : text.trim().split(/\s+/).length;
};

const chatConfigSchema = z.object({
  role: z.enum(["researcher", "product_manager", "developer", "content_writer", "designer", "presales_consultant", "custom"]),
  customRole: z.string().optional(),
  context: z.string().refine(val => countWords(val) <= 1000, "Context must be 1000 words or less"),
  task: z.string().refine(val => countWords(val) <= 10000, "Task must be 10000 words or less"),
  inputData: z.string().refine(val => countWords(val) <= 10000, "Input data must be 10000 words or less"),
  constraints: z.string().refine(val => countWords(val) <= 10000, "Constraints must be 10000 words or less"),
  examples: z.string().refine(val => countWords(val) <= 10000, "Examples must be 10000 words or less"),
  optional: z.string().refine(val => countWords(val) <= 10000, "Optional field must be 10000 words or less"),
  audience: z.string().refine(val => countWords(val) <= 10000, "Audience must be 10000 words or less"),
  aiProvider: z.string().optional(),
  aiModel: z.string().optional(),
  title: z.string().max(100, "Title must be 100 characters or less").optional(),
});

// Which tab each field belongs to (for validation error routing)
const FIELD_TAB: Record<string, string> = {
  title: "basics",
  role: "basics",
  customRole: "basics",
  task: "task",
  inputData: "task",
  context: "context",
  constraints: "context",
  audience: "context",
  examples: "context",
  optional: "context",
  aiProvider: "settings",
  aiModel: "settings",
};

interface NewChatFormProps {
  onSubmit: (config: ChatConfig) => void;
  isLoading: boolean;
}

export default function NewChatForm({ onSubmit, isLoading }: NewChatFormProps) {
  const [activeTab, setActiveTab] = useState("basics");
  const [taskItems, setTaskItems] = useState<string[]>([""]);
  const [showModelOverride, setShowModelOverride] = useState(false);
  const [overrideProvider, setOverrideProvider] = useState("");
  const [overrideModel, setOverrideModel] = useState("");

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
      aiProvider: undefined,
      aiModel: undefined,
      title: "",
    },
  });

  const watchedRole = form.watch("role");

  const handleSubmit = (data: ChatConfig) => {
    const config: ChatConfig = {
      ...data,
      aiProvider: overrideProvider || "openai",
      aiModel: overrideModel || "openai/gpt-4o",
    };
    onSubmit(config);
  };

  const handleInvalidSubmit = () => {
    const errors = form.formState.errors;
    const errorFields = Object.keys(errors);
    if (errorFields.length > 0) {
      const firstErrorTab = FIELD_TAB[errorFields[0]] ?? "basics";
      setActiveTab(firstErrorTab);
    }
  };

  const clearModelOverride = () => {
    setOverrideProvider("");
    setOverrideModel("");
    setShowModelOverride(false);
  };

  const applyTemplate = (fields: TemplateFields) => {
    const VALID_ROLES = ["researcher", "product_manager", "developer", "content_writer", "designer", "presales_consultant", "custom"] as const;
    const role = VALID_ROLES.includes(fields.role as typeof VALID_ROLES[number]) ? fields.role as typeof VALID_ROLES[number] : "custom";
    form.setValue("role", role);
    if (fields.customRole) form.setValue("customRole", fields.customRole);
    if (fields.context)    form.setValue("context", fields.context);
    if (fields.task)       form.setValue("task", fields.task);
    if (fields.constraints) form.setValue("constraints", fields.constraints);
    if (fields.audience)   form.setValue("audience", fields.audience);
    if (fields.examples)   form.setValue("examples", fields.examples);
    if (fields.optional)   form.setValue("optional", fields.optional);
    if (fields.name && !form.getValues("title")) form.setValue("title", fields.name);
    if (fields.aiProvider) setOverrideProvider(fields.aiProvider);
    if (fields.aiModel)    setOverrideModel(fields.aiModel);
    if (fields.aiProvider || fields.aiModel) setShowModelOverride(true);
    // Sync task items display
    if (fields.task) {
      const lines = fields.task.split("\n").filter(l => l.trim());
      setTaskItems(lines.length > 0 ? lines : [""]);
    }
    setActiveTab("basics");
  };

  const syncTasks = (items: string[]) => {
    setTaskItems(items);
    const combined = items
      .map((t, i) => `${i + 1}. ${t}`)
      .filter(t => t.trim() !== `${t.indexOf('.') + 1}. `)
      .join("\n");
    form.setValue("task", combined);
  };

  const addTask = () => syncTasks([...taskItems, ""]);

  const updateTask = (index: number, value: string) => {
    const updated = taskItems.map((t, i) => (i === index ? value : t));
    syncTasks(updated);
  };

  const removeTask = (index: number) => {
    if (taskItems.length === 1) return;
    syncTasks(taskItems.filter((_, i) => i !== index));
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

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit, handleInvalidSubmit)} className="space-y-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <div className="flex items-center justify-between mb-4">
            <TabsList className="grid grid-cols-4 flex-1 mr-3">
              <TabsTrigger value="basics">Basics</TabsTrigger>
              <TabsTrigger value="task">Task</TabsTrigger>
              <TabsTrigger value="context">Context</TabsTrigger>
              <TabsTrigger value="settings">Settings</TabsTrigger>
            </TabsList>
            <TemplateLibrary onUse={applyTemplate} />
          </div>

          {/* ── Tab 1: Basics ── */}
          <TabsContent value="basics" className="space-y-6">
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

            <Card>
              <CardContent className="p-6">
                <FormField
                  control={form.control}
                  name="role"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-semibold text-gray-900 flex items-center mb-3">
                        <UserCheck className="w-4 h-4 mr-2 text-blue-600" />
                        Role Selection
                      </FormLabel>
                      <FormControl>
                        <RoleSelector value={field.value} onChange={field.onChange} />
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

            <div className="flex justify-end">
              <Button
                type="button"
                onClick={() => setActiveTab("task")}
                className="px-6 py-2 gradient-bg text-white rounded-xl font-medium hover:scale-[1.02] hover:shadow-md transition-all duration-200"
              >
                Next: Task →
              </Button>
            </div>
          </TabsContent>

          {/* ── Tab 2: Task ── */}
          <TabsContent value="task" className="space-y-6">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-3">
                  <FormLabel className="text-sm font-semibold text-gray-900 flex items-center mb-0">
                    <ListTodo className="w-4 h-4 mr-2 text-blue-600" />
                    Task <span className="text-red-500 ml-1">*</span>
                    <span className="text-gray-500 font-normal ml-1">(10,000 words max)</span>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <HelpCircle className="w-3.5 h-3.5 ml-1.5 text-gray-400 cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-[280px] text-xs">
                          What you want done this session. E.g. "Map PMLA 2002 obligations to our data model."
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </FormLabel>
                  <span className={`text-sm ${getWordCount("task") > 9000 ? "text-red-500" : "text-gray-400"}`}>
                    {getWordCount("task")} / 10,000 words
                  </span>
                </div>
                <div className="space-y-2">
                  {taskItems.map((item, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-400 w-6 shrink-0 text-right">
                        {index + 1}.
                      </span>
                      <Input
                        value={item}
                        onChange={(e) => updateTask(index, e.target.value)}
                        placeholder={`Task ${index + 1}`}
                        className="flex-1 px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") { e.preventDefault(); addTask(); }
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => removeTask(index)}
                        disabled={taskItems.length === 1}
                        className="p-1.5 text-gray-300 hover:text-red-400 disabled:opacity-20 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={addTask}
                  className="mt-3 flex items-center gap-1.5 text-sm text-blue-500 hover:text-blue-700 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Add task
                </button>
                <FormField
                  control={form.control}
                  name="task"
                  render={() => (
                    <FormItem className="mt-1">
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <FormField
                  control={form.control}
                  name="inputData"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-semibold text-gray-900 flex items-center">
                        <Database className="w-4 h-4 mr-2 text-blue-600" />
                        Input Data <span className="text-gray-500 font-normal ml-1">(optional · 10,000 words max)</span>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <HelpCircle className="w-3.5 h-3.5 ml-1.5 text-gray-400 cursor-help" />
                            </TooltipTrigger>
                            <TooltipContent className="max-w-[280px] text-xs">
                              Paste or upload data to analyze this session. Not saved to project defaults.
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
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
                          {getWordCount("inputData")} / 10,000 words
                        </span>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>

            <div className="flex justify-between">
              <Button type="button" variant="outline" onClick={() => setActiveTab("basics")} className="hover:scale-[1.02] transition-all duration-200">
                ← Back
              </Button>
              <Button
                type="button"
                onClick={() => setActiveTab("context")}
                className="px-6 py-2 gradient-bg text-white rounded-xl font-medium hover:scale-[1.02] hover:shadow-md transition-all duration-200"
              >
                Next: Context →
              </Button>
            </div>
          </TabsContent>

          {/* ── Tab 3: Context ── */}
          <TabsContent value="context" className="space-y-6">
            <Card>
              <CardContent className="p-6">
                <FormField
                  control={form.control}
                  name="context"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-semibold text-gray-900 flex items-center">
                        <Info className="w-4 h-4 mr-2 text-blue-600" />
                        Context <span className="text-gray-500 font-normal ml-1">(1,000 words max)</span>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <HelpCircle className="w-3.5 h-3.5 ml-1.5 text-gray-400 cursor-help" />
                            </TooltipTrigger>
                            <TooltipContent className="max-w-[280px] text-xs">
                              Background the AI should know. E.g. "We're building a KYC compliance platform for Indian banks under RBI guidelines."
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
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
                          {getWordCount("context")} / 1,000 words
                        </span>
                      </div>
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <CardContent className="p-6">
                  <FormField
                    control={form.control}
                    name="constraints"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-sm font-semibold text-gray-900 flex items-center">
                          <AlertTriangle className="w-4 h-4 mr-2 text-blue-600" />
                          Constraints
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <HelpCircle className="w-3.5 h-3.5 ml-1.5 text-gray-400 cursor-help" />
                              </TooltipTrigger>
                              <TooltipContent className="max-w-[280px] text-xs">
                                Output format or limits. E.g. "Respond in a numbered list, max 5 items, no jargon."
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </FormLabel>
                        <FormControl>
                          <Input
                            placeholder="Specify any limitations or constraints..."
                            {...field}
                            className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          />
                        </FormControl>
                        <FormMessage />
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
                          Audience
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <HelpCircle className="w-3.5 h-3.5 ml-1.5 text-gray-400 cursor-help" />
                              </TooltipTrigger>
                              <TooltipContent className="max-w-[280px] text-xs">
                                Who will read the output. E.g. "Non-technical C-suite audience."
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </FormLabel>
                        <FormControl>
                          <Input
                            placeholder="Target audience specification..."
                            {...field}
                            className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardContent className="p-6">
                <FormField
                  control={form.control}
                  name="examples"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-semibold text-gray-900 flex items-center">
                        <Lightbulb className="w-4 h-4 mr-2 text-blue-600" />
                        Examples <span className="text-gray-500 font-normal ml-1">(optional)</span>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <HelpCircle className="w-3.5 h-3.5 ml-1.5 text-gray-400 cursor-help" />
                            </TooltipTrigger>
                            <TooltipContent className="max-w-[280px] text-xs">
                              Sample inputs/outputs to calibrate tone. Paste an example exchange.
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Provide examples of desired outputs or formats..."
                          className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                          rows={3}
                          {...field}
                        />
                      </FormControl>
                      <div className="mt-4 flex items-center justify-between">
                        <FileUpload
                          onUpload={(content) => handleFileUpload(content, 'examples')}
                          acceptedTypes={['.pdf', '.xlsx', '.xls', '.docx', '.doc', '.md', '.txt']}
                        />
                        <span className={`text-sm ${getWordCount("examples") > 9000 ? "text-red-500" : "text-gray-400"}`}>
                          {getWordCount("examples")} / 10,000 words
                        </span>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <FormField
                  control={form.control}
                  name="optional"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-semibold text-gray-900 flex items-center">
                        <Star className="w-4 h-4 mr-2 text-blue-600" />
                        Optional <span className="text-gray-500 font-normal ml-1">(additional requirements)</span>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <HelpCircle className="w-3.5 h-3.5 ml-1.5 text-gray-400 cursor-help" />
                            </TooltipTrigger>
                            <TooltipContent className="max-w-[280px] text-xs">
                              Anything else the AI should know. Links, reference numbers, related docs.
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Additional requirements..."
                          {...field}
                          className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>

            <div className="flex justify-between">
              <Button type="button" variant="outline" onClick={() => setActiveTab("task")} className="hover:scale-[1.02] transition-all duration-200">
                ← Back
              </Button>
              <Button
                type="button"
                onClick={() => setActiveTab("settings")}
                className="px-6 py-2 gradient-bg text-white rounded-xl font-medium hover:scale-[1.02] hover:shadow-md transition-all duration-200"
              >
                Next: Settings →
              </Button>
            </div>
          </TabsContent>

          {/* ── Tab 4: Settings ── */}
          <TabsContent value="settings" className="space-y-6">
            {/* AI Engine — Auto by default, optional override */}
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Bot className="w-5 h-5 text-blue-600" />
                  <h3 className="font-semibold text-gray-900">AI Engine</h3>
                  <span className="text-xs text-gray-400">(auto-selected by default)</span>
                </div>

                {!showModelOverride && !overrideModel ? (
                  <button
                    type="button"
                    onClick={() => setShowModelOverride(true)}
                    className="flex items-center gap-2 text-sm px-3 py-2 rounded-lg bg-purple-50 border border-purple-200 text-purple-700 hover:bg-purple-100 hover:scale-[1.02] transition-all duration-200"
                  >
                    <Bot className="w-4 h-4" />
                    <span>⚡ Auto · <span className="underline">Override →</span></span>
                  </button>
                ) : overrideModel ? (
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-purple-50 border border-purple-200">
                      <Bot className="w-4 h-4 text-purple-600" />
                      <span className="text-sm text-purple-700 font-medium">
                        ⚡ {overrideModel.includes("/") ? overrideModel.slice(overrideModel.indexOf("/") + 1) : overrideModel}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={clearModelOverride}
                      className="flex items-center gap-1 text-xs text-gray-400 hover:text-red-500 transition-colors"
                    >
                      <X className="w-3 h-3" />
                      Reset to auto
                    </button>
                  </div>
                ) : null}

                {showModelOverride && !overrideModel && (
                  <div className="mt-3 p-4 border border-gray-200 rounded-xl bg-gray-50">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm font-medium text-gray-700">Select AI Engine</span>
                      <button
                        type="button"
                        onClick={() => setShowModelOverride(false)}
                        className="text-gray-400 hover:text-gray-600"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    <ModelPicker
                      provider={overrideProvider}
                      model={overrideModel}
                      onProviderChange={setOverrideProvider}
                      onModelChange={(m) => {
                        setOverrideModel(m);
                        if (m) setShowModelOverride(false);
                      }}
                      providerPlaceholder="Select provider"
                      modelPlaceholder="Select model"
                    />
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="flex justify-between">
              <Button type="button" variant="outline" onClick={() => setActiveTab("context")} className="hover:scale-[1.02] transition-all duration-200">
                ← Back
              </Button>
              <Button
                type="submit"
                disabled={isLoading}
                className="px-8 py-3 gradient-bg text-white rounded-xl font-medium hover:scale-[1.02] hover:shadow-md transition-all duration-200"
              >
                {isLoading ? "Creating..." : "Start Conversation"}
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </form>
    </Form>
  );
}
