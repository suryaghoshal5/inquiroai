import { useState, useEffect } from "react";
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

export default function ChatPage() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { isAuthenticated, isLoading } = useAuth();
  const queryClient = useQueryClient();
  const [ws, setWs] = useState<WebSocket | null>(null);

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

  // WebSocket connection
  useEffect(() => {
    if (isAuthenticated && chatId) {
      // Use correct WebSocket URL - always use the same protocol and host as the current page
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${protocol}//${window.location.host}/ws`;
      console.log("Connecting to WebSocket:", wsUrl);
      console.log("Current location:", window.location.href);
      
      try {
        const socket = new WebSocket(wsUrl);

      socket.onopen = () => {
        console.log("WebSocket connected");
        socket.send(JSON.stringify({
          type: "join_chat",
          chatId: chatId,
          userId: "dev-user"
        }));
      };

      socket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === "typing") {
          // Handle typing indicators
          console.log("Typing indicator:", data);
        }
        if (data.type === "message") {
          // Handle new message
          console.log("New message received:", data.message);
          // Invalidate queries to refresh the chat
          queryClient.invalidateQueries({ queryKey: [`/api/chats/${chatId}`] });
          queryClient.invalidateQueries({ queryKey: ["/api/chats"] });
        }
        if (data.type === "error") {
          // Handle error
          console.error("WebSocket error:", data.message);
          toast({
            title: "Error",
            description: data.message,
            variant: "destructive",
          });
        }
      };

      socket.onclose = () => {
        console.log("WebSocket disconnected");
      };

      socket.onerror = (error) => {
        console.error("WebSocket error:", error);
      };

        setWs(socket);

        return () => {
          socket.close();
        };
      } catch (error) {
        console.error("Failed to create WebSocket connection:", error);
        toast({
          title: "Connection Error",
          description: "Failed to establish WebSocket connection",
          variant: "destructive",
        });
      }
    }
  }, [isAuthenticated, chatId]);

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

  const [isMessageSending, setIsMessageSending] = useState(false);

  const handleSendMessage = (content: string) => {
    if (!ws || !isAuthenticated || isMessageSending) return;
    
    console.log("Sending message via WebSocket:", content);
    setIsMessageSending(true);
    
    // Send message via WebSocket
    const messageData = {
      type: "chat_message",
      chatId: chatId,
      content: content,
      userId: "dev-user" // Use the mock user ID
    };
    
    console.log("WebSocket message data:", messageData);
    ws.send(JSON.stringify(messageData));
    
    // Reset sending state after a short delay
    setTimeout(() => {
      setIsMessageSending(false);
    }, 1000);
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
        isLoading={isMessageSending}
        ws={ws}
      />
    </div>
  );
}
