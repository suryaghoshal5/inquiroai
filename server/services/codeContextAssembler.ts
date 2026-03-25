import * as fs from "fs/promises";
import * as path from "path";

export interface FileSnippet {
  path: string;        // relative path within project
  modified: string;   // ISO date string
  lines: string;      // first 100 lines of the file
}

export interface ProjectCodeContext {
  stack: {
    languages: string[];
    frameworks: string[];
    packageManager: string;
    testFramework?: string;
  };
  schema?: string;                // content of schema file (first 200 lines)
  entryPoints: string[];
  recentFiles: FileSnippet[];     // up to 10 most recently modified source files
  conventions: string[];
  projectProfile: string;
}

// In-memory cache: projectId → { context, expiresAt }
const contextCache = new Map<number, { context: ProjectCodeContext; expiresAt: number; assembledAt: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export function getCodeContextCacheAge(projectId: number): number | null {
  const cached = contextCache.get(projectId);
  if (!cached || Date.now() > cached.expiresAt) return null;
  return Math.floor((Date.now() - cached.assembledAt) / 1000 / 60); // minutes ago
}

export async function assembleCodeContext(
  projectId: number,
  folderPath: string
): Promise<ProjectCodeContext> {
  const cached = contextCache.get(projectId);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.context;
  }

  const context = await _buildContext(folderPath);
  contextCache.set(projectId, {
    context,
    expiresAt: Date.now() + CACHE_TTL_MS,
    assembledAt: Date.now(),
  });
  return context;
}

async function _buildContext(folderPath: string): Promise<ProjectCodeContext> {
  const languages: string[] = [];
  const frameworks: string[] = [];
  let packageManager = "unknown";
  let testFramework: string | undefined;
  let schema: string | undefined;
  const entryPoints: string[] = [];
  const conventions: string[] = [];

  // --- package.json detection ---
  try {
    const pkgRaw = await fs.readFile(path.join(folderPath, "package.json"), "utf-8");
    const pkg = JSON.parse(pkgRaw);
    const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };

    languages.push("JavaScript");
    if (allDeps["typescript"] || allDeps["ts-node"]) {
      languages.push("TypeScript");
    }

    // Frameworks
    if (allDeps["react"]) frameworks.push("React" + (allDeps["react"] ? ` ${allDeps["react"].replace(/[\^~]/, "")}` : ""));
    if (allDeps["next"]) frameworks.push("Next.js");
    if (allDeps["express"]) frameworks.push("Express");
    if (allDeps["fastify"]) frameworks.push("Fastify");
    if (allDeps["@hono/hono"] || allDeps["hono"]) frameworks.push("Hono");
    if (allDeps["drizzle-orm"]) { frameworks.push("Drizzle ORM"); conventions.push("Drizzle ORM (never raw SQL)"); }
    if (allDeps["@prisma/client"] || allDeps["prisma"]) { frameworks.push("Prisma ORM"); }
    if (allDeps["vite"] || allDeps["@vitejs/plugin-react"]) frameworks.push("Vite");
    if (allDeps["@tanstack/react-query"]) { frameworks.push("TanStack Query"); conventions.push("Uses React Query for server state"); }
    if (allDeps["@shadcn/ui"] || allDeps["@radix-ui/react-dialog"]) { frameworks.push("shadcn/ui"); conventions.push("shadcn/ui components"); }
    if (allDeps["tailwindcss"]) frameworks.push("Tailwind CSS");
    if (allDeps["zod"]) { frameworks.push("Zod"); conventions.push("Zod for validation"); }
    if (allDeps["trpc"] || allDeps["@trpc/server"]) frameworks.push("tRPC");
    if (allDeps["socket.io"]) frameworks.push("Socket.io");

    // Test framework
    if (allDeps["vitest"]) testFramework = "vitest";
    else if (allDeps["jest"] || allDeps["@jest/core"]) testFramework = "jest";
    else if (allDeps["mocha"]) testFramework = "mocha";

    // Package manager
    try {
      await fs.access(path.join(folderPath, "pnpm-lock.yaml"));
      packageManager = "pnpm";
    } catch {
      try {
        await fs.access(path.join(folderPath, "yarn.lock"));
        packageManager = "yarn";
      } catch {
        packageManager = "npm";
      }
    }
  } catch {
    // No package.json — might be Python
  }

  // --- pyproject.toml / requirements.txt detection ---
  try {
    const pyproject = await fs.readFile(path.join(folderPath, "pyproject.toml"), "utf-8");
    languages.push("Python");
    packageManager = "pip";
    if (pyproject.includes("fastapi")) frameworks.push("FastAPI");
    if (pyproject.includes("flask")) frameworks.push("Flask");
    if (pyproject.includes("django")) frameworks.push("Django");
    if (pyproject.includes("sqlalchemy")) { frameworks.push("SQLAlchemy"); conventions.push("SQLAlchemy ORM"); }
    if (pyproject.includes("pytest")) testFramework = "pytest";
    if (pyproject.includes("poetry")) packageManager = "poetry";
    if (pyproject.includes("uv")) packageManager = "uv";
  } catch {
    try {
      await fs.readFile(path.join(folderPath, "requirements.txt"), "utf-8");
      if (!languages.includes("Python")) languages.push("Python");
    } catch {}
  }

  // --- Schema file detection ---
  const schemaPaths = [
    "shared/schema.ts",
    "prisma/schema.prisma",
    "db/schema.ts",
    "src/db/schema.ts",
    "database/schema.sql",
    "schema.sql",
  ];
  for (const sp of schemaPaths) {
    try {
      const content = await fs.readFile(path.join(folderPath, sp), "utf-8");
      // First 200 lines
      const lines = content.split("\n").slice(0, 200).join("\n");
      schema = lines;
      break;
    } catch {}
  }

  // --- Entry points ---
  const entryPatterns = [
    "server/index.ts", "src/index.ts", "index.ts", "main.ts",
    "client/src/main.tsx", "src/main.tsx", "app.ts", "server.ts",
    "main.py", "app.py", "run.py",
  ];
  for (const ep of entryPatterns) {
    try {
      await fs.access(path.join(folderPath, ep));
      entryPoints.push(ep);
    } catch {}
  }

  // --- Additional conventions from tsconfig / vite config ---
  try {
    await fs.readFile(path.join(folderPath, "tsconfig.json"), "utf-8");
    if (!conventions.includes("TypeScript strict mode")) {
      conventions.push("TypeScript (strict mode enforced)");
    }
  } catch {}

  try {
    const viteConf = await fs.readFile(path.join(folderPath, "vite.config.ts"), "utf-8");
    if (viteConf.includes("@vitejs/plugin-react")) conventions.push("Vite React SPA");
  } catch {}

  // --- Recent source files (last 10 modified) ---
  const recentFiles = await _getRecentFiles(folderPath);

  // --- Project profile paragraph ---
  const stackStr = [
    ...languages,
    ...frameworks.slice(0, 5),
    ...(testFramework ? [testFramework] : []),
  ].join(" · ") || "unknown stack";

  const projectProfile = [
    `Stack: ${stackStr}.`,
    schema ? "Database schema file found." : "",
    entryPoints.length ? `Entry points: ${entryPoints.join(", ")}.` : "",
    conventions.length ? `Conventions: ${conventions.join(", ")}.` : "",
  ].filter(Boolean).join(" ");

  return {
    stack: { languages, frameworks, packageManager, testFramework },
    schema,
    entryPoints,
    recentFiles,
    conventions,
    projectProfile,
  };
}

