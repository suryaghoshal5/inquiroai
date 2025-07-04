import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Brain, Plus, Settings, LogOut, Search, MessageCircle } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useLocation } from "wouter";
import type { Chat } from "@/types";

interface ChatSidebarProps {
  chats: Chat[];
  onChatSelect: (chatId: number) => void;
  onNewChat: () => void;
  currentChatId?: number;
  isLoading?: boolean;
}

export default function ChatSidebar({ 
  chats, 
  onChatSelect, 
  onNewChat, 
  currentChatId,
  isLoading 
}: ChatSidebarProps) {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [searchTerm, setSearchTerm] = useState("");

  const filteredChats = chats.filter(chat =>
    chat.title.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'researcher':
        return <i className="fas fa-search text-white text-sm"></i>;
      case 'product_manager':
        return <i className="fas fa-chart-line text-white text-sm"></i>;
      case 'developer':
        return <i className="fas fa-code text-white text-sm"></i>;
      case 'content_writer':
        return <i className="fas fa-pen-fancy text-white text-sm"></i>;
      case 'designer':
        return <i className="fas fa-palette text-white text-sm"></i>;
      case 'custom':
        return <i className="fas fa-plus text-white text-sm"></i>;
      default:
        return <MessageCircle className="w-4 h-4 text-white" />;
    }
  };

  const formatTimeAgo = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - new Date(date).getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor(diff / (1000 * 60));

    if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
    if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
    return 'Just now';
  };

  const handleSettings = () => {
    navigate("/settings");
  };

  const handleLogout = () => {
    window.location.href = "/api/logout";
  };

  return (
    <div className="w-80 bg-white shadow-lg border-r border-gray-200 flex flex-col">
      {/* Header */}
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 gradient-bg rounded-xl flex items-center justify-center">
            <Brain className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">InquiroAI</h1>
            <p className="text-sm text-gray-500">Intelligent Conversations</p>
          </div>
        </div>
      </div>

      {/* New Chat Button */}
      <div className="p-4">
        <Button
          onClick={onNewChat}
          className="w-full gradient-bg text-white hover:shadow-lg transition-all duration-200 flex items-center justify-center space-x-2"
        >
          <Plus className="w-4 h-4" />
          <span>New Chat</span>
        </Button>
      </div>

      {/* Search */}
      <div className="px-4 pb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search chats..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all duration-200"
          />
        </div>
      </div>

      {/* Chat List */}
      <ScrollArea className="flex-1 px-4 pb-4">
        <div className="space-y-2">
          {isLoading ? (
            Array(5).fill(0).map((_, i) => (
              <div key={i} className="p-3 rounded-xl border border-gray-100">
                <div className="flex items-center space-x-3">
                  <Skeleton className="w-8 h-8 rounded-lg" />
                  <div className="flex-1">
                    <Skeleton className="h-4 w-3/4 mb-1" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                </div>
              </div>
            ))
          ) : filteredChats.length > 0 ? (
            filteredChats.map((chat) => (
              <div
                key={chat.id}
                onClick={() => onChatSelect(chat.id)}
                className={`p-3 rounded-xl cursor-pointer transition-all duration-200 border ${
                  currentChatId === chat.id
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-100 hover:bg-gray-50'
                }`}
              >
                <div className="flex items-center space-x-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center role-${chat.role.replace('_', '-')}`}>
                    {getRoleIcon(chat.role)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {chat.title}
                    </p>
                    {chat.lastMessage && (
                      <p className="text-xs text-gray-500 truncate">
                        {chat.lastMessage}
                      </p>
                    )}
                  </div>
                </div>
                <div className="mt-2 text-xs text-gray-400">
                  {formatTimeAgo(chat.lastMessageTime || chat.updatedAt)}
                </div>
              </div>
            ))
          ) : (
            <div className="text-center py-8">
              <MessageCircle className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 text-sm">
                {searchTerm ? 'No chats found' : 'No chats yet'}
              </p>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* User Profile */}
      <div className="p-4 border-t border-gray-200">
        <div className="flex items-center space-x-3">
          <img
            src={user?.profileImageUrl || `https://ui-avatars.com/api/?name=${user?.firstName || 'User'}&background=6366f1&color=fff`}
            alt="User profile"
            className="w-10 h-10 rounded-full object-cover border-2 border-gray-200"
          />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">
              {user?.firstName || user?.lastName ? `${user?.firstName || ''} ${user?.lastName || ''}`.trim() : 'User'}
            </p>
            <p className="text-xs text-gray-500 truncate">
              {user?.email}
            </p>
          </div>
          <div className="flex space-x-1">
            <Button
              onClick={handleSettings}
              variant="ghost"
              size="sm"
              className="p-2 hover:bg-gray-100 rounded-lg"
            >
              <Settings className="w-4 h-4 text-gray-500" />
            </Button>
            <Button
              onClick={handleLogout}
              variant="ghost"
              size="sm"
              className="p-2 hover:bg-gray-100 rounded-lg"
            >
              <LogOut className="w-4 h-4 text-gray-500" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
