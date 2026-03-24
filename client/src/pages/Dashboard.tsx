import { useState, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Brain, Plus, MessageCircle, Settings, ArrowRight,
  FolderOpen, ChevronDown, ChevronRight, FolderPlus, Zap,
  Bot, Search, Link2, X,
} from "lucide-react";
import { isUnauthorizedError } from "@/lib/authUtils";
import LinkToProjectModal from "@/components/LinkToProjectModal";
import type { Chat, Project } from "@/types";

interface SearchResult {
  chatId: number;
  chatTitle: string;
  projectId: number | null;
  projectName: string | null;
  matchType: "title" | "message";
  snippet: string;
  updatedAt: string;
}

function Highlight({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-yellow-200 text-yellow-900 rounded-sm px-0.5">{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </>
  );
}

export default function Dashboard() {
  const { isAuthenticated, isLoading, user: rawUser } = useAuth();
  const user = rawUser as import("@/types").User | undefined;
  const [, navigate] = useLocation();
  const [collapsedProjects, setCollapsedProjects] = useState<Set<number>>(new Set());
  const [searchTerm, setSearchTerm] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [debouncedQ, setDebouncedQ] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [linkingChat, setLinkingChat] = useState<Chat | null>(null);

  const handleSearchChange = (val: string) => {
    setSearchTerm(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedQ(val.trim()), 300);
  };

  const { data: searchResults = [] } = useQuery<SearchResult[]>({
    queryKey: ["/api/search", debouncedQ],
    queryFn: async () => {
      if (debouncedQ.length < 2) return [];
      const res = await fetch(`/api/search?q=${encodeURIComponent(debouncedQ)}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: debouncedQ.length >= 2,
    staleTime: 10_000,
  });

  const { data: projects = [], isLoading: projectsLoading } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
    enabled: isAuthenticated,
  });

  const { data: chats = [], isLoading: chatsLoading, error } = useQuery<Chat[]>({
    queryKey: ["/api/chats"],
    enabled: isAuthenticated,
  });

  const toggleProject = (id: number) => {
    setCollapsedProjects(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const formatTimeAgo = (date: Date | string) => {
    const diff = Date.now() - new Date(date).getTime();
    const days = Math.floor(diff / 86400000);
    const hours = Math.floor(diff / 3600000);
    const mins = Math.floor(diff / 60000);
    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (mins > 0) return `${mins}m ago`;
    return "Just now";
  };

  const filterText = searchTerm.toLowerCase();

  // Standalone chats (no project)
  const quickChats = chats.filter(c =>
    !c.projectId &&
    (filterText === "" || c.title.toLowerCase().includes(filterText))
  );

  // Filtered projects
  const filteredProjects = projects.filter(p =>
    filterText === "" ||
    p.name.toLowerCase().includes(filterText) ||
    (p.chats ?? []).some(c => c.title.toLowerCase().includes(filterText))
  );

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

  if (!isAuthenticated) return null;

  if (error && isUnauthorizedError(error)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="w-16 h-16 gradient-bg rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Brain className="w-8 h-8 text-white" />
          </div>
          <p className="text-gray-600 mb-4">Session expired. Please log in again.</p>
          <Button onClick={() => window.location.href = "/api/login"}>Log In</Button>
        </div>
      </div>
    );
  }

  const isLoaded = !projectsLoading && !chatsLoading;
  const hasAnything = projects.length > 0 || quickChats.length > 0;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top nav */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 gradient-bg rounded-xl flex items-center justify-center">
              <Brain className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-900 leading-none">InquiroAI</h1>
              <p className="text-xs text-gray-400 mt-0.5">
                {user ? `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.email : ""}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => navigate("/settings")}>
              <Settings className="w-4 h-4 text-gray-500" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate("/chat/new")}
              className="flex items-center gap-1.5 hover:scale-[1.02] transition-all duration-200"
            >
              <Zap className="w-3.5 h-3.5 text-amber-500" />
              Quick Chat
            </Button>
            <Button
              size="sm"
              onClick={() => navigate("/projects/new")}
              className="gradient-bg text-white flex items-center gap-1.5 hover:scale-[1.02] hover:shadow-md transition-all duration-200"
            >
              <FolderPlus className="w-3.5 h-3.5" />
              New Project
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-8 space-y-8">

        {/* Search — B9 */}
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search projects and chats…"
            value={searchTerm}
            onChange={e => handleSearchChange(e.target.value)}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setTimeout(() => setSearchFocused(false), 150)}
            className="w-full pl-10 pr-9 py-2.5 border border-gray-200 rounded-xl text-sm bg-white shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
          />
          {searchTerm && (
            <button
              onClick={() => { setSearchTerm(""); setDebouncedQ(""); }}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Content search results dropdown */}
          {searchFocused && debouncedQ.length >= 2 && (
            <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-50 max-h-80 overflow-y-auto">
              {searchResults.length === 0 ? (
                <div className="px-4 py-3 text-sm text-gray-400 text-center">No results found</div>
              ) : (
                <>
                  <div className="px-3 py-1.5 text-xs text-gray-400 border-b border-gray-100">
                    {searchResults.length} result{searchResults.length !== 1 ? "s" : ""}
                  </div>
                  {searchResults.map((r) => (
                    <button
                      key={r.chatId}
                      className="w-full text-left px-4 py-3 hover:bg-gray-50 border-b border-gray-50 last:border-0 transition-colors"
                      onMouseDown={() => {
                        setSearchTerm("");
                        setDebouncedQ("");
                        navigate(`/chat/${r.chatId}`);
                      }}
                    >
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          <Highlight text={r.chatTitle} query={debouncedQ} />
                        </p>
                        <span className={`text-xs ml-2 shrink-0 px-1.5 py-0.5 rounded-full ${
                          r.matchType === "title"
                            ? "bg-blue-100 text-blue-700"
                            : "bg-amber-100 text-amber-700"
                        }`}>
                          {r.matchType === "title" ? "title" : "content"}
                        </span>
                      </div>
                      {r.projectName && (
                        <p className="text-xs text-gray-400 mt-0.5">📁 {r.projectName}</p>
                      )}
                      {r.matchType === "message" && (
                        <p className="text-xs text-gray-500 mt-0.5 truncate italic">
                          <Highlight text={r.snippet} query={debouncedQ} />
                        </p>
                      )}
                    </button>
                  ))}
                </>
              )}
            </div>
          )}
        </div>

        {/* Empty state */}
        {isLoaded && !hasAnything && (
          <div className="text-center py-20">
            <div className="w-20 h-20 gradient-bg rounded-3xl flex items-center justify-center mx-auto mb-5">
              <Brain className="w-10 h-10 text-white" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Welcome to InquiroAI</h2>
            <p className="text-gray-500 mb-8 max-w-sm mx-auto">
              Create a project to organise your AI conversations, or jump into a quick one-off chat.
            </p>
            <div className="flex items-center justify-center gap-3">
              <Button onClick={() => navigate("/projects/new")} className="gradient-bg text-white px-6">
                <FolderPlus className="w-4 h-4 mr-2" /> New Project
              </Button>
              <Button variant="outline" onClick={() => navigate("/chat/new")} className="px-6">
                <Zap className="w-4 h-4 mr-2 text-amber-500" /> Quick Chat
              </Button>
            </div>
          </div>
        )}

        {/* Projects section */}
        {(projectsLoading || filteredProjects.length > 0) && (
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-gray-800 flex items-center gap-2">
                <FolderOpen className="w-4 h-4 text-blue-500" /> Projects
                {!projectsLoading && <Badge variant="secondary">{projects.length}</Badge>}
              </h2>
              <Button variant="ghost" size="sm" onClick={() => navigate("/projects/new")} className="text-blue-600 text-xs gap-1">
                <Plus className="w-3.5 h-3.5" /> New Project
              </Button>
            </div>

            {projectsLoading ? (
              <div className="space-y-3">
                {[1, 2].map(i => <Skeleton key={i} className="h-28 rounded-2xl" />)}
              </div>
            ) : (
              <div className="space-y-3">
                {filteredProjects.map(project => {
                  const projectChats = (project.chats ?? []).filter(c =>
                    filterText === "" || c.title.toLowerCase().includes(filterText)
                  );
                  const isCollapsed = collapsedProjects.has(project.id);

                  return (
                    <div key={project.id} className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden transition-all duration-200 hover:ring-1 hover:ring-purple-200 hover:shadow-md">
                      {/* Project header row */}
                      <div
                        className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-gray-50 transition-colors"
                        onClick={() => toggleProject(project.id)}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          {isCollapsed
                            ? <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />
                            : <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
                          }
                          <div className="w-8 h-8 gradient-bg rounded-lg flex items-center justify-center shrink-0">
                            <FolderOpen className="w-4 h-4 text-white" />
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold text-gray-900 truncate">{project.name}</p>
                            {project.description && (
                              <p className="text-xs text-gray-400 truncate">{project.description}</p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 ml-3">
                          <div className="flex items-center gap-1 text-xs text-gray-400">
                            <MessageCircle className="w-3.5 h-3.5" />
                            {projectChats.length}
                          </div>
                          {project.aiModel && (
                            <Badge variant="outline" className="text-xs font-normal hidden sm:flex">
                              <Bot className="w-2.5 h-2.5 mr-1" />{project.aiModel.split("/").pop()}
                            </Badge>
                          )}
                          <button
                            onClick={e => { e.stopPropagation(); navigate(`/projects/${project.id}`); }}
                            className="text-xs text-blue-500 hover:text-blue-700 font-medium px-2 py-0.5 rounded-lg hover:bg-blue-50 transition-colors"
                          >
                            Open
                          </button>
                        </div>
                      </div>

                      {/* Chat rows */}
                      {!isCollapsed && (
                        <div className="border-t border-gray-100">
                          {projectChats.length === 0 ? (
                            <div className="px-5 py-4 text-center">
                              <p className="text-sm text-gray-400">No chats yet</p>
                            </div>
                          ) : (
                            projectChats.map((chat, idx) => (
                              <div
                                key={chat.id}
                                className={`flex items-center justify-between px-5 py-3 hover:bg-gray-50 transition-colors group ${
                                  idx < projectChats.length - 1 ? "border-b border-gray-50" : ""
                                }`}
                              >
                                <div
                                  className="flex items-center gap-3 min-w-0 flex-1 cursor-pointer"
                                  onClick={() => navigate(`/chat/${chat.id}`)}
                                >
                                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 role-${chat.role.replace("_", "-")}`}>
                                    <MessageCircle className="w-3.5 h-3.5 text-white" />
                                  </div>
                                  <div className="min-w-0">
                                    <p className="text-sm font-medium text-gray-800 truncate">{chat.title}</p>
                                    {chat.lastMessage && (
                                      <p className="text-xs text-gray-400 truncate">{chat.lastMessage}</p>
                                    )}
                                  </div>
                                </div>
                                <div className="flex items-center gap-2 shrink-0 ml-3">
                                  <button
                                    onClick={e => { e.stopPropagation(); setLinkingChat(chat); }}
                                    title="Move to another project"
                                    className="opacity-0 group-hover:opacity-100 flex items-center gap-1 text-xs text-gray-400 hover:text-blue-600 px-2 py-1 rounded-lg hover:bg-blue-50 transition-all"
                                  >
                                    <Link2 className="w-3 h-3" />
                                  </button>
                                  <span className="text-xs text-gray-300">
                                    {formatTimeAgo(chat.lastMessageTime || chat.updatedAt)}
                                  </span>
                                  <ArrowRight
                                    className="w-3.5 h-3.5 text-gray-300 cursor-pointer"
                                    onClick={() => navigate(`/chat/${chat.id}`)}
                                  />
                                </div>
                              </div>
                            ))
                          )}
                          {/* New chat CTA inside project */}
                          <div
                            onClick={() => navigate(`/projects/${project.id}/chat/new`)}
                            className="flex items-center gap-2 px-5 py-3 text-sm text-blue-500 hover:text-blue-700 hover:bg-blue-50 cursor-pointer transition-colors border-t border-gray-100"
                          >
                            <Plus className="w-3.5 h-3.5" /> New Chat in {project.name}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* Quick Chats section */}
        {(chatsLoading || quickChats.length > 0) && (
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-gray-800 flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-500" /> Quick Chats
                {!chatsLoading && <Badge variant="secondary">{quickChats.length}</Badge>}
              </h2>
              <Button variant="ghost" size="sm" onClick={() => navigate("/chat/new")} className="text-amber-600 text-xs gap-1">
                <Plus className="w-3.5 h-3.5" /> New Quick Chat
              </Button>
            </div>

            {chatsLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 rounded-xl" />)}
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm divide-y divide-gray-50 overflow-hidden">
                {quickChats.map(chat => (
                  <div
                    key={chat.id}
                    className="flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 transition-colors group"
                  >
                    {/* Clickable chat area */}
                    <div
                      className="flex items-center gap-3 min-w-0 flex-1 cursor-pointer"
                      onClick={() => navigate(`/chat/${chat.id}`)}
                    >
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 role-${chat.role.replace("_", "-")}`}>
                        <MessageCircle className="w-4 h-4 text-white" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">{chat.title}</p>
                        <p className="text-xs text-gray-400">
                          {chat.role.replace(/_/g, " ")} · {chat.aiProvider?.toUpperCase()}
                          {chat.lastMessage && ` · ${chat.lastMessage.slice(0, 60)}…`}
                        </p>
                      </div>
                    </div>
                    {/* Right actions */}
                    <div className="flex items-center gap-2 shrink-0 ml-3">
                      <button
                        onClick={e => { e.stopPropagation(); setLinkingChat(chat); }}
                        title="Link to project"
                        className="opacity-0 group-hover:opacity-100 flex items-center gap-1 text-xs text-blue-500 hover:text-blue-700 px-2 py-1 rounded-lg hover:bg-blue-50 transition-all"
                      >
                        <Link2 className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Link</span>
                      </button>
                      <span className="text-xs text-gray-300">
                        {formatTimeAgo(chat.lastMessageTime || chat.updatedAt)}
                      </span>
                      <ArrowRight
                        className="w-3.5 h-3.5 text-gray-300 cursor-pointer"
                        onClick={() => navigate(`/chat/${chat.id}`)}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </div>

      {/* Link to project modal */}
      {linkingChat && (
        <LinkToProjectModal
          chatId={linkingChat.id}
          chatTitle={linkingChat.title}
          currentProjectId={linkingChat.projectId}
          open={!!linkingChat}
          onClose={() => setLinkingChat(null)}
        />
      )}
    </div>
  );
}
