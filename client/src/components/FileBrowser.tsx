import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  FileText, FileSpreadsheet, FileCode, File,
  Paperclip, RefreshCw, AlertCircle,
} from "lucide-react";
import type { ProjectFile } from "@/types";

interface FileBrowserProps {
  projectId: number;
  folderPath: string;
  selectable?: boolean;
  onAttach?: (files: ProjectFile[], contents: string[]) => void;
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
  if (bytes < 1024)       return `${bytes} B`;
  if (bytes < 1048576)    return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

export default function FileBrowser({ projectId, folderPath, selectable, onAttach }: FileBrowserProps) {
  const { toast } = useToast();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [attaching, setAttaching] = useState(false);

  const { data: files, isLoading, error, refetch } = useQuery<ProjectFile[]>({
    queryKey: [`/api/projects/${projectId}/files`],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/projects/${projectId}/files`);
      return res.json();
    },
  });

  const toggleSelect = (relativePath: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(relativePath) ? next.delete(relativePath) : next.add(relativePath);
      return next;
    });
  };

  const handleAttach = async () => {
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

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden bg-white">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-200">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs text-gray-500 font-mono truncate">…/{shortPath}</span>
        </div>
        <div className="flex items-center gap-2">
          {selectable && selected.size > 0 && (
            <Button size="sm" onClick={handleAttach} disabled={attaching} className="gradient-bg text-white flex items-center gap-1.5 text-xs">
              <Paperclip className="w-3.5 h-3.5" />
              {attaching ? "Attaching…" : `Attach ${selected.size} file${selected.size > 1 ? 's' : ''}`}
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => refetch()} className="p-1.5">
            <RefreshCw className="w-3.5 h-3.5 text-gray-400" />
          </Button>
        </div>
      </div>

      {/* File list */}
      <div className="max-h-72 overflow-y-auto divide-y divide-gray-50">
        {isLoading ? (
          Array(5).fill(0).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-2.5">
              <Skeleton className="w-4 h-4 rounded" />
              <Skeleton className="h-4 flex-1 max-w-xs" />
              <Skeleton className="h-3 w-14" />
            </div>
          ))
        ) : error ? (
          <div className="flex items-center gap-2 px-4 py-6 text-sm text-red-500">
            <AlertCircle className="w-4 h-4" />
            Could not read folder
          </div>
        ) : !files || files.length === 0 ? (
          <div className="px-4 py-6 text-center text-sm text-gray-400">No supported files found</div>
        ) : (
          files.map(f => (
            <div
              key={f.relativePath}
              className={`flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition-colors ${
                selectable ? 'cursor-pointer' : ''
              } ${selected.has(f.relativePath) ? 'bg-blue-50' : ''}`}
              onClick={() => selectable && toggleSelect(f.relativePath)}
            >
              {selectable && (
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
              <span className="text-xs text-gray-300 shrink-0">{formatSize(f.size)}</span>
            </div>
          ))
        )}
      </div>

      {selectable && files && files.length > 0 && (
        <div className="px-4 py-2 bg-gray-50 border-t border-gray-100 text-xs text-gray-400">
          {selected.size > 0
            ? `${selected.size} of ${files.length} selected`
            : `${files.length} file${files.length !== 1 ? 's' : ''} — click to select`}
        </div>
      )}
    </div>
  );
}
