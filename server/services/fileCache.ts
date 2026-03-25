import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import { db } from "../db";
import { projectFiles, chatFiles } from "@shared/schema";
import { eq, and, isNull } from "drizzle-orm";
import type { ProjectFileRecord } from "@shared/schema";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function computeHash(buffer: Buffer): string {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

/** Validate that resolved path stays within the project folder (path traversal prevention). */
function assertWithinFolder(folderPath: string, absolutePath: string): void {
  const resolved = path.resolve(absolutePath);
  const base = path.resolve(folderPath);
  if (!resolved.startsWith(base + path.sep) && resolved !== base) {
    throw Object.assign(new Error("Path traversal detected"), { statusCode: 403 });
  }
}

/** Extract text from a local file without deleting it (unlike the upload-oriented FileProcessor). */
async function extractTextFromPath(absolutePath: string, ext: string): Promise<{ text: string; method: string; quality: string }> {
  try {
    switch (ext) {
      case ".pdf": {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-expect-error pdf-parse has no type declarations
        const pdf = await import("pdf-parse");
        const buf = await fs.readFile(absolutePath);
        const data = await pdf.default(buf);
        return { text: data.text, method: "pdf-parse", quality: data.text.trim().length > 0 ? "good" : "partial" };
      }
      case ".docx":
      case ".doc": {
        const mammoth = await import("mammoth");
        const result = await mammoth.extractRawText({ path: absolutePath });
        return { text: result.value, method: "mammoth", quality: result.value.trim().length > 0 ? "good" : "partial" };
      }
      case ".xlsx":
      case ".xls": {
        const XLSX = await import("xlsx");
        const wb = XLSX.readFile(absolutePath);
        const parts: string[] = wb.SheetNames.map(name => {
          const ws = wb.Sheets[name];
          const rows = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1 }) as string[][];
          return `## Sheet: ${name}\n` + rows.map(r => r.join("\t")).join("\n");
        });
        return { text: parts.join("\n\n"), method: "xlsx", quality: "good" };
      }
      case ".csv": {
        const text = await fs.readFile(absolutePath, "utf-8");
        return { text, method: "text", quality: "good" };
      }
      default: {
        // Plain text, markdown, code files
        const text = await fs.readFile(absolutePath, "utf-8");
        return { text, method: "text", quality: "good" };
      }
    }
  } catch (err) {
    console.error(`[fileCache] Extraction failed for ${absolutePath}:`, err);
    return { text: "", method: "failed", quality: "failed" };
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Attach a file to a project: extract (or return cached), persist in project_files.
 * Returns the ProjectFileRecord.
 */
export async function extractAndCache(
  projectId: number,
  folderPath: string,
  absolutePath: string,
  relativePath: string,
): Promise<ProjectFileRecord> {
  assertWithinFolder(folderPath, absolutePath);

  const stat = await fs.stat(absolutePath);
  const buf = await fs.readFile(absolutePath);
  const hash = computeHash(buf);
  const ext = path.extname(absolutePath).toLowerCase();
  const fileName = path.basename(absolutePath);

  // Check for existing active record with the same path
  const [existing] = await db
    .select()
    .from(projectFiles)
    .where(
      and(
        eq(projectFiles.projectId, projectId),
        eq(projectFiles.relativePath, relativePath),
        eq(projectFiles.isActive, true),
      ),
    )
    .limit(1);

  if (existing) {
    // Same hash → return cached immediately
    if (existing.contentHash === hash) {
      return existing;
    }
    // Hash changed → re-extract, increment version, update record
    const { text, method, quality } = await extractTextFromPath(absolutePath, ext);
    const [updated] = await db
      .update(projectFiles)
      .set({
        contentHash: hash,
        extractedText: text,
        extractedLength: text.length,
        extractionMethod: method,
        extractionQuality: quality,
        fileModifiedAt: stat.mtime,
        fileSizeBytes: stat.size,
        version: (existing.version ?? 1) + 1,
        updatedAt: new Date(),
      })
      .where(eq(projectFiles.id, existing.id))
      .returning();
    return updated;
  }

  // New file → extract and insert
  const { text, method, quality } = await extractTextFromPath(absolutePath, ext);
  const fileType = ext.replace(".", "") || "unknown";

  const [inserted] = await db
    .insert(projectFiles)
    .values({
      projectId,
      fileName,
      relativePath,
      absolutePath,
      fileType,
      fileSizeBytes: stat.size,
      contentHash: hash,
      extractedText: text,
      extractedLength: text.length,
      extractionMethod: method,
      extractionQuality: quality,
      fileModifiedAt: stat.mtime,
      version: 1,
      isActive: true,
    })
    .returning();

  return inserted;
}

export interface ProjectFileWithStale extends ProjectFileRecord {
  isStale: boolean;
}

/**
 * List all active cached files for a project, annotated with stale detection.
 * A file is stale if the source mtime has advanced since extraction.
 */
export async function getProjectFiles(projectId: number): Promise<ProjectFileWithStale[]> {
  const records = await db
    .select()
    .from(projectFiles)
    .where(and(eq(projectFiles.projectId, projectId), eq(projectFiles.isActive, true)));

  const results = await Promise.all(
    records.map(async (r): Promise<ProjectFileWithStale> => {
      try {
        const stat = await fs.stat(r.absolutePath);
        const isStale =
          r.fileModifiedAt != null &&
          stat.mtime.getTime() > new Date(r.fileModifiedAt).getTime();
        return { ...r, isStale };
      } catch {
        // File deleted from disk — mark stale
        return { ...r, isStale: true };
      }
    }),
  );

  return results;
}

/**
 * Soft-delete a project file: mark isActive=false and detach from all chats.
 */
export async function invalidateFile(projectFileId: number): Promise<void> {
  await db
    .update(projectFiles)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(projectFiles.id, projectFileId));

  // Detach from all chats that still have it attached
  await db
    .update(chatFiles)
    .set({ detachedAt: new Date() })
    .where(
      and(
        eq(chatFiles.projectFileId, projectFileId),
        isNull(chatFiles.detachedAt),
      ),
    );
}
