import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import RoleSelector from "@/components/RoleSelector";
import ModelPicker from "@/components/ModelPicker";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft, Brain, FolderOpen, Info, AlertTriangle, Users,
  Lightbulb, Star, Bot, UserCheck,
} from "lucide-react";

const schema = z.object({
  name: z.string().min(1, "Project name is required").max(200),
  description: z.string().max(5000).optional(),
  role: z.enum(["researcher", "product_manager", "developer", "content_writer", "designer", "presales_consultant", "custom"]).optional(),
  customRole: z.string().optional(),
  context: z.string().max(50000).optional(),
  constraints: z.string().max(50000).optional(),
  audience: z.string().max(50000).optional(),
  examples: z.string().max(50000).optional(),
  optional: z.string().max(50000).optional(),
  aiProvider: z.string().optional(),
  aiModel: z.string().optional(),
  localFolderPath: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

export default function NewProject() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      description: "",
      role: "researcher",
      customRole: "",
      context: "",
      constraints: "",
      audience: "",
      examples: "",
      optional: "",
      aiProvider: "openai",
      aiModel: "",
      localFolderPath: "",
    },
  });

  const watchedRole = form.watch("role");

  const createMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const res = await apiRequest("POST", "/api/projects", values);
      return res.json();
    },
    onSuccess: (project) => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      toast({ title: "Project created", description: `"${project.name}" is ready.` });
      navigate(`/projects/${project.id}`);
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Failed to create project.", variant: "destructive" });
    },
  });


  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white shadow-sm border-b border-gray-200 p-6 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Button variant="outline" onClick={() => navigate("/chat")} className="flex items-center space-x-2">
              <ArrowLeft className="w-4 h-4" />
              <span>Back</span>
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">New Project</h1>
              <p className="text-gray-500 text-sm">Define your project defaults — chats inherit these</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">
        <div className="text-center mb-6">
          <div className="w-16 h-16 gradient-bg rounded-2xl flex items-center justify-center mx-auto mb-3">
            <Brain className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900">Create Project</h2>
          <p className="text-gray-500 text-sm mt-1">
            Set once, reuse across all chats in this initiative
          </p>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit((v) => createMutation.mutate(v))} className="space-y-6">

            {/* Name + description */}
            <Card>
              <CardContent className="p-6 space-y-4">
                <FormField control={form.control} name="name" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-semibold">Project Name *</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. SmartKYC Chain" {...field} className="rounded-xl" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="description" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-semibold text-gray-700">Description</FormLabel>
                    <FormControl>
                      <Textarea placeholder="Short summary of this initiative..." rows={2} {...field} className="rounded-xl resize-none" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </CardContent>
            </Card>

            {/* Role */}
            <Card>
              <CardContent className="p-6">
                <FormField control={form.control} name="role" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-semibold flex items-center gap-2">
                      <UserCheck className="w-4 h-4 text-blue-600" /> Default Role
                    </FormLabel>
                    <FormControl>
                      <RoleSelector value={field.value ?? "researcher"} onChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )} />
                {watchedRole === "custom" && (
                  <FormField control={form.control} name="customRole" render={({ field }) => (
                    <FormItem className="mt-3">
                      <FormControl>
                        <Input placeholder="Describe your custom role..." {...field} className="rounded-xl" />
                      </FormControl>
                    </FormItem>
                  )} />
                )}
              </CardContent>
            </Card>

            {/* Context */}
            <Card>
              <CardContent className="p-6">
                <FormField control={form.control} name="context" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-semibold flex items-center gap-2">
                      <Info className="w-4 h-4 text-blue-600" /> Context
                    </FormLabel>
                    <FormControl>
                      <Textarea placeholder="Background information reused across all chats..." rows={4} {...field} className="rounded-xl resize-none" />
                    </FormControl>
                  </FormItem>
                )} />
              </CardContent>
            </Card>

            {/* Constraints + Audience */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <CardContent className="p-6">
                  <FormField control={form.control} name="constraints" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-semibold flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-blue-600" /> Constraints
                      </FormLabel>
                      <FormControl>
                        <Textarea placeholder="Limitations or rules..." rows={3} {...field} className="rounded-xl resize-none" />
                      </FormControl>
                    </FormItem>
                  )} />
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-6">
                  <FormField control={form.control} name="audience" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-semibold flex items-center gap-2">
                        <Users className="w-4 h-4 text-blue-600" /> Audience
                      </FormLabel>
                      <FormControl>
                        <Textarea placeholder="Target audience..." rows={3} {...field} className="rounded-xl resize-none" />
                      </FormControl>
                    </FormItem>
                  )} />
                </CardContent>
              </Card>
            </div>

            {/* Examples + Optional */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <CardContent className="p-6">
                  <FormField control={form.control} name="examples" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-semibold flex items-center gap-2">
                        <Lightbulb className="w-4 h-4 text-blue-600" /> Examples
                      </FormLabel>
                      <FormControl>
                        <Textarea placeholder="Example outputs or formats..." rows={3} {...field} className="rounded-xl resize-none" />
                      </FormControl>
                    </FormItem>
                  )} />
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-6">
                  <FormField control={form.control} name="optional" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-semibold flex items-center gap-2">
                        <Star className="w-4 h-4 text-blue-600" /> Optional
                      </FormLabel>
                      <FormControl>
                        <Textarea placeholder="Additional notes..." rows={3} {...field} className="rounded-xl resize-none" />
                      </FormControl>
                    </FormItem>
                  )} />
                </CardContent>
              </Card>
            </div>

            {/* AI Engine */}
            <Card>
              <CardContent className="p-6 space-y-3">
                <div className="flex items-center gap-2">
                  <Bot className="w-5 h-5 text-blue-600" />
                  <h3 className="font-semibold text-gray-900">Default AI Engine</h3>
                  <span className="text-xs text-gray-400">(optional)</span>
                </div>
                <ModelPicker
                  provider={form.watch("aiProvider") ?? ""}
                  model={form.watch("aiModel") ?? ""}
                  onProviderChange={v => form.setValue("aiProvider", v)}
                  onModelChange={v => form.setValue("aiModel", v)}
                  providerPlaceholder="Select provider"
                  modelPlaceholder="Select model"
                />
              </CardContent>
            </Card>

            {/* Local folder */}
            <Card>
              <CardContent className="p-6">
                <FormField control={form.control} name="localFolderPath" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-semibold flex items-center gap-2">
                      <FolderOpen className="w-4 h-4 text-blue-600" /> Local Folder Path
                      <span className="text-gray-400 font-normal">(optional)</span>
                    </FormLabel>
                    <FormControl>
                      <Input
                        placeholder="/Users/you/projects/smartkyc"
                        {...field}
                        className="rounded-xl font-mono text-sm"
                        onBlur={(e) => {
                          // Strip surrounding shell quotes and whitespace (e.g. pasted as 'path' or "path")
                          const cleaned = e.target.value.trim().replace(/^(['"])(.*)\1$/, "$2").trim();
                          field.onChange(cleaned);
                          field.onBlur();
                        }}
                      />
                    </FormControl>
                    <p className="text-xs text-gray-400 mt-1">
                      Absolute path to a local folder. Paste the path — surrounding quotes are stripped automatically.
                    </p>
                    <FormMessage />
                  </FormItem>
                )} />
              </CardContent>
            </Card>

            <div className="flex justify-end pt-2">
              <Button
                type="submit"
                disabled={createMutation.isPending}
                className="px-8 py-3 gradient-bg text-white rounded-xl font-medium hover:shadow-lg transition-all"
              >
                {createMutation.isPending ? "Creating..." : "Create Project"}
              </Button>
            </div>
          </form>
        </Form>
      </div>
    </div>
  );
}
