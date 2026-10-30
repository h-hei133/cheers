import { promises as fs } from "node:fs";
import { realpathSync } from "node:fs";
import { ReadChangedError, ReadCleanupError, ReadLimitError } from '../../runtime/execution/read.js';
import path from "node:path";
import { approvedResult, deniedResult } from "./toolResultLifecycle.js";
import type { ToolDefinition, ToolExecutionResult } from "../../tools/types.js";
import type { ExecutionAuthority, ExecutionService } from "../../runtime/execution/service.js";
import { truncateLineWidth, truncateHead } from "./truncation.js";
import { ArtifactManager } from "../session/artifactManager.js";
import { matchesGlob } from "./globMatch.js";
import { resolveToolTarget, resolveWorkspaceToolTarget } from './permissionContext.js'
import { resolveWorkspaceRoot } from '../workspace/roots.js';
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

      if (context.abortSignal?.aborted) return deniedResult('Search stopped: cancelled.');
      let searchSubPath: string;
      let searchRoot = context.workspaceRoot;
      try {
        const searchPath = typeof args.path === 'string' && args.path !== '' ? args.path : '.';
        // An attached root may be searched too. Matches are reported relative to
        // the root that was searched, so that same root is the jail.
        const requestedTarget = resolveToolTarget({ path: searchPath }, 'path', context.workspaceRoot);
        searchRoot = context.workspaceRoots?.length
          ? resolveWorkspaceRoot(context.workspaceRoot, context.workspaceRoots, requestedTarget, 'read') ?? context.workspaceRoot
          : context.workspaceRoot;
        const target = resolveWorkspaceToolTarget({ path: searchPath }, 'path', searchRoot);
        context.assertFileAccess?.(target);
        searchSubPath = path.relative(realpathSync(searchRoot), target).split(path.sep).join('/');
        const stat = await fs.stat(target);
        if (!stat.isFile() && !stat.isDirectory()) return deniedResult('Search target must be a file or directory.');
      } catch {
        return deniedResult('Search path is unavailable, denied, or outside the workspace.');
      }
      const globFilter = typeof args.glob === "string" ? args.glob.trim() : "";
      const ignoreCase = Boolean(args.ignoreCase);
      const limit =
        typeof args.limit === "number" && args.limit > 0
          ? Math.min(args.limit, 500)
          : DEFAULT_GREP_LIMIT;

      // ripgrep first, when it is installed. It is what the implementations we
      // compared against run, and the reason is measurable: the in-process walk
      // below reads every file in the workspace one at a time, which is 1.3
      // seconds on this repository for a pattern that occurs twice, against 30
      // milliseconds for `rg`. The walk stays as the fallback rather than being
      // deleted, so a machine without ripgrep still searches — the same
      // degradation the compared implementations use for native dependencies.
      const viaRipgrep = await searchWithRipgrep({
        assertFileAccess: context.assertFileAccess,
        pattern: rawPattern,
        searchPath: searchSubPath,
        ...(globFilter ? { glob: globFilter } : {}),
        ignoreCase,
        limit,
        workspaceRoot: searchRoot,
        abortSignal: context.abortSignal,
      });
      if (viaRipgrep.ok) {
        // Ripgrep reports paths relative to the root it ran in. Under an
        // attached root that relative path would be resolved against the
        // primary root by every later tool, so it is made absolute here too.
        return await reportGrepMatches(
          viaRipgrep.matches.map((match) => formatRipgrepMatch({ ...match,
            path: reportPath(match.path, searchRoot, context.workspaceRoot) }, 500)),
          context.artifactRoot ?? context.workspaceRoot, context.sessionId,
        );
      }

      if (viaRipgrep.reason === 'execution-failure') {
        return deniedResult('Search stopped: execution failed; process cleanup could not be verified.'
          + (viaRipgrep.readCleanupFailed ? ' File handle cleanup also could not be verified.' : ''));
      }

      if (viaRipgrep.reason === 'read-cleanup-failed') {
        return deniedResult('Search stopped: file handle cleanup could not be verified.');
      }

      if (viaRipgrep.reason === 'changed') {
        return deniedResult('Search stopped: a source file changed during reading. Retry with a stable source.');
      }

      if (context.abortSignal?.aborted
        || (viaRipgrep.reason !== "not-installed" && viaRipgrep.reason !== "unavailable")) {
        return deniedResult(`Search stopped: ${context.abortSignal?.aborted ? "cancelled" : viaRipgrep.reason}.`);
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
        assertFileAccess: context.assertFileAccess,
        abortSignal: context.abortSignal,
        absoluteRoot: searchRoot,
        workspaceRoot: searchRoot,
        authority: TOOL_APPROVED_READ_AUTHORITY,
        caller: "core-tool:grep",
        reason: "List approved workspace files for content grep.",
        reportSafeTarget: searchRoot,
      });

      if (context.abortSignal?.aborted) return deniedResult("Search stopped: cancelled.");
      const targetFiles = allFiles.filter((file) => {
        if (searchSubPath && file !== searchSubPath && !file.startsWith(searchSubPath + '/')) {
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
        if (context.abortSignal?.aborted) return deniedResult("Search stopped: cancelled.");
        if (totalMatches >= limit) {
          break;
        }
        const fullPath = path.resolve(searchRoot, relPath);
        try {
          const stat = await fs.stat(fullPath);
          if (!stat.isFile() || stat.size > MAX_SEARCHED_FILE_BYTES) {
            continue;
          }
          const content = await executionService.readTextFile({
            operationKind: 'file.read', absolutePath: fullPath, workspaceRoot: searchRoot,
            authority: TOOL_APPROVED_READ_AUTHORITY, caller: 'core-tool:grep',
            reason: 'Read an approved search candidate.', reportSafeTarget: fullPath,
            assertFileAccess: context.assertFileAccess, abortSignal: context.abortSignal,
            maxBytes: MAX_SEARCHED_FILE_BYTES,
          });
          const lines = content.split("\n");

          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (regex.test(line)) {
              const safeLine = truncateLineWidth(line, 500);
              // Same rule as glob: a path relative to an attached root would be
              // resolved against the primary root by every later tool. An entry
              // that is already absolute must not be joined onto the root again,
              // which would fabricate a different path inside it.
              results.push(`${reportPath(relPath, searchRoot, context.workspaceRoot)}:${i + 1}: ${safeLine}`);
              totalMatches++;
              if (totalMatches >= limit) {
                break;
              }
            }
          }
        } catch (error) {
          if (error instanceof ReadCleanupError) throw error;
          if (error instanceof ReadLimitError) return deniedResult('Search stopped: a candidate exceeded the read byte limit. Narrow the search or use a stable smaller source.');
          if (error instanceof ReadChangedError) return deniedResult('Search stopped: a source file changed during reading. Retry with a stable source.');
          // Skip unreadable files gracefully
        }
      }

      if (context.abortSignal?.aborted) return deniedResult("Search stopped: cancelled.");
      return await reportGrepMatches(results, context.artifactRoot ?? context.workspaceRoot, context.sessionId);
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
/**
 * A reported path is only usable if a later tool can resolve it.
 *
 * Relative paths are resolved against the primary root, so a result is rebased
 * onto that root when it lies inside it (`src/a.ts` for a search of `src`), and
 * reported absolutely when it does not — an attached root, or an entry that
 * arrived already absolute.
 */
function reportPath(file: string, searchRoot: string, primary: string): string {
  const absolute = path.isAbsolute(file) ? file : path.join(searchRoot, file);
  const relative = path.relative(primary, absolute);
  return relative === '' || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)
    ? absolute : relative.split(path.sep).join('/');
}

async function reportGrepMatches(
  matches: readonly string[],
  workspaceRoot: string,
  sessionId?: string,
): Promise<ToolExecutionResult> {
  if (matches.length === 0) {
    return approvedResult("No matches found for the pattern.");
  }

  const rawResult = matches.join("\n");
  const truncated = truncateHead(rawResult, { maxLines: 500, maxBytes: 50 * 1024 });
  let outputText = truncated.content;

  if (truncated.truncated) {
    const artifactManager = ArtifactManager.getShared(workspaceRoot, sessionId);
    const artifact = await artifactManager.save(rawResult, "grep");
    outputText += `\n\n[Showing ${truncated.shownLines} of ${matches.length} matches (${Math.round(truncated.shownBytes / 1024)}KB). Full grep output spilled to: ${artifact.uri}]`;
  }

  return approvedResult(outputText);
}
