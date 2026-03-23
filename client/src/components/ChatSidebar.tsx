import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Brain, Plus, Settings, LogOut, Search, MessageCircle,
  FolderOpen, ChevronDown, ChevronRight, FolderPlus,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import type { Chat, Project } from "@/types";

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
  isLoading,
}: ChatSidebarProps) {
  const { user: rawUser } = useAuth();
  const user = rawUser as import("@/types").User | undefined;
  const [, navigate] = useLocation();
  const [searchTerm, setSearchTerm] = useState("");
  const [collapsedProjects, setCollapsedProjects] = useState<Set<number>>(new Set());

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  const toggleProject = (id: number) => {
    setCollapsedProjects(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'researcher':        return <i className="fas fa-search text-white text-sm"></i>;
      case 'product_manager':   return <i className="fas fa-chart-line text-white text-sm"></i>;
      case 'developer':         return <i className="fas fa-code text-white text-sm"></i>;
      case 'content_writer':    return <i className="fas fa-pen-fancy text-white text-sm"></i>;
      case 'designer':          return <i className="fas fa-palette text-white text-sm"></i>;
      default:                  return <MessageCircle className="w-4 h-4 text-white" />;
    }
  };

  const formatTimeAgo = (date: Date) => {
    const diff = Date.now() - new Date(date).getTime();
    const days    = Math.floor(diff / 86400000);
    const hours   = Math.floor(diff / 3600000);
    const minutes = Math.floor(diff / 60000);
    if (days > 0)    return `${days}d ago`;
    if (hours > 0)   return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return 'Just now';
  };

  const filterText = searchTerm.toLowerCase();

  // Partition chats: project-bound vs standalone
  const projectIds = new Set(projects.map(p => p.id));
  const standalonChats = chats.filter(c =>
    !c.projectId &&
    (filterText === '' || c.title.toLowerCase().includes(filterText))
  );

  const renderChatRow = (chat: Chat) => (
    <div
      key={chat.id}
      onClick={() => onChatSelect(chat.id)}
      className={`p-2.5 rounded-xl cursor-pointer transition-all duration-150 border ${
        currentChatId === chat.id
          ? 'border-blue-500 bg-blue-50'
          : 'border-gray-100 hover:bg-gray-50'
      }`}
    >
      <div className="flex items-center space-x-2">
        <div className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 role-${chat.role.replace('_', '-')}`}>
          {getRoleIcon(chat.role)}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 truncate">{chat.title}</p>
          {chat.lastMessage && (
            <p className="text-xs text-gray-400 truncate">{chat.lastMessage}</p>
          )}
        </div>
        <span className="text-xs text-gray-300 shrink-0">
          {formatTimeAgo(chat.lastMessageTime || chat.updatedAt)}
        </span>
      </div>
    </div>
  );

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

      {/* Action buttons */}
      <div className="p-4 space-y-2">
        <Button
          onClick={() => navigate("/projects/new")}
          className="w-full gradient-bg text-white hover:shadow-lg transition-all duration-200 flex items-center justify-center space-x-2"
        >
          <FolderPlus className="w-4 h-4" />
          <span>New Project</span>
        </Button>
        <Button
          onClick={onNewChat}
          variant="outline"
          className="w-full flex items-center justify-center space-x-2"
        >
          <Plus className="w-4 h-4" />
          <span>Quick Chat</span>
        </Button>
      </div>

      {/* Search */}
      <div className="px-4 pb-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
          />
        </div>
      </div>

      <ScrollArea className="flex-1 px-3 pb-4">
        {isLoading ? (
          <div className="space-y-2">
            {Array(4).fill(0).map((_, i) => (
              <div key={i} className="p-3 rounded-xl border border-gray-100">
                <div className="flex items-center space-x-3">
                  <Skeleton className="w-7 h-7 rounded-md" />
                  <div className="flex-1">
                    <Skeleton className="h-4 w-3/4 mb-1" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-1">
            {/* Project groups */}
            {projects
              .filter(p =>
                filterText === '' ||
                p.name.toLowerCase().includes(filterText) ||
                (p.chats ?? []).some(c => c.title.toLowerCase().includes(filterText))
              )
              .map(project => {
                const projectChats = (project.chats ?? []).filter(c =>
                  filterText === '' || c.title.toLowerCase().includes(filterText)
                );
                const isCollapsed = collapsedProjects.has(project.id);

                return (
                  <div key={project.id} className="mb-2">
                    {/* Project header */}
                    <div
                      className="flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-gray-50 cursor-pointer group"
                      onClick={() => toggleProject(project.id)}
                    >
                      <div className="flex items-center space-x-2 min-w-0">
                        {isCollapsed
                          ? <ChevronRight className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                          : <ChevronDown className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                        }
                        <FolderOpen className="w-4 h-4 text-blue-500 shrink-0" />
                        <span
                          className="text-sm font-semibold text-gray-700 truncate"
                          title={project.name}
                        >
                          {project.name}
                        </span>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/projects/${project.id}`);
                        }}
                        className="opacity-0 group-hover:opacity-100 text-xs text-blue-500 hover:text-blue-700 shrink-0 ml-1"
                      >
                        Open
                      </button>
                    </div>

                    {/* Chats under project */}
                    {!isCollapsed && (
                      <div className="ml-5 mt-1 space-y-1">
                        {projectChats.map(renderChatRow)}
                        <button
                          onClick={() => navigate(`/projects/${project.id}/chat/new`)}
                          className="w-full flex items-center space-x-1.5 px-2.5 py-1.5 text-xs text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>New Chat</span>
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}

            {/* Standalone chats divider */}
            {standalonChats.length > 0 && (
              <>
                {projects.length > 0 && (
                  <div className="flex items-center gap-2 py-1 px-1">
                    <div className="h-px flex-1 bg-gray-200" />
                    <span className="text-xs text-gray-400">Quick Chats</span>
                    <div className="h-px flex-1 bg-gray-200" />
                  </div>
                )}
                <div className="space-y-1">
                  {standalonChats.map(renderChatRow)}
                </div>
              </>
            )}

            {/* Empty state */}
            {projects.length === 0 && standalonChats.length === 0 && (
              <div className="text-center py-10">
                <FolderOpen className="w-10 h-10 text-gray-200 mx-auto mb-2" />
                <p className="text-sm text-gray-400">No projects yet</p>
                <p className="text-xs text-gray-300 mt-1">Create a project to get started</p>
              </div>
            )}
          </div>
        )}
      </ScrollArea>

      {/* User Profile */}
      <div className="p-4 border-t border-gray-200">
        <div className="flex items-center space-x-3">
          <img
            src={user?.profileImageUrl || `https://ui-avatars.com/api/?name=${user?.firstName || 'User'}&background=6366f1&color=fff`}
            alt="User"
            className="w-9 h-9 rounded-full object-cover border-2 border-gray-200"
          />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">
              {`${user?.firstName || ''} ${user?.lastName || ''}`.trim() || 'User'}
            </p>
            <p className="text-xs text-gray-400 truncate">{user?.email}</p>
          </div>
          <div className="flex space-x-1">
            <Button onClick={() => navigate("/settings")} variant="ghost" size="sm" className="p-2">
              <Settings className="w-4 h-4 text-gray-400" />
            </Button>
            <Button onClick={() => { window.location.href = "/api/logout"; }} variant="ghost" size="sm" className="p-2">
              <LogOut className="w-4 h-4 text-gray-400" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
