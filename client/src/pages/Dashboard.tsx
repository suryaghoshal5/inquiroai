import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { isUnauthorizedError } from "@/lib/authUtils";
import { useToast } from "@/hooks/use-toast";
import ChatSidebar from "@/components/ChatSidebar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Brain, Plus, MessageCircle, Settings, Sparkles } from "lucide-react";
import type { Chat } from "@/types";

export default function Dashboard() {
  const [, navigate] = useLocation();
  const { user, isAuthenticated, isLoading } = useAuth();
  const { toast } = useToast();

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

  const { data: chats, isLoading: chatsLoading } = useQuery<Chat[]>({
    queryKey: ["/api/chats"],
    enabled: isAuthenticated,
    retry: false,
  });

  const handleNewChat = () => {
    navigate("/chat/new");
  };

  const handleChatSelect = (chatId: number) => {
    navigate(`/chat/${chatId}`);
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

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <ChatSidebar
        chats={chats || []}
        onChatSelect={handleChatSelect}
        onNewChat={handleNewChat}
        isLoading={chatsLoading}
      />

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="bg-white shadow-sm border-b border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
              <p className="text-gray-600">Welcome back, {user?.firstName || user?.email}!</p>
            </div>
            <div className="flex items-center space-x-4">
              <Button
                variant="outline"
                onClick={() => navigate("/settings")}
                className="flex items-center space-x-2"
              >
                <Settings className="w-4 h-4" />
                <span>Settings</span>
              </Button>
              <Button
                onClick={handleNewChat}
                className="gradient-bg text-white flex items-center space-x-2"
              >
                <Plus className="w-4 h-4" />
                <span>New Chat</span>
              </Button>
            </div>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 overflow-y-auto p-8">
          {chats && chats.length > 0 ? (
            <div className="max-w-6xl mx-auto">
              <div className="mb-8">
                <h2 className="text-xl font-semibold text-gray-900 mb-4">Recent Conversations</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {chats.slice(0, 6).map((chat) => (
                    <Card 
                      key={chat.id} 
                      className="cursor-pointer hover:shadow-lg transition-shadow duration-200 group"
                      onClick={() => handleChatSelect(chat.id)}
                    >
                      <CardContent className="p-6">
                        <div className="flex items-start space-x-3">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center role-${chat.role.replace('_', '-')}`}>
                            {chat.role === 'researcher' && <i className="fas fa-search text-white text-sm"></i>}
                            {chat.role === 'product_manager' && <i className="fas fa-chart-line text-white text-sm"></i>}
                            {chat.role === 'developer' && <i className="fas fa-code text-white text-sm"></i>}
                            {chat.role === 'content_writer' && <i className="fas fa-pen-fancy text-white text-sm"></i>}
                            {chat.role === 'designer' && <i className="fas fa-palette text-white text-sm"></i>}
                            {chat.role === 'custom' && <i className="fas fa-plus text-white text-sm"></i>}
                          </div>
                          <div className="flex-1 min-w-0">
                            <h3 className="font-semibold text-gray-900 truncate group-hover:text-blue-600 transition-colors">
                              {chat.title}
                            </h3>
                            {chat.lastMessage && (
                              <p className="text-sm text-gray-500 truncate mt-1">
                                {chat.lastMessage}
                              </p>
                            )}
                            <p className="text-xs text-gray-400 mt-2">
                              {chat.lastMessageTime ? new Date(chat.lastMessageTime).toLocaleDateString() : new Date(chat.updatedAt).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>

              {/* Quick Actions */}
              <div className="mb-8">
                <h2 className="text-xl font-semibold text-gray-900 mb-4">Quick Actions</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Card className="cursor-pointer hover:shadow-lg transition-shadow duration-200" onClick={handleNewChat}>
                    <CardContent className="p-6 text-center">
                      <div className="w-12 h-12 gradient-bg rounded-xl flex items-center justify-center mx-auto mb-4">
                        <Plus className="w-6 h-6 text-white" />
                      </div>
                      <h3 className="font-semibold text-gray-900">New Chat</h3>
                      <p className="text-sm text-gray-500 mt-1">Start a new AI conversation</p>
                    </CardContent>
                  </Card>

                  <Card className="cursor-pointer hover:shadow-lg transition-shadow duration-200" onClick={() => navigate("/settings")}>
                    <CardContent className="p-6 text-center">
                      <div className="w-12 h-12 role-developer rounded-xl flex items-center justify-center mx-auto mb-4">
                        <Settings className="w-6 h-6 text-white" />
                      </div>
                      <h3 className="font-semibold text-gray-900">Settings</h3>
                      <p className="text-sm text-gray-500 mt-1">Manage API keys and preferences</p>
                    </CardContent>
                  </Card>

                  <Card className="cursor-pointer hover:shadow-lg transition-shadow duration-200">
                    <CardContent className="p-6 text-center">
                      <div className="w-12 h-12 role-writer rounded-xl flex items-center justify-center mx-auto mb-4">
                        <Sparkles className="w-6 h-6 text-white" />
                      </div>
                      <h3 className="font-semibold text-gray-900">Templates</h3>
                      <p className="text-sm text-gray-500 mt-1">Browse conversation templates</p>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </div>
          ) : (
            /* Empty State */
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center max-w-md">
                <div className="w-20 h-20 gradient-bg rounded-2xl flex items-center justify-center mx-auto mb-6 animate-float">
                  <MessageCircle className="w-10 h-10 text-white" />
                </div>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">Start Your First Conversation</h2>
                <p className="text-gray-600 mb-6">
                  Create your first AI chat with customizable parameters and start having intelligent conversations.
                </p>
                <Button
                  onClick={handleNewChat}
                  size="lg"
                  className="gradient-bg text-white hover:shadow-lg transition-all duration-200"
                >
                  <Plus className="w-5 h-5 mr-2" />
                  Create New Chat
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
