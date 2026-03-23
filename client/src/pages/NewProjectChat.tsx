import { useState } from "react";
import { useRoute, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, ListTodo, Database, Bot, FolderOpen, Plus, Trash2 } from "lucide-react";
import type { Project, ProjectFile } from "@/types";
import FileBrowser from "@/components/FileBrowser";
import ModelPicker from "@/components/ModelPicker";

const schema = z.object({
  title: z.string().min(1, "Title is required").max(100),
  task: z.string().min(1, "Task is required"),
  inputData: z.string().optional(),
  aiProvider: z.string().optional(),
  aiModel: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

export default function NewProjectChat() {
  const [, params] = useRoute("/projects/:id/chat/new");
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const projectId = parseInt(params?.id ?? "0");
  const [showFileBrowser, setShowFileBrowser] = useState(false);
  const [taskItems, setTaskItems] = useState<string[]>([""]);

  const { data: project } = useQuery<Project>({
    queryKey: [`/api/projects/${projectId}`],
    enabled: !!projectId,
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: "",
      task: "",
      inputData: "",
      aiProvider: project?.aiProvider ?? "",
      aiModel: project?.aiModel ?? "",
    },
  });

  const createMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const res = await apiRequest("POST", `/api/projects/${projectId}/chats`, values);
      return res.json();
    },
    onSuccess: (chat) => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/chats"] });
      toast({ title: "Chat started" });
      navigate(`/chat/${chat.id}`);
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Failed to create chat.", variant: "destructive" });
    },
  });

  const syncTasks = (items: string[]) => {
    setTaskItems(items);
    const combined = items
      .map((t, i) => `${i + 1}. ${t}`)
      .filter((_, i) => items[i].trim() !== "")
      .join("\n");
    form.setValue("task", combined);
  };
  const addTask = () => syncTasks([...taskItems, ""]);
  const updateTask = (index: number, value: string) => syncTasks(taskItems.map((t, i) => (i === index ? value : t)));
  const removeTask = (index: number) => { if (taskItems.length > 1) syncTasks(taskItems.filter((_, i) => i !== index)); };

  const handleFileAttach = (files: ProjectFile[], contents: string[]) => {
    const appended = contents.join("\n\n---\n\n");
    const current = form.getValues("inputData") ?? "";
    form.setValue("inputData", current ? `${current}\n\n---\n\n${appended}` : appended);
    setShowFileBrowser(false);
    toast({ title: `${files.length} file(s) attached` });
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white shadow-sm border-b border-gray-200 p-6 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto flex items-center gap-4">
          <Button variant="outline" size="sm" onClick={() => navigate(`/projects/${projectId}`)}>
            <ArrowLeft className="w-4 h-4 mr-1" /> Back
          </Button>
          <div>
            <h1 className="text-xl font-bold text-gray-900">New Chat</h1>
            {project && (
              <p className="text-sm text-gray-400">in <span className="font-medium text-blue-600">{project.name}</span></p>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-6 py-8">
        {project && (
          <div className="mb-5 p-4 bg-blue-50 rounded-xl border border-blue-100 text-sm text-blue-700">
            Inheriting defaults from <strong>{project.name}</strong>:
            role <strong>{project.role?.replace(/_/g, ' ') ?? 'researcher'}</strong>
            {project.aiModel && <>, model <strong>{project.aiModel}</strong></>}.
            You can override below.
          </div>
        )}

        <Form {...form}>
          <form onSubmit={form.handleSubmit(v => createMutation.mutate(v))} className="space-y-5">

            <Card>
              <CardContent className="p-5">
                <FormField control={form.control} name="title" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-semibold">Chat Title *</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. Regulatory mapping review" {...field} className="rounded-xl" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <FormLabel className="font-semibold flex items-center gap-2 mb-0">
                    <ListTodo className="w-4 h-4 text-blue-600" /> Task *
                  </FormLabel>
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
                        className="flex-1 rounded-xl"
                        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTask(); } }}
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
                  <Plus className="w-4 h-4" /> Add task
                </button>
                <FormField control={form.control} name="task" render={() => (
                  <FormItem className="mt-1"><FormMessage /></FormItem>
                )} />
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5 space-y-3">
                <FormField control={form.control} name="inputData" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-semibold flex items-center gap-2">
                      <Database className="w-4 h-4 text-blue-600" /> Input Data
                      <span className="text-gray-400 font-normal">(optional)</span>
                    </FormLabel>
                    <FormControl>
                      <Textarea placeholder="Paste data, or attach files from the project folder below..." rows={4} {...field} className="rounded-xl resize-none" />
                    </FormControl>
                  </FormItem>
                )} />
                {project?.localFolderPath && (
                  <div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setShowFileBrowser(v => !v)}
                      className="flex items-center gap-1.5"
                    >
                      <FolderOpen className="w-4 h-4" />
                      Browse project files
                    </Button>
                    {showFileBrowser && (
                      <div className="mt-3">
                        <FileBrowser
                          projectId={projectId}
                          folderPath={project.localFolderPath!}
                          selectable
                          onAttach={handleFileAttach}
                        />
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Model override */}
            <Card>
              <CardContent className="p-5 space-y-3">
                <div className="flex items-center gap-2">
                  <Bot className="w-4 h-4 text-blue-600" />
                  <span className="font-semibold text-gray-900 text-sm">AI Engine Override</span>
                  <span className="text-xs text-gray-400">(optional — inherits from project)</span>
                </div>
                <ModelPicker
                  provider={form.watch("aiProvider") ?? ""}
                  model={form.watch("aiModel") ?? ""}
                  onProviderChange={v => form.setValue("aiProvider", v)}
                  onModelChange={v => form.setValue("aiModel", v)}
                  providerPlaceholder={project?.aiProvider ?? "Provider"}
                  modelPlaceholder={project?.aiModel ?? "Model"}
                />
              </CardContent>
            </Card>

            <div className="flex justify-end">
              <Button
                type="submit"
                disabled={createMutation.isPending}
                className="px-8 py-3 gradient-bg text-white rounded-xl font-medium hover:shadow-lg"
              >
                {createMutation.isPending ? "Starting..." : "Start Conversation"}
              </Button>
            </div>
          </form>
        </Form>
      </div>
    </div>
  );
}
