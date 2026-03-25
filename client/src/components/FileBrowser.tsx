import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  FileText, FileSpreadsheet, FileCode, File,
  Paperclip, RefreshCw, AlertCircle, CheckCircle2, AlertTriangle,
} from "lucide-react";
import type { ProjectFile } from "@/types";

interface CachedFile {
  id: number;
  projectId: number;
  fileName: string;
  relativePath: string;
  fileType: string;
  fileSizeBytes: number;
  extractionQuality: string;
  createdAt: string;
  isStale: boolean;
}

interface FileBrowserProps {
  projectId: number;
  folderPath: string;
  /** If provided, "attach" calls POST /api/chats/:chatId/files/attach via the cache API */
  chatId?: number;
  selectable?: boolean;
  /** Called only when chatId is NOT provided (NewProjectChat flow) */
  onAttach?: (files: ProjectFile[], contents: string[]) => void;
  /** Called when files are attached via chatId flow — parent can refresh its file list */
  onChatFileAttached?: () => void;
}

const EXT_ICONS: Record<string, React.ReactNode> = {
  '.pdf':  <FileText className="w-4 h-4 text-red-500" />,
  '.docx': <FileText className="w-4 h-4 text-blue-500" />,
  '.doc':  <FileText className="w-4 h-4 text-blue-500" />,
  '.xlsx': <FileSpreadsheet className="w-4 h-4 text-green-600" />,
  '.xls':  <FileSpreadsheet className="w-4 h-4 text-green-600" />,
  '.csv':  <FileSpreadsheet className="w-4 h-4 text-green-500" />,
  '.md':   <FileText className="w-4 h-4 text-gray-600" />,
  '.txt':  <FileText className="w-4 h-4 text-gray-400" />,
  '.json': <FileCode className="w-4 h-4 text-yellow-600" />,
  '.ts':   <FileCode className="w-4 h-4 text-blue-600" />,
  '.tsx':  <FileCode className="w-4 h-4 text-blue-600" />,
  '.js':   <FileCode className="w-4 h-4 text-yellow-500" />,
  '.py':   <FileCode className="w-4 h-4 text-blue-400" />,
};

function fileIcon(ext: string) {
  return EXT_ICONS[ext] ?? <File className="w-4 h-4 text-gray-400" />;
}

