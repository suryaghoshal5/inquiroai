import { useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { isUnauthorizedError } from "@/lib/authUtils";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import NewChatForm from "@/components/NewChatForm";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Brain, FolderOpen } from "lucide-react";
import type { ChatConfig, Project } from "@/types";

export default function NewChat() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { isAuthenticated, isLoading } = useAuth();
  const [selectedProjectId, setSelectedProjectId] = useState<string>("none");

  const { data: projects } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
    enabled: isAuthenticated,
  });

  const createChatMutation = useMutation({
    mutationFn: async (config: ChatConfig) => {
      try {
        const response = await apiRequest("POST", "/api/chats", config);
        const data = await response.json();
        console.log("Chat creation successful:", data);
        return data;
      } catch (error) {
        console.error("Chat creation failed:", error);
        throw error;
      }
    },
    onSuccess: (chat) => {
      toast({
        title: "Chat Created",
        description: "Your new chat has been created successfully.",
      });
      navigate(`/chat/${chat.id}`);
    },
    onError: (error) => {
      console.error("Chat creation error:", error);
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }
      toast({
        title: "Error",
        description: `Failed to create chat: ${error.message || "Please try again."}`,
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (config: ChatConfig) => {
    const projectId = selectedProjectId && selectedProjectId !== "none" ? parseInt(selectedProjectId) : undefined;
    createChatMutation.mutate({ ...config, projectId });
  };

  const handleBack = () => {
    navigate("/chat");
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="w-16 h-16 gradient-bg rounded-2xl flex items-center justify-center mx-auto mb-4 animate-pulse">
            <Brain className="w-8 h-8 text-white" />
          </div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="w-16 h-16 gradient-bg rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Brain className="w-8 h-8 text-white" />
          </div>
          <p className="text-gray-600">Please log in to continue</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200 p-6">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Button
              variant="outline"
              onClick={handleBack}
              className="flex items-center space-x-2"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back</span>
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Create New Chat</h1>
              <p className="text-gray-600">Configure your AI conversation parameters</p>
            </div>
          </div>
          {projects && projects.length > 0 && (
            <div className="flex items-center gap-2">
              <FolderOpen className="w-4 h-4 text-gray-500" />
              <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
                <SelectTrigger className="w-52">
                  <SelectValue placeholder="Link to project (optional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No project (Quick Chat)</SelectItem>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto p-8">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-8">
            <div className="w-20 h-20 gradient-bg rounded-2xl flex items-center justify-center mx-auto mb-4 animate-float">
              <i className="fas fa-rocket text-white text-3xl"></i>
            </div>
            <h2 className="text-3xl font-bold text-gray-900 mb-2">Create New Chat</h2>
            <p className="text-lg text-gray-600">Configure your AI conversation parameters</p>
          </div>

          <NewChatForm
            onSubmit={handleSubmit}
            isLoading={createChatMutation.isPending}
          />
        </div>
      </div>
    </div>
  );
}
