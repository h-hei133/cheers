import { promises as fs } from "node:fs";
import path from "node:path";
import { approvedResult, deniedResult } from "./toolResultLifecycle.js";
import type { ToolDefinition } from "../../tools/types.js";
import type { ExecutionAuthority, ExecutionService } from "../../runtime/execution/service.js";

const DEFAULT_GREP_LIMIT = 100;
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB limit per file

export const TOOL_APPROVED_READ_AUTHORITY: ExecutionAuthority = {
  mode: "read-only",
  source: "tool-runtime-approval",
  reason: "ToolRuntime approved the filesystem read before ExecutionService was called.",
};

function matchPathPattern(filePath: string, pattern: string): boolean {
  if (!pattern || pattern === "*" || pattern === "**" || pattern === "**/*") {
    return true;
  }
  const cleanPattern = pattern.trim().replace(/^\.\//, "");
  const baseName = path.basename(filePath);

  // If pattern has no directory separators, match either against the full path or the basename
  const regexStr = cleanPattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*\//g, "(.+/)?")
    .replace(/\*\*/g, ".*")
    .replace(/\*/g, "[^/]*")
    .replace(/\?/g, "[^/]");
  const regex = new RegExp(`^${regexStr}$`, "i");

  return (
    regex.test(filePath) ||
    regex.test(filePath.replace(/^[/]+/, "")) ||
    regex.test(baseName)
  );
}

export function createGrepToolDefinition(
  executionService: ExecutionService,
): ToolDefinition {
  return {
    name: "grep",
    description:
      "Search for text or regular expressions across file contents in the workspace.",
    argsSchema: {
      type: "object",
      properties: {
        pattern: {
          type: "string",
          description: "The regular expression or text pattern to search for.",
        },
        path: {
          type: "string",
          description:
            "Directory or file path to search within (relative to workspace root, default: all).",
        },
        glob: {
          type: "string",
          description:
            "Filter files by glob pattern, e.g. '*.ts', 'src/**/*.ts', 'package.json'.",
        },
        ignoreCase: {
          type: "boolean",
          description: "Perform case-insensitive matching (default: false).",
        },
        limit: {
          type: "number",
          description:
            "Maximum number of matching lines to return (default: 100).",
        },
      },
      required: ["pattern"],
    },
    permissions: { check: () => [] },
    async execute(args, context) {
      const rawPattern = typeof args.pattern === "string" ? args.pattern : "";
      if (!rawPattern) {
        return deniedResult("Error: Pattern parameter is required for grep.");
      }

      const searchSubPath =
        typeof args.path === "string" ? args.path.trim().replace(/^[./\\]+/, "") : "";
      const globFilter = typeof args.glob === "string" ? args.glob.trim() : "";
      const ignoreCase = Boolean(args.ignoreCase);
      const limit =
        typeof args.limit === "number" && args.limit > 0
          ? Math.min(args.limit, 500)
          : DEFAULT_GREP_LIMIT;

      let regex: RegExp;
      try {
        regex = new RegExp(rawPattern, ignoreCase ? "iu" : "u");
      } catch {
        regex = new RegExp(
          rawPattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
          ignoreCase ? "iu" : "u",
        );
      }

      const allFiles = await executionService.listFilesRecursive({
        operationKind: "file.list",
        absoluteRoot: context.workspaceRoot,
        workspaceRoot: context.workspaceRoot,
        authority: TOOL_APPROVED_READ_AUTHORITY,
        caller: "core-tool:grep",
        reason: "List approved workspace files for content grep.",
        reportSafeTarget: context.workspaceRoot,
      });

      const rootPath = context.workspaceRoot.replace(/\\/g, "/").replace(/\/+$/, "");
      const relativeFiles = allFiles.map((file) => {
        const normalized = file.replace(/\\/g, "/");
        return normalized.startsWith(rootPath + "/")
          ? normalized.slice(rootPath.length + 1)
          : normalized;
      });

      const targetFiles = relativeFiles.filter((file) => {
        if (
          file.includes("node_modules/") ||
          file.includes(".git/") ||
          file.includes("dist/") ||
          file.includes(".normproof/")
        ) {
          return false;
        }
        if (searchSubPath && !file.startsWith(searchSubPath)) {
          return false;
        }
        if (globFilter && !matchPathPattern(file, globFilter)) {
          return false;
        }
        return true;
      });

      const results: string[] = [];
      let totalMatches = 0;

      for (const relPath of targetFiles) {
        if (totalMatches >= limit) {
          break;
        }
        const fullPath = path.resolve(context.workspaceRoot, relPath);
        try {
          const stat = await fs.stat(fullPath);
          if (!stat.isFile() || stat.size > MAX_FILE_SIZE_BYTES) {
            continue;
          }
          const content = await fs.readFile(fullPath, "utf8");
          const lines = content.split("\n");

          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (regex.test(line)) {
              results.push(`${relPath}:${i + 1}: ${line}`);
              totalMatches++;
              if (totalMatches >= limit) {
                break;
              }
            }
          }
        } catch {
          // Skip unreadable files gracefully
        }
      }

      if (results.length === 0) {
        return approvedResult("No matches found for the pattern.");
      }

      let output = results.join("\n");
      if (totalMatches >= limit) {
        output += `\n[Grep limit reached: showing first ${limit} matches. Use path or glob filter to narrow search]`;
      }

      return approvedResult(output);
    },
  };
}
