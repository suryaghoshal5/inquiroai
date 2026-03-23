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
import { ArrowLeft, Brain } from "lucide-react";
import type { Chat, Message } from "@/types";

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
  const autoArchiveTriggered = useRef(false);

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

  const sendMessageMutation = useMutation({
    mutationFn: async (content: string) => {
      const body: { content: string; modelOverride?: string } = { content };
      if (modelOverride) body.modelOverride = modelOverride;
      const response = await apiRequest("POST", `/api/chats/${chatId}/messages`, body);
      return response.json();
    },
    onSuccess: (data) => {
      // Store evaluation + recommendation for the banner
      if (data.evaluation) setLastEvaluation(data.evaluation);
      if (data.recommendation) setLastRecommendation(data.recommendation);
      if (data.context_status) setContextStatus(data.context_status);
      // Clear override after use
      setModelOverride(null);
      // Invalidate chat messages to refetch
      queryClient.invalidateQueries({ queryKey: [`/api/chats/${chatId}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/chats"] });
    },
    onError: (error: any) => {
      console.log("Chat error:", error);
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
      
      // Handle API key errors specifically
      if (error.message && error.message.includes("API key")) {
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
        description: "Failed to send message. Please try again.",
        variant: "destructive",
      });
    },
  });

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
        messages.length > 5
      ) {
        autoArchiveTriggered.current = true;
        // Fire-and-forget — don't block navigation
        apiRequest("POST", `/api/chats/${chatId}/archive`, {}).catch(() => {});
      }
    };
  }, [chatId, chatData]);

  const handleSendMessage = (content: string) => {
    setLastEvaluation(null);
    setLastRecommendation(null);
    sendMessageMutation.mutate(content);
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
      {/* Sidebar */}
      <ChatSidebar
        chats={chats || []}
        onChatSelect={handleChatSelect}
        onNewChat={handleNewChat}
        currentChatId={chatId}
      />

      {/* Chat Interface */}
      <ChatInterface
        chat={chatData.chat}
        messages={chatData.messages}
        onSendMessage={handleSendMessage}
        isLoading={sendMessageMutation.isPending}
        lastEvaluation={lastEvaluation}
        lastRecommendation={lastRecommendation}
        onModelOverride={setModelOverride}
        currentModelOverride={modelOverride}
        contextStatus={contextStatus}
        onArchive={() => archiveMutation.mutate()}
        isArchiving={archiveMutation.isPending}
      />
    </div>
  );
}
