import * as fs from "fs/promises";
import * as path from "path";

export interface ProcessedCodeBlock {
  language: string;
  content: string;
  type: "new_file" | "modification" | "snippet";
  targetFile?: string;    // relative path detected from hints
  diff?: string;          // unified diff if targetFile exists on disk
  lineRange?: [number, number];
}

/**
 * Extract and process all fenced code blocks from an AI response.
 * If projectFolderPath is provided, attempts to match blocks to existing files
 * and generate unified diffs.
 */
export async function processCodeResponse(
  responseText: string,
  projectFolderPath: string | null
): Promise<ProcessedCodeBlock[]> {
  const rawBlocks = extractCodeBlocks(responseText);
  if (rawBlocks.length === 0) return [];

  const results: ProcessedCodeBlock[] = [];

  for (const block of rawBlocks) {
    const targetFile = detectFilePath(block.content, block.priorHeading, block.language);

    if (!targetFile || !projectFolderPath) {
      results.push({
        language: block.language,
        content: block.content,
        type: "snippet",
      });
      continue;
    }

    const resolvedPath = safeResolvePath(projectFolderPath, targetFile);
    if (!resolvedPath) {
      // Path traversal detected — treat as snippet
      results.push({ language: block.language, content: block.content, type: "snippet" });
      continue;
    }

    let existingContent: string | null = null;
    try {
      existingContent = await fs.readFile(resolvedPath, "utf-8");
    } catch {
      // File doesn't exist on disk
    }

    if (existingContent === null) {
      results.push({
        language: block.language,
        content: block.content,
        type: "new_file",
        targetFile,
      });
    } else {
      const diff = generateUnifiedDiff(existingContent, block.content, targetFile);
      results.push({
        language: block.language,
        content: block.content,
        type: "modification",
        targetFile,
        diff,
      });
    }
  }

  return results;
}

// --- Internal helpers ---

interface RawCodeBlock {
  language: string;
  content: string;
  priorHeading: string | null;
}

function extractCodeBlocks(text: string): RawCodeBlock[] {
  const blocks: RawCodeBlock[] = [];
  // Match fenced code blocks: ```lang\ncontent\n```
  const fenceRegex = /^```(\w*)\n([\s\S]*?)^```/gm;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = fenceRegex.exec(text)) !== null) {
    const language = match[1] || "text";
    const content = match[2].trimEnd();
    // Look for a heading or comment before the block (in the preceding ~200 chars)
    const preceding = text.slice(Math.max(0, match.index - 300), match.index);
    const priorHeading = extractPriorHeading(preceding);

    blocks.push({ language, content, priorHeading });
    lastIndex = fenceRegex.lastIndex;
  }

  return blocks;
}

function extractPriorHeading(text: string): string | null {
  // Last markdown heading before the code block
  const headingRegex = /#{1,4}\s+(.+)$/gm;
  let last: string | null = null;
  let m: RegExpExecArray | null;
  while ((m = headingRegex.exec(text)) !== null) {
    last = m[1].trim();
  }
  return last;
}

/**
 * Detect a file path from code block content or its prior heading.
 * Checks:
 *   1. First line comment: `// path/to/file.ts` or `# file.py`
 *   2. Prior markdown heading that looks like a file path
 *   3. `// filename: ...` comment anywhere in first 5 lines
 */
