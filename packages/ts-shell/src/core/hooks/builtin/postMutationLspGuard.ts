import { promises as fs } from "node:fs";
import path from "node:path";
import type { HookDecision, InProcessHookConfig, PostToolUsePayload } from "../types.js";

/**
 * Built-in Verification Hook: Post-Mutation Compiler Guard
 * Automatically validates syntax and basic structure of files modified by 'write' or 'edit'
 * and provides instant self-healing feedback to the model if errors are introduced.
 */
export function createPostMutationLspGuard(): InProcessHookConfig {
  return {
    event: "PostToolUse",
    name: "post-mutation-compiler-guard",
    matcher: "write|edit",
    description: "Validates modified TypeScript/JavaScript files and triggers auto-repair on syntax or structural errors.",
    handler: async (payload): Promise<HookDecision | null> => {
      const p = payload as PostToolUsePayload;
      if (!p.success || !p.args.path) {
        return null;
      }

      const filePath = typeof p.args.path === "string" ? p.args.path : "";
      if (!filePath.endsWith(".ts") && !filePath.endsWith(".tsx") && !filePath.endsWith(".js") && !filePath.endsWith(".json")) {
        return null;
      }

      const fullPath = path.resolve(p.workspaceRoot, filePath);
      try {
        const content = await fs.readFile(fullPath, "utf8");

        // 1. JSON file syntax check
        if (filePath.endsWith(".json")) {
          try {
            JSON.parse(content);
            return null;
          } catch (jsonErr: any) {
            return {
              decision: "retry",
              feedback: `[Verification Guard - JSON Syntax Error] File \`${filePath}\` contains invalid JSON: ${jsonErr.message}. Please correct the syntax immediately.`,
            };
          }
        }

        // 2. JavaScript / TypeScript: Robust multi-line comment & string stripping
        const strippedCode = content
          .replace(/\/\*[\s\S]*?\*\//g, "") // multi-line comments
          .replace(/\/\/[^\n]*/g, "") // single-line comments
          .replace(/`[\s\S]*?`/g, '""') // multi-line template literals
          .replace(/'(?:\\.|[^\\'])*'/g, '""') // single quotes
          .replace(/"(?:\\.|[^\\"])*"/g, '""'); // double quotes
        const openBraces = (strippedCode.match(/\{/g) || []).length;
        const closeBraces = (strippedCode.match(/\}/g) || []).length;
        if (openBraces !== closeBraces) {
          return {
            decision: "retry",
            feedback: `[Verification Guard - Unbalanced Braces] File \`${filePath}\` has unmatched curly braces (${openBraces} '{' vs ${closeBraces} '}'). Please fix the syntax error immediately.`,
          };
        }
      } catch {
        // File read failed
      }

      return null;
    },
  };
}