function formatSize(bytes: number) {
  if (bytes < 1024)    return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1)   return "just now";
  if (mins < 60)  return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)   return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function FileBrowser({
  projectId,
  folderPath,
  chatId,
  selectable,
  onAttach,
  onChatFileAttached,
}: FileBrowserProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [attaching, setAttaching] = useState(false);
  const [attachingCachedId, setAttachingCachedId] = useState<number | null>(null);

  // All project files (folder listing)
  const { data: files, isLoading: filesLoading, error: filesError, refetch: refetchFiles } = useQuery<ProjectFile[]>({
    queryKey: [`/api/projects/${projectId}/files`],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/projects/${projectId}/files`);
      return res.json();
    },
  });

  // Cached project files
  const { data: cachedFiles, isLoading: cachedLoading, refetch: refetchCached } = useQuery<CachedFile[]>({
    queryKey: [`/api/projects/${projectId}/files/cached`],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/projects/${projectId}/files/cached`);
      return res.json();
    },
  });

  const cachedByRelPath = new Map<string, CachedFile>(
    (cachedFiles ?? []).map(cf => [cf.relativePath, cf])
  );

  const toggleSelect = (relativePath: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(relativePath) ? next.delete(relativePath) : next.add(relativePath);
      return next;
    });
  };

  // Attach a cached file to the current chat (chatId flow)
  const attachCachedToChat = async (cachedFile: CachedFile) => {
    if (!chatId) return;
    setAttachingCachedId(cachedFile.id);
    try {
      await apiRequest("POST", `/api/chats/${chatId}/files/attach`, { projectFileId: cachedFile.id });
      queryClient.invalidateQueries({ queryKey: [`/api/chats/${chatId}/files`] });
      onChatFileAttached?.();
      toast({ title: `${cachedFile.fileName} attached` });
    } catch (err: any) {
      toast({ title: "Attach failed", description: err.message, variant: "destructive" });
    } finally {
      setAttachingCachedId(null);
    }
  };

  // Extract + cache a folder file, then attach to chat (or call onAttach for legacy flow)
  const attachUncachedFile = async (f: ProjectFile) => {
    if (chatId) {
      // Chat flow: extract+cache first, then attach to chat
      setAttachingCachedId(-1); // use -1 as "processing any uncached file"
      try {
        const attachRes = await apiRequest("POST", `/api/projects/${projectId}/files/attach`, {
          relativePath: f.relativePath,
        });
        const pf = await attachRes.json();
        await apiRequest("POST", `/api/chats/${chatId}/files/attach`, { projectFileId: pf.id });
        queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/files/cached`] });
        queryClient.invalidateQueries({ queryKey: [`/api/chats/${chatId}/files`] });
        onChatFileAttached?.();
        toast({ title: `${f.name} extracted and attached` });
      } catch (err: any) {
        toast({ title: "Attach failed", description: err.message, variant: "destructive" });
      } finally {
        setAttachingCachedId(null);
      }
    }
  };

  // Legacy onAttach flow (NewProjectChat — no chatId)
  const handleLegacyAttach = async () => {
    if (!onAttach || selected.size === 0) return;
    setAttaching(true);
    try {
      const selectedFiles = (files ?? []).filter(f => selected.has(f.relativePath));
      const contents = await Promise.all(
        selectedFiles.map(async (f) => {
          const encoded = encodeURIComponent(f.relativePath);
          const res = await apiRequest("GET", `/api/projects/${projectId}/files/${encoded}`);
          const data = await res.json();
          return `### ${f.name}\n\n${data.content}`;
        })
      );
      onAttach(selectedFiles, contents);
      setSelected(new Set());
    } catch (err: any) {
      toast({ title: "Attachment failed", description: err.message, variant: "destructive" });
    } finally {
      setAttaching(false);
    }
  };

  const shortPath = folderPath.split('/').slice(-2).join('/');
  const hasCached = (cachedFiles ?? []).length > 0;

  return (
    <TooltipProvider>
      <div className="border border-gray-200 rounded-xl overflow-hidden bg-white">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-200">
          <span className="text-xs text-gray-500 font-mono truncate">…/{shortPath}</span>
          <div className="flex items-center gap-2">
            {!chatId && selectable && selected.size > 0 && (
              <Button
                size="sm"
                onClick={handleLegacyAttach}
                disabled={attaching}
                className="gradient-bg text-white flex items-center gap-1.5 text-xs"
              >
                <Paperclip className="w-3.5 h-3.5" />
                {attaching ? "Attaching…" : `Attach ${selected.size} file${selected.size > 1 ? 's' : ''}`}
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => { refetchFiles(); refetchCached(); }} className="p-1.5">
              <RefreshCw className="w-3.5 h-3.5 text-gray-400" />
            </Button>
          </div>
        </div>

        <div className="max-h-96 overflow-y-auto">
          {/* ── Cached Files Section ── */}
          {(hasCached || cachedLoading) && (
            <div>
              <div className="px-4 py-2 bg-blue-50 border-b border-blue-100 text-xs font-medium text-blue-700 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Cached files
              </div>
              <div className="divide-y divide-gray-50">
                {cachedLoading ? (
                  Array(2).fill(0).map((_, i) => (
                    <div key={i} className="flex items-center gap-3 px-4 py-2.5">
                      <Skeleton className="w-4 h-4 rounded" />
                      <Skeleton className="h-4 flex-1 max-w-xs" />
                    </div>
                  ))
                ) : (
                  (cachedFiles ?? []).map(cf => (
                    <div key={cf.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50">
                      <span className="shrink-0">{fileIcon(`.${cf.fileType}`)}</span>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="flex-1 min-w-0 text-sm text-gray-800 truncate cursor-default">
                            {cf.relativePath}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>{formatSize(cf.fileSizeBytes)} · Extracted {timeAgo(cf.createdAt)}</p>
                        </TooltipContent>
                      </Tooltip>
                      <div className="flex items-center gap-2 shrink-0">
                        {cf.isStale && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Badge variant="outline" className="text-orange-600 border-orange-300 bg-orange-50 text-xs cursor-default">
                                <AlertTriangle className="w-3 h-3 mr-1" />
                                Stale
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent>File modified since last extraction — re-attach to refresh</TooltipContent>
                          </Tooltip>
                        )}
                        {chatId && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-6 text-xs px-2"
                            disabled={attachingCachedId === cf.id}
                            onClick={() => attachCachedToChat(cf)}
                          >
                            {attachingCachedId === cf.id ? "…" : "Attach"}
                          </Button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* ── All Project Files Section ── */}
          <div>
            {hasCached && (
              <div className="px-4 py-2 bg-gray-50 border-b border-gray-100 border-t text-xs font-medium text-gray-500">
                All project files
              </div>
            )}
            <div className="divide-y divide-gray-50">
              {filesLoading ? (
                Array(5).fill(0).map((_, i) => (
                  <div key={i} className="flex items-center gap-3 px-4 py-2.5">
                    <Skeleton className="w-4 h-4 rounded" />
                    <Skeleton className="h-4 flex-1 max-w-xs" />
                    <Skeleton className="h-3 w-14" />
                  </div>
                ))
              ) : filesError ? (
                <div className="flex items-center gap-2 px-4 py-6 text-sm text-red-500">
                  <AlertCircle className="w-4 h-4" />
                  Could not read folder
                </div>
              ) : !files || files.length === 0 ? (
                <div className="px-4 py-6 text-center text-sm text-gray-400">No supported files found</div>
              ) : (
                files.map(f => {
                  const isCached = cachedByRelPath.has(f.relativePath);
                  return (
                    <div
                      key={f.relativePath}
                      className={`flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition-colors ${
                        !chatId && selectable ? 'cursor-pointer' : ''
                      } ${selected.has(f.relativePath) ? 'bg-blue-50' : ''}`}
                      onClick={() => !chatId && selectable && toggleSelect(f.relativePath)}
                    >
                      {!chatId && selectable && (
                        <Checkbox
                          checked={selected.has(f.relativePath)}
                          onCheckedChange={() => toggleSelect(f.relativePath)}
                          onClick={e => e.stopPropagation()}
                        />
                      )}
                      <span className="shrink-0">{fileIcon(f.extension)}</span>
                      <span className="flex-1 min-w-0 text-sm text-gray-800 truncate" title={f.relativePath}>
                        {f.relativePath}
                      </span>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs text-gray-300">{formatSize(f.size)}</span>
                        {isCached ? (
                          <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50 text-xs">
                            Cached ✓
                          </Badge>
                        ) : chatId ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-6 text-xs px-2"
                            disabled={attachingCachedId === -1}
                            onClick={() => attachUncachedFile(f)}
                          >
                            {attachingCachedId === -1 ? "…" : "Extract & attach"}
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {!chatId && selectable && files && files.length > 0 && (
          <div className="px-4 py-2 bg-gray-50 border-t border-gray-100 text-xs text-gray-400">
            {selected.size > 0
              ? `${selected.size} of ${files.length} selected`
              : `${files.length} file${files.length !== 1 ? 's' : ''} — click to select`}
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