function detectFilePath(content: string, priorHeading: string | null, language: string): string | null {
  const lines = content.split("\n");
  const firstLine = lines[0]?.trim() ?? "";

  // Pattern 1: `// server/routes.ts` or `# main.py` or `/* path/to/file.js */`
  const firstLinePathMatch = firstLine.match(
    /^(?:\/\/|#|\/\*)\s*([\w.\-/\\]+\.\w+)/
  );
  if (firstLinePathMatch) {
    return normalizeFilePath(firstLinePathMatch[1]);
  }

  // Pattern 2: `// filename: server/routes.ts` or `# file: main.py`
  for (const line of lines.slice(0, 5)) {
    const labeled = line.match(/(?:\/\/|#)\s*(?:file(?:name)?|path):\s*([\w.\-/\\]+\.\w+)/i);
    if (labeled) return normalizeFilePath(labeled[1]);
  }

  // Pattern 3: prior heading looks like a file path (contains a dot + known extension)
  if (priorHeading) {
    const headingPathMatch = priorHeading.match(/([\w.\-/\\]+\.(?:ts|tsx|js|jsx|py|go|rs|md|json|yaml|yml|sql|css|html))\b/);
    if (headingPathMatch) return normalizeFilePath(headingPathMatch[1]);
  }

  return null;
}

function normalizeFilePath(p: string): string {
  // Convert backslashes to forward slashes, remove leading ./
  return p.replace(/\\/g, "/").replace(/^\.\//, "");
}

/**
 * Resolve a relative path within the project folder, preventing traversal.
 * Returns null if the resolved path is outside the project folder.
 */
function safeResolvePath(folderPath: string, relativePath: string): string | null {
  const resolved = path.resolve(folderPath, relativePath);
  const base = path.resolve(folderPath);
  if (!resolved.startsWith(base + path.sep) && resolved !== base) return null;
  return resolved;
}

/**
 * Generate a minimal unified diff between originalContent and newContent.
 * Format is compatible with the `patch` command.
 */
function generateUnifiedDiff(original: string, updated: string, filePath: string): string {
  const origLines = original.split("\n");
  const newLines = updated.split("\n");

  const now = new Date().toISOString();
  const header = `--- a/${filePath}\t${now}\n+++ b/${filePath}\t${now}\n`;

  // Simple LCS-based diff
  const hunks = computeHunks(origLines, newLines);
  if (hunks.length === 0) return header + "// No changes\n";

  return header + hunks.join("");
}

/** Minimal Myers-style diff producing unified hunk strings */
function computeHunks(origLines: string[], newLines: string[]): string[] {
  // Simple diff: find changed regions with 3-line context
  type DiffOp = { type: "="; line: string } | { type: "-"; line: string } | { type: "+"; line: string };
  const ops: DiffOp[] = [];

  // Use a simple patience-like approach: build edit script
  const editScript = shortestEditScript(origLines, newLines);
  for (const op of editScript) {
    ops.push(op);
  }

  if (ops.every(op => op.type === "=")) return [];

  // Group into hunks with 3-line context
  const CONTEXT = 3;
  const hunks: string[] = [];
  let i = 0;
  while (i < ops.length) {
    if (ops[i].type === "=") { i++; continue; }

    // Start of a changed region
    const hunkStart = i;
    // Find end of changed region
    let hunkEnd = i;
    for (let j = i; j < ops.length; j++) {
      if (ops[j].type !== "=") hunkEnd = j;
    }

    // Context before
    const ctxBefore = Math.max(0, hunkStart - CONTEXT);
    const ctxAfter = Math.min(ops.length - 1, hunkEnd + CONTEXT);

    let origLine = 1 + ops.slice(0, ctxBefore).filter(o => o.type !== "+").length;
    let newLine = 1 + ops.slice(0, ctxBefore).filter(o => o.type !== "-").length;
    const hunkOps = ops.slice(ctxBefore, ctxAfter + 1);
    const origCount = hunkOps.filter(o => o.type !== "+").length;
    const newCount = hunkOps.filter(o => o.type !== "-").length;

    let hunk = `@@ -${origLine},${origCount} +${newLine},${newCount} @@\n`;
    for (const op of hunkOps) {
      if (op.type === "=") hunk += ` ${op.line}\n`;
      else if (op.type === "-") hunk += `-${op.line}\n`;
      else hunk += `+${op.line}\n`;
    }
    hunks.push(hunk);

    i = ctxAfter + 1;
  }

  return hunks;
}

/** Simple O(N*M) edit script — good enough for files up to a few hundred lines */
function shortestEditScript(
  orig: string[],
  updated: string[]
): Array<{ type: "=" | "-" | "+"; line: string }> {
  const N = orig.length;
  const M = updated.length;

  // Build LCS table
  const dp: number[][] = Array.from({ length: N + 1 }, () => new Array(M + 1).fill(0));
  for (let i = N - 1; i >= 0; i--) {
    for (let j = M - 1; j >= 0; j--) {
      if (orig[i] === updated[j]) {
        dp[i][j] = 1 + dp[i + 1][j + 1];
      } else {
        dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }

  const ops: Array<{ type: "=" | "-" | "+"; line: string }> = [];
  let i = 0, j = 0;
  while (i < N && j < M) {
    if (orig[i] === updated[j]) {
      ops.push({ type: "=", line: orig[i] });
      i++; j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      ops.push({ type: "-", line: orig[i] });
      i++;
    } else {
      ops.push({ type: "+", line: updated[j] });
      j++;
    }
  }
  while (i < N) { ops.push({ type: "-", line: orig[i++] }); }
  while (j < M) { ops.push({ type: "+", line: updated[j++] }); }

  return ops;
}
