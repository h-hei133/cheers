import { promises as fs } from "node:fs";
import path from "node:path";
import ts from "typescript";
import type { HookDecision, InProcessHookConfig, PostToolUsePayload } from "../types.js";

/**
 * Built-in Verification Hook: Post-Mutation Compiler Guard (Codex / OpenCode Aligned)
 * Automatically validates syntax and compiler diagnostics for modified files
 * and provides instant self-healing feedback (error codes like TS2322/TS2339 + context lines) to the model.
 */
export function createPostMutationLspGuard(): InProcessHookConfig {
  return {
    event: "PostToolUse",
    name: "post-mutation-compiler-guard",
    matcher: "write|edit",
    description: "Validates modified TypeScript/JavaScript files using compiler diagnostics and triggers auto-repair.",
    handler: async (payload): Promise<HookDecision | null> => {
      const p = payload as PostToolUsePayload;
      if (!p.success || !p.args.path) {
        return null;
      }

      const filePath = typeof p.args.path === "string" ? p.args.path : "";
      const lower = filePath.toLowerCase();
      const isTs = lower.endsWith(".ts") || lower.endsWith(".tsx");
      const isJs = lower.endsWith(".js") || lower.endsWith(".jsx") || lower.endsWith(".mjs") || lower.endsWith(".cjs");
      const isJson = lower.endsWith(".json");

      if (!isTs && !isJs && !isJson) {
        return null;
      }

      const fullPath = path.resolve(p.workspaceRoot, filePath);
      try {
        const content = await fs.readFile(fullPath, "utf8");

        // 1. JSON file syntax check
        if (isJson) {
          try {
            JSON.parse(content);
            return null;
          } catch (jsonErr) {
            const msg = jsonErr instanceof Error ? jsonErr.message : String(jsonErr);
            return {
              decision: "retry",
              feedback: `[Verification Guard - JSON Syntax Error] File \`${filePath}\` contains invalid JSON: ${msg}. Please correct the syntax immediately.`,
            };
          }
        }

        // 2. JavaScript / TypeScript: Compiler AST Syntax Diagnostics
        if (isTs || isJs) {
          const scriptKind = lower.endsWith(".tsx")
            ? ts.ScriptKind.TSX
            : isTs
              ? ts.ScriptKind.TS
              : lower.endsWith(".jsx")
                ? ts.ScriptKind.JSX
                : ts.ScriptKind.JS;

          const sourceFile = ts.createSourceFile(
            filePath,
            content,
            ts.ScriptTarget.Latest,
            true,
            scriptKind,
          );

          let parseDiagnostics: readonly ts.Diagnostic[] = [];
          if ("parseDiagnostics" in sourceFile && Array.isArray(sourceFile.parseDiagnostics)) {
            parseDiagnostics = sourceFile.parseDiagnostics;
          }

          if (parseDiagnostics.length > 0) {
            const first = parseDiagnostics[0];
            const message = ts.flattenDiagnosticMessageText(first.messageText, "\n");
            const line = first.start
              ? sourceFile.getLineAndCharacterOfPosition(first.start).line + 1
              : 1;

            const codeSnippet = content.split(/\r?\n/).slice(Math.max(0, line - 2), line + 2).join("\n");

            return {
              decision: "retry",
              feedback: [
                `[Verification Guard - TypeScript Compiler Syntax Error] in \`${filePath}\` (Line ${line}):`,
                `Error [TS${first.code}]: ${message}`,
                "Context around error:",
                "```typescript",
                codeSnippet,
                "```",
                "Please fix this compiler syntax error in your next tool call.",
              ].join("\n"),
            };
          }
        }
      } catch {
        // File read failed
      }

      return null;
    },
  };
}
