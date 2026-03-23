import { useState } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowLeft, Plus, FolderOpen, MessageCircle, Settings,
  Archive, Bot, User, BookOpen, Clock,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Project, Chat } from "@/types";
import FileBrowser from "@/components/FileBrowser";

export default function ProjectDashboard() {
  const [, params] = useRoute("/projects/:id");
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const projectId = parseInt(params?.id ?? "0");
  const [showFileBrowser, setShowFileBrowser] = useState(false);

  const { data: project, isLoading } = useQuery<Project & { chats: Chat[] }>({
    queryKey: [`/api/projects/${projectId}`],
    enabled: !!projectId,
  });

  const archiveMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/projects/${projectId}`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      toast({ title: "Project archived" });
      navigate("/chat");
    },
  });

  const formatDate = (d: Date | string) =>
    new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-4xl mx-auto space-y-4">
          <Skeleton className="h-8 w-1/3" />
          <Skeleton className="h-4 w-2/3" />
          <div className="grid grid-cols-3 gap-4 mt-6">
            {Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
          </div>
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500">Project not found.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200 p-6 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Button variant="outline" onClick={() => navigate("/chat")} size="sm">
              <ArrowLeft className="w-4 h-4 mr-1" /> Back
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{project.name}</h1>
              {project.description && (
                <p className="text-sm text-gray-500">{project.description}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate(`/projects/${projectId}/edit`)}
            >
              <Settings className="w-4 h-4 mr-1" /> Settings
            </Button>
            <Button
              onClick={() => navigate(`/projects/${projectId}/chat/new`)}
              className="gradient-bg text-white"
              size="sm"
            >
              <Plus className="w-4 h-4 mr-1" /> New Chat
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
        {/* Project settings summary */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <User className="w-5 h-5 text-blue-500 shrink-0" />
              <div className="min-w-0">
                <p className="text-xs text-gray-400 uppercase tracking-wide">Default Role</p>
                <p className="text-sm font-medium text-gray-800 capitalize truncate">
                  {project.role?.replace(/_/g, ' ') || 'Researcher'}
                </p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <Bot className="w-5 h-5 text-blue-500 shrink-0" />
              <div className="min-w-0">
                <p className="text-xs text-gray-400 uppercase tracking-wide">Default Model</p>
                <p className="text-sm font-medium text-gray-800 truncate">
                  {project.aiModel || 'Not set'}
                </p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <FolderOpen className="w-5 h-5 text-blue-500 shrink-0" />
              <div className="min-w-0">
                <p className="text-xs text-gray-400 uppercase tracking-wide">Local Folder</p>
                <p className="text-sm font-medium text-gray-800 truncate" title={project.localFolderPath ?? ''}>
                  {project.localFolderPath
                    ? project.localFolderPath.split('/').pop()
                    : <span className="text-gray-400 font-normal">None</span>}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* File browser toggle */}
        {project.localFolderPath && (
          <div>
            <Button
              variant="outline"
              onClick={() => setShowFileBrowser(v => !v)}
              className="flex items-center gap-2"
            >
              <FolderOpen className="w-4 h-4" />
              {showFileBrowser ? "Hide" : "Browse"} Project Files
            </Button>
            {showFileBrowser && (
              <div className="mt-3">
                <FileBrowser projectId={projectId} folderPath={project.localFolderPath} />
              </div>
            )}
          </div>
        )}

        {/* Chat list */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <MessageCircle className="w-5 h-5 text-blue-500" />
                Chats
                <Badge variant="secondary">{project.chats?.length ?? 0}</Badge>
              </CardTitle>
              <Button
                size="sm"
                variant="outline"
                onClick={() => navigate(`/projects/${projectId}/chat/new`)}
              >
                <Plus className="w-3.5 h-3.5 mr-1" /> New Chat
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {(!project.chats || project.chats.length === 0) ? (
              <div className="text-center py-8">
                <MessageCircle className="w-10 h-10 text-gray-200 mx-auto mb-2" />
                <p className="text-sm text-gray-400">No chats yet</p>
                <Button
                  size="sm"
                  className="mt-3 gradient-bg text-white"
                  onClick={() => navigate(`/projects/${projectId}/chat/new`)}
                >
                  Start the first chat
                </Button>
              </div>
            ) : (
              project.chats.map((chat) => (
                <div
                  key={chat.id}
                  onClick={() => navigate(`/chat/${chat.id}`)}
                  className="flex items-center justify-between p-3 rounded-xl border border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 role-${chat.role.replace('_', '-')}`}>
                      <BookOpen className="w-4 h-4 text-white" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{chat.title}</p>
                      {chat.task && (
                        <p className="text-xs text-gray-400 truncate">{chat.task}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-gray-300 shrink-0 ml-2">
                    <Clock className="w-3 h-3" />
                    {formatDate(chat.updatedAt)}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Danger zone */}
        <Card className="border-red-100">
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-700">Archive Project</p>
              <p className="text-xs text-gray-400">Hides this project from the sidebar. Chats remain accessible.</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="text-red-600 border-red-200 hover:bg-red-50"
              onClick={() => {
                if (confirm(`Archive "${project.name}"?`)) archiveMutation.mutate();
              }}
              disabled={archiveMutation.isPending}
            >
              <Archive className="w-4 h-4 mr-1" />
              Archive
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
