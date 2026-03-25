import { useState } from "react";
import { Copy, Check, FileDiff, Save, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import DiffViewer from "@/components/DiffViewer";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

export interface ProcessedBlock {
  language: string;
  content: string;
  type: "new_file" | "modification" | "snippet";
  targetFile?: string;
  diff?: string;
}

interface CodeBlockActionsProps {
  block: ProcessedBlock;
  projectId: number;
}

export default function CodeBlockActions({ block, projectId }: CodeBlockActionsProps) {
  const [copied, setCopied] = useState(false);
  const [diffOpen, setDiffOpen] = useState(false);
  const [applying, setApplying] = useState(false);
  const [applied, setApplied] = useState(false);
  const { toast } = useToast();

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(block.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: "Copy failed", variant: "destructive" });
    }
  };

  const handleApply = async () => {
    if (!block.targetFile) return;
    setApplying(true);
    try {
      await apiRequest("POST", `/api/projects/${projectId}/apply-code`, {
        targetRelativePath: block.targetFile,
        content: block.content,
        backupOriginal: true,
      });
      setApplied(true);
      toast({
        title: "Applied",
        description: `Written to ${block.targetFile}`,
      });
    } catch (err: any) {
      toast({
        title: "Apply failed",
        description: err.message || "Could not write file",
        variant: "destructive",
      });
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="mt-0">
      {/* Diff view (collapsible) */}
      {diffOpen && block.diff && block.targetFile && (
        <DiffViewer
          diff={block.diff}
          filePath={block.targetFile}
          fullContent={block.content}
        />
      )}

      {/* Action bar */}
      <div className="flex items-center gap-1.5 pt-1 pb-0.5 px-1">
        {/* Target file label */}
        {block.targetFile && (
          <span className="flex items-center gap-1 text-xs text-gray-400 font-mono mr-1">
            <FileText className="w-3 h-3" />
            {block.targetFile}
          </span>
        )}

        {/* View Diff — only for modification/new_file */}
        {(block.type === "modification" || block.type === "new_file") && block.diff && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setDiffOpen(v => !v)}
            className="h-6 px-2 text-xs text-gray-500 hover:text-gray-800 gap-1"
          >
            <FileDiff className="w-3 h-3" />
            {diffOpen ? "Hide diff" : "View diff"}
          </Button>
        )}

        {/* Apply to File */}
        {(block.type === "modification" || block.type === "new_file") && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleApply}
            disabled={applying || applied}
            className={`h-6 px-2 text-xs gap-1 ${
              applied
                ? "text-green-600"
                : "text-blue-600 hover:text-blue-800"
            }`}
          >
            {applied ? (
              <>
                <Check className="w-3 h-3" />
                Applied
              </>
            ) : (
              <>
                <Save className="w-3 h-3" />
                {applying ? "Applying…" : "Apply to file"}
              </>
            )}
          </Button>
        )}

        {/* Copy — always shown */}
        <Button
          variant="ghost"
          size="sm"
          onClick={handleCopy}
          className="h-6 px-2 text-xs text-gray-500 hover:text-gray-800 gap-1 ml-auto"
        >
          {copied ? (
            <>
              <Check className="w-3 h-3 text-green-500" />
              Copied
            </>
          ) : (
            <>
              <Copy className="w-3 h-3" />
              Copy
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
