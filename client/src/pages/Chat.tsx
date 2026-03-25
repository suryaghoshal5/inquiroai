import { useState, useEffect, useRef } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { isUnauthorizedError } from "@/lib/authUtils";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import ChatInterface from "@/components/ChatInterface";
import ChatSidebar from "@/components/ChatSidebar";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { ArrowLeft, Brain, Menu } from "lucide-react";
import type { Chat, Message, Project } from "@/types";

// Auto-archive a chat when navigating away if it has at least this many messages
const AUTO_ARCHIVE_MIN_MESSAGES = 5;

export interface EvaluationData {
  score: number;
  issues: string[];
  improved_prompt: string;
  prompt_type: string;
  complexity: string;
  show_suggestion: boolean;
}

export interface RecommendationData {
  model: string;
  display_name: string;
  reasoning: string;
  estimated_cost_per_1k_tokens: number;
}

export interface ContextStatus {
  current_tokens: number;
  limit_tokens: number;
  compression_count: number;
  was_compressed: boolean;
}

export default function ChatPage() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { isAuthenticated, isLoading } = useAuth();
  const queryClient = useQueryClient();
  const [lastEvaluation, setLastEvaluation] = useState<EvaluationData | null>(null);
  const [lastRecommendation, setLastRecommendation] = useState<RecommendationData | null>(null);
  const [modelOverride, setModelOverride] = useState<string | null>(null);
  const [contextStatus, setContextStatus] = useState<ContextStatus | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState<string | null>(null);
  const [obsidianVaultConfigured, setObsidianVaultConfigured] = useState(false);
  const autoArchiveTriggered = useRef(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const chatId = parseInt(id || "0");

  // Redirect if not authenticated
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
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
  }, [isAuthenticated, isLoading, toast]);



  const { data: chatData, isLoading: chatLoading } = useQuery({
    queryKey: [`/api/chats/${chatId}`],
    enabled: isAuthenticated && !!chatId,
    retry: false,
  });

  const { data: chats } = useQuery<Chat[]>({
    queryKey: ["/api/chats"],
    enabled: isAuthenticated,
    retry: false,
  });

  // Load vault config status once
  useEffect(() => {
    if (!isAuthenticated) return;
    apiRequest("GET", "/api/user/settings")
      .then(r => r.json())
      .then((data: { obsidianVaultPath?: string }) => setObsidianVaultConfigured(!!data.obsidianVaultPath))
      .catch(() => {});
  }, [isAuthenticated]);

  const projectId = (chatData as any)?.chat?.projectId;
  const { data: projectData } = useQuery<Project>({
    queryKey: [`/api/projects/${projectId}`],
    enabled: isAuthenticated && !!projectId,
    retry: false,
  });

  const streamMessage = async (content: string) => {
    setIsStreaming(true);
    setStreamingContent(''); // empty string = show typing dots while waiting for first token
    setLastEvaluation(null);
    setLastRecommendation(null);

    try {
      const body: { content: string; modelOverride?: string } = { content };
      if (modelOverride) body.modelOverride = modelOverride;

      const response = await fetch(`/api/chats/${chatId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const text = await response.text();
        let msg = `${response.status}: Failed to send message`;
        try { msg = JSON.parse(text).message || msg; } catch { /* use default */ }
        if (response.status === 401) {
          toast({ title: "Unauthorized", description: "You are logged out. Logging in again...", variant: "destructive" });
          setTimeout(() => { window.location.href = "/api/login"; }, 500);
          return;
        }
        throw new Error(msg);
      }

      if (!response.body) throw new Error('No response body');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const jsonStr = line.slice(6).trim();
          if (!jsonStr) continue;

          let event: any;
          try { event = JSON.parse(jsonStr); } catch { continue; }

          if (event.type === 'metadata') {
            if (event.evaluation) setLastEvaluation(event.evaluation);
            if (event.recommendation) setLastRecommendation(event.recommendation);
            if (event.context_status) setContextStatus(event.context_status);
            setModelOverride(null);
          } else if (event.type === 'token') {
            setStreamingContent(prev => (prev ?? '') + event.token);
          } else if (event.type === 'done') {
            setStreamingContent(null);
            queryClient.invalidateQueries({ queryKey: [`/api/chats/${chatId}`] });
            queryClient.invalidateQueries({ queryKey: ["/api/chats"] });
          } else if (event.type === 'error') {
            throw new Error(event.error || 'Stream error');
          }
        }
      }
    } catch (error: any) {
      setStreamingContent(null);
      console.error("Stream error:", error);

      if (error.message?.includes("API key")) {
        toast({
          title: "API Key Required",
          description: "Please add your API key in settings to continue chatting.",
          variant: "destructive",
          action: (
            <Button onClick={() => navigate("/settings")} size="sm">
              Go to Settings
            </Button>
          ),
        });
        return;
      }

      toast({
        title: "Error",
        description: error.message || "Failed to send message. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsStreaming(false);
    }
  };

  const archiveMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/chats/${chatId}/archive`, {});
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [`/api/chats/${chatId}`] });
      toast({
        title: "Archived to Memory",
        description: `"${data.title}" saved to Notion${data.type ? ` · ${data.type}` : ""}`,
      });
    },
    onError: () => {
      toast({
        title: "Archive failed",
        description: "Could not archive to Notion. Check NOTION_API_KEY in settings.",
        variant: "destructive",
      });
    },
  });

  const extractGraphMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/chats/${chatId}/extract-graph`, {});
      return response.json();
    },
    onSuccess: (data) => {
      const total = (data.entities_created ?? 0) + (data.entities_updated ?? 0);
      if (!data.vault_configured) {
        toast({
          title: "Vault not configured",
          description: "Entities extracted but no vault path set. Go to Settings → Preferences to configure Obsidian.",
          variant: "destructive",
        });
        return;
      }
      const typeCounts = (data.entities as Array<{ type: string }>)?.reduce(
        (acc: Record<string, number>, e) => {
          acc[e.type] = (acc[e.type] ?? 0) + 1;
          return acc;
        },
        {}
      ) ?? {};
      const summary = Object.entries(typeCounts)
        .map(([t, n]) => `${n} ${t.replace('_', ' ')}`)
        .join(', ');
      toast({
        title: `Extracted ${total} ${total === 1 ? 'entity' : 'entities'}`,
        description: summary || "Knowledge graph updated",
      });
    },
    onError: () => {
      toast({
        title: "Extraction failed",
        description: "Could not extract knowledge graph. Try again.",
        variant: "destructive",
      });
    },
  });

  // Auto-archive: when user navigates away from a chat with >5 messages that hasn't been archived
  useEffect(() => {
    return () => {
      const chat = (chatData as any)?.chat;
      const messages = (chatData as any)?.messages;
      if (
        !autoArchiveTriggered.current &&
        chat &&
        !chat.archivedAt &&
        messages &&
        messages.length > AUTO_ARCHIVE_MIN_MESSAGES
      ) {
        autoArchiveTriggered.current = true;
        // Fire-and-forget — don't block navigation
        apiRequest("POST", `/api/chats/${chatId}/archive`, {}).catch(() => {});
      }
    };
  }, [chatId, chatData]);

  const handleSendMessage = (content: string) => {
    streamMessage(content);
  };

  const handleChatSelect = (chatId: number) => {
    navigate(`/chat/${chatId}`);
  };

  const handleNewChat = () => {
    navigate("/chat/new");
  };

  const handleBack = () => {
    navigate("/");
  };

  if (isLoading || chatLoading) {
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

  if (!chatData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="w-16 h-16 bg-red-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <i className="fas fa-exclamation-circle text-red-600 text-2xl"></i>
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Chat not found</h2>
          <p className="text-gray-600 mb-4">The chat you're looking for doesn't exist.</p>
          <Button onClick={handleBack} variant="outline">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Dashboard
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar — desktop only */}
      <div className="hidden md:block">
        <ChatSidebar
          chats={chats || []}
          onChatSelect={handleChatSelect}
          onNewChat={handleNewChat}
          currentChatId={chatId}
        />
      </div>

      {/* Mobile sidebar via Sheet */}
      <div className="md:hidden absolute top-3 left-3 z-50">
        <Sheet open={mobileSidebarOpen} onOpenChange={setMobileSidebarOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="sm" className="p-2">
              <Menu className="w-5 h-5 text-gray-600" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="p-0 w-80">
            <ChatSidebar
              chats={chats || []}
              onChatSelect={(id) => { handleChatSelect(id); setMobileSidebarOpen(false); }}
              onNewChat={() => { handleNewChat(); setMobileSidebarOpen(false); }}
              currentChatId={chatId}
            />
          </SheetContent>
        </Sheet>
      </div>

      {/* Chat Interface */}
      <ChatInterface
        chat={chatData.chat}
        messages={chatData.messages}
        onSendMessage={handleSendMessage}
        isLoading={isStreaming}
        streamingMessage={streamingContent}
        lastEvaluation={lastEvaluation}
        lastRecommendation={lastRecommendation}
        onModelOverride={setModelOverride}
        currentModelOverride={modelOverride}
        contextStatus={contextStatus}
        onArchive={() => archiveMutation.mutate()}
        isArchiving={archiveMutation.isPending}
        onExtractGraph={() => extractGraphMutation.mutate()}
        isExtractingGraph={extractGraphMutation.isPending}
        obsidianVaultConfigured={obsidianVaultConfigured}
        projectName={projectData?.name}
        projectId={projectData?.id}
        projectLocalFolderPath={projectData?.localFolderPath}
      />
    </div>
  );
}
