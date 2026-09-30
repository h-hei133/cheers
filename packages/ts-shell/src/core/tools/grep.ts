import { promises as fs } from "node:fs";
import path from "node:path";
import { approvedResult, deniedResult } from "./toolResultLifecycle.js";
import type { ToolDefinition, ToolExecutionResult } from "../../tools/types.js";
import type { ExecutionAuthority, ExecutionService } from "../../runtime/execution/service.js";
import { truncateLineWidth, truncateHead } from "./truncation.js";
import { ArtifactManager } from "../session/artifactManager.js";
import { matchesGlob } from "./globMatch.js";
import {
  MAX_SEARCHED_FILE_BYTES,
  formatRipgrepMatch,
  searchWithRipgrep,
} from "./grepRipgrep.js";
const DEFAULT_GREP_LIMIT = 100;

export const TOOL_APPROVED_READ_AUTHORITY: ExecutionAuthority = {
  mode: "read-only",
  source: "tool-runtime-approval",
  reason: "ToolRuntime approved the filesystem read before ExecutionService was called.",
};


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

      // Checked here so both search paths refuse the same input for the same
      // reason. Stripping leading separators is not enough on its own: `foo/../../x`
      // has none, and resolves outside the workspace. Without this the tool read
      // files the session was never given access to and reported them as if they
      // were in the workspace — the fast path did, while the walk refused by
      // accident, which is the wrong way round for a fallback.
      if (searchSubPath !== "") {
        const root = path.resolve(context.workspaceRoot);
        const target = path.resolve(root, searchSubPath);
        if (target !== root && !target.startsWith(root + path.sep)) {
          return deniedResult(
            `Error: path '${searchSubPath}' resolves outside the workspace root. Search paths must stay inside it.`,
          );
        }
      }

      // ripgrep first, when it is installed. It is what the implementations we
      // compared against run, and the reason is measurable: the in-process walk
      // below reads every file in the workspace one at a time, which is 1.3
      // seconds on this repository for a pattern that occurs twice, against 30
      // milliseconds for `rg`. The walk stays as the fallback rather than being
      // deleted, so a machine without ripgrep still searches — the same
      // degradation the compared implementations use for native dependencies.
      const viaRipgrep = searchWithRipgrep({
        pattern: rawPattern,
        searchPath: searchSubPath,
        ...(globFilter ? { glob: globFilter } : {}),
        ignoreCase,
        limit,
        workspaceRoot: context.workspaceRoot,
      });
      if (viaRipgrep.ok) {
        return await reportGrepMatches(
          viaRipgrep.matches.map((match) => formatRipgrepMatch(match, 500)),
          context.workspaceRoot,
        );
      }

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

      const targetFiles = allFiles.filter((file) => {
        if (searchSubPath && !file.startsWith(searchSubPath)) {
          return false;
        }
        if (globFilter && !matchesGlob(file, globFilter)) {
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
          if (!stat.isFile() || stat.size > MAX_SEARCHED_FILE_BYTES) {
            continue;
          }
          const content = await fs.readFile(fullPath, "utf8");
          const lines = content.split("\n");

          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (regex.test(line)) {
              const safeLine = truncateLineWidth(line, 500);
              results.push(`${relPath}:${i + 1}: ${safeLine}`);
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

      return await reportGrepMatches(results, context.workspaceRoot);
    },
  };
}

/**
 * Answer with the matches, spilling the full list when it does not fit.
 *
 * Shared by both search paths so a caller cannot tell which one answered: the
 * same message, the same truncation, the same artifact. Reporting differently
 * per path would leak the fallback into the transcript and make the tool's
 * output depend on what happened to be installed.
 */
async function reportGrepMatches(
  matches: readonly string[],
  workspaceRoot: string,
): Promise<ToolExecutionResult> {
  if (matches.length === 0) {
    return approvedResult("No matches found for the pattern.");
  }

  const rawResult = matches.join("\n");
  const truncated = truncateHead(rawResult, { maxLines: 500, maxBytes: 50 * 1024 });
  let outputText = truncated.content;

  if (truncated.truncated) {
    const artifactManager = ArtifactManager.getShared(workspaceRoot);
    const artifact = await artifactManager.save(rawResult, "grep");
    outputText += `\n\n[Showing ${truncated.shownLines} of ${matches.length} matches (${Math.round(truncated.shownBytes / 1024)}KB). Full grep output spilled to: ${artifact.uri}]`;
  }

  return approvedResult(outputText);
}