async function _getRecentFiles(folderPath: string): Promise<FileSnippet[]> {
  const sourceExts = new Set([".ts", ".tsx", ".js", ".jsx", ".py", ".go", ".rs"]);
  const ignoreDirs = new Set(["node_modules", ".git", "dist", "build", ".next", "__pycache__", ".venv", "venv"]);

  const files: Array<{ rel: string; mtimeMs: number }> = [];

  async function walk(dir: string, depth = 0) {
    if (depth > 6) return;
    let entries: string[] = [];
    try {
      entries = await fs.readdir(dir);
    } catch { return; }

    for (const entry of entries) {
      if (ignoreDirs.has(entry)) continue;
      const full = path.join(dir, entry);
      let stat;
      try { stat = await fs.stat(full); } catch { continue; }

      if (stat.isDirectory()) {
        await walk(full, depth + 1);
      } else if (sourceExts.has(path.extname(entry))) {
        files.push({ rel: path.relative(folderPath, full), mtimeMs: stat.mtimeMs });
      }
    }
  }

  await walk(folderPath);

  // Sort by most recently modified, take top 10
  files.sort((a, b) => b.mtimeMs - a.mtimeMs);
  const top10 = files.slice(0, 10);

  const snippets: FileSnippet[] = [];
  for (const { rel, mtimeMs } of top10) {
    try {
      const content = await fs.readFile(path.join(folderPath, rel), "utf-8");
      const first100 = content.split("\n").slice(0, 100).join("\n");
      snippets.push({
        path: rel,
        modified: new Date(mtimeMs).toISOString().split("T")[0],
        lines: first100,
      });
    } catch {}
  }

  return snippets;
}
