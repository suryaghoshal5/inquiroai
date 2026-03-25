import { useState } from "react";
import { FileText } from "lucide-react";

interface DiffViewerProps {
  diff: string;
  filePath: string;
  fullContent: string;
}

export default function DiffViewer({ diff, filePath, fullContent }: DiffViewerProps) {
  const [view, setView] = useState<"diff" | "full">("diff");

  const diffLines = parseDiff(diff);

  return (
    <div className="mt-1 mb-2 rounded-xl border border-gray-200 overflow-hidden text-xs">
      {/* Header */}
      <div className="flex items-center justify-between bg-gray-50 border-b border-gray-200 px-3 py-2">
        <div className="flex items-center gap-1.5">
          <FileText className="w-3.5 h-3.5 text-gray-500" />
          <span className="font-mono text-gray-700 font-medium">{filePath}</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setView("diff")}
            className={`px-2 py-0.5 rounded text-xs transition-colors ${
              view === "diff"
                ? "bg-gray-200 text-gray-800 font-medium"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            Diff
          </button>
          <button
            onClick={() => setView("full")}
            className={`px-2 py-0.5 rounded text-xs transition-colors ${
              view === "full"
                ? "bg-gray-200 text-gray-800 font-medium"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            Full file
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="overflow-x-auto max-h-72 overflow-y-auto bg-white">
        {view === "diff" ? (
          <table className="w-full border-collapse">
            <tbody>
              {diffLines.map((dl, i) => (
                <tr key={i} className={diffLineClass(dl.type)}>
                  <td className="select-none pl-2 pr-3 text-gray-400 text-right w-8 shrink-0 border-r border-gray-100">
                    {dl.lineNum !== null ? dl.lineNum : ""}
                  </td>
                  <td className="pl-2 pr-3 whitespace-pre font-mono leading-5">
                    <span className={diffPrefixClass(dl.type)}>
                      {dl.type === "add" ? "+" : dl.type === "remove" ? "-" : " "}
                    </span>
                    {dl.content}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <pre className="p-3 font-mono text-gray-800 leading-5 whitespace-pre text-xs">
            {fullContent}
          </pre>
        )}
      </div>
    </div>
  );
}

interface DiffLine {
  type: "add" | "remove" | "context" | "header";
  content: string;
  lineNum: number | null;
}

function parseDiff(diff: string): DiffLine[] {
  const lines = diff.split("\n");
  const result: DiffLine[] = [];
  let origLine = 1;
  let newLine = 1;

  for (const line of lines) {
    if (line.startsWith("---") || line.startsWith("+++")) {
      result.push({ type: "header", content: line, lineNum: null });
    } else if (line.startsWith("@@")) {
      // Parse hunk header: @@ -origLine,count +newLine,count @@
      const m = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (m) {
        origLine = parseInt(m[1]);
        newLine = parseInt(m[2]);
      }
      result.push({ type: "header", content: line, lineNum: null });
    } else if (line.startsWith("-")) {
      result.push({ type: "remove", content: line.slice(1), lineNum: origLine++ });
    } else if (line.startsWith("+")) {
      result.push({ type: "add", content: line.slice(1), lineNum: newLine++ });
    } else if (line.startsWith(" ")) {
      result.push({ type: "context", content: line.slice(1), lineNum: origLine++ });
      newLine++;
    }
  }

  return result;
}

function diffLineClass(type: DiffLine["type"]): string {
  switch (type) {
    case "add":    return "bg-green-50";
    case "remove": return "bg-red-50";
    case "header": return "bg-gray-100";
    default:       return "";
  }
}

function diffPrefixClass(type: DiffLine["type"]): string {
  switch (type) {
    case "add":    return "text-green-600 font-bold mr-1";
    case "remove": return "text-red-600 font-bold mr-1";
    default:       return "text-gray-300 mr-1";
  }
}
