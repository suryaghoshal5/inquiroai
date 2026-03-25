import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { FolderOpen, Check, X } from "lucide-react";
import type { CodeContextMeta } from "@/pages/Chat";

interface CodeContextIndicatorProps {
  codeContext: CodeContextMeta;
}

export default function CodeContextIndicator({ codeContext }: CodeContextIndicatorProps) {
  const [open, setOpen] = useState(false);

  const stackParts = codeContext.stack.split(" · ").slice(0, 3).join(" · ");
  const moreCount = codeContext.stack.split(" · ").length - 3;

  return (
    <div className="flex items-center gap-1.5">
      <FolderOpen className="w-3 h-3 text-violet-500 shrink-0" />
      <span className="text-xs text-gray-500">Codebase context loaded:</span>
      <span className="text-xs font-medium text-violet-700">
        {stackParts}
        {moreCount > 0 && <span className="text-gray-400"> +{moreCount}</span>}
      </span>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button className="text-xs text-violet-500 hover:text-violet-700 underline transition-colors">
            details
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-3" align="start" side="top">
          <div className="space-y-2.5">
            <div>
              <p className="text-xs font-semibold text-gray-700 mb-1">Stack detected</p>
              <p className="text-xs text-gray-600 leading-relaxed">{codeContext.stack || "—"}</p>
            </div>
            <div className="flex items-center gap-1.5">
              <p className="text-xs font-semibold text-gray-700">Schema file</p>
              {codeContext.schema_found
                ? <Check className="w-3.5 h-3.5 text-green-500" />
                : <X className="w-3.5 h-3.5 text-gray-300" />}
              <span className="text-xs text-gray-500">{codeContext.schema_found ? "Found" : "Not found"}</span>
            </div>
            {codeContext.recent_files.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-700 mb-1">Recent files loaded ({codeContext.recent_files.length})</p>
                <div className="space-y-0.5 max-h-32 overflow-y-auto">
                  {codeContext.recent_files.map(f => (
                    <p key={f} className="text-xs text-gray-500 font-mono truncate">{f}</p>
                  ))}
                </div>
              </div>
            )}
            {codeContext.conventions.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-700 mb-1">Conventions</p>
                <p className="text-xs text-gray-600 leading-relaxed">{codeContext.conventions.join(", ")}</p>
              </div>
            )}
            <p className="text-xs text-gray-400 pt-0.5 border-t border-gray-100">
              Context refreshed {codeContext.cache_age_minutes === 0 ? "just now" : `${codeContext.cache_age_minutes} min ago`}
            </p>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
