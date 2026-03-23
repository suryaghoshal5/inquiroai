import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { FolderOpen, FolderPlus, Link2, Unlink, Check } from "lucide-react";
import type { Project } from "@/types";

interface LinkToProjectModalProps {
  chatId: number;
  chatTitle: string;
  currentProjectId?: number | null;
  open: boolean;
  onClose: () => void;
}

export default function LinkToProjectModal({
  chatId,
  chatTitle,
  currentProjectId,
  open,
  onClose,
}: LinkToProjectModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const [selected, setSelected] = useState<number | null>(currentProjectId ?? null);

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
    enabled: open,
  });

  const linkMutation = useMutation({
    mutationFn: async (projectId: number | null) => {
      const res = await apiRequest("PATCH", `/api/chats/${chatId}`, { projectId });
      return res.json();
    },
    onSuccess: (_, projectId) => {
      queryClient.invalidateQueries({ queryKey: ["/api/chats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      if (projectId === null) {
        toast({ title: "Chat unlinked from project" });
      } else {
        const proj = projects.find(p => p.id === projectId);
        toast({ title: `Linked to "${proj?.name ?? "project"}"` });
      }
      onClose();
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Failed to update chat.", variant: "destructive" });
    },
  });

  const handleSave = () => {
    if (selected === (currentProjectId ?? null)) {
      onClose();
      return;
    }
    linkMutation.mutate(selected);
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="w-4 h-4 text-blue-500" /> Link to Project
          </DialogTitle>
          <DialogDescription>
            Assign <span className="font-medium text-gray-700">"{chatTitle}"</span> to a project.
            It will appear under that project in your dashboard and sidebar.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 my-2">
          {/* None / standalone option */}
          <button
            onClick={() => setSelected(null)}
            className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-colors ${
              selected === null
                ? "border-blue-500 bg-blue-50"
                : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
            }`}
          >
            <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center shrink-0">
              <Unlink className="w-4 h-4 text-gray-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-700">No project (Quick Chat)</p>
              <p className="text-xs text-gray-400">Keep as standalone</p>
            </div>
            {selected === null && <Check className="w-4 h-4 text-blue-500 shrink-0" />}
          </button>

          {/* Existing projects */}
          {projects.map(project => (
            <button
              key={project.id}
              onClick={() => setSelected(project.id)}
              className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-colors ${
                selected === project.id
                  ? "border-blue-500 bg-blue-50"
                  : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
              }`}
            >
              <div className="w-8 h-8 gradient-bg rounded-lg flex items-center justify-center shrink-0">
                <FolderOpen className="w-4 h-4 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">{project.name}</p>
                {project.description && (
                  <p className="text-xs text-gray-400 truncate">{project.description}</p>
                )}
              </div>
              {selected === project.id && <Check className="w-4 h-4 text-blue-500 shrink-0" />}
            </button>
          ))}

          {/* Create new project */}
          <button
            onClick={() => { onClose(); navigate("/projects/new"); }}
            className="w-full flex items-center gap-3 p-3 rounded-xl border-2 border-dashed border-gray-200 text-left hover:border-blue-300 hover:bg-blue-50 transition-colors"
          >
            <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center shrink-0">
              <FolderPlus className="w-4 h-4 text-blue-500" />
            </div>
            <div>
              <p className="text-sm font-medium text-blue-600">Create new project</p>
              <p className="text-xs text-gray-400">Then you can link this chat</p>
            </div>
          </button>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose} disabled={linkMutation.isPending}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={linkMutation.isPending}
            className="gradient-bg text-white"
          >
            {linkMutation.isPending ? "Saving…" : "Save"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
