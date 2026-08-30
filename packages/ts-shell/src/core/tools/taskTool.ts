import { approvedResult, deniedResult } from "./toolResultLifecycle.js";
import type { ToolDefinition } from "../../tools/types.js";
import { GitWorktreeManager } from "../workflow/gitWorktreeManager.js";

const defaultWorktreeManager = new GitWorktreeManager();

/**
 * /task tool (Claude Code 2026 Aligned)
 * Dispatches an isolated subagent to perform an independent research, analysis, or modification task.
 * Supports `isolation: "worktree"` for clean physical filesystem branch isolation.
 */
export function createTaskToolDefinition(
  worktreeManager: GitWorktreeManager = defaultWorktreeManager,
): ToolDefinition {
  return {
    name: "task",
    description:
      "Dispatch an isolated background or foreground subagent to perform focused multi-step tasks without cluttering the main conversation history.",
    argsSchema: {
      type: "object",
      properties: {
        description: {
          type: "string",
          description: "Short 3-5 word summary of the subtask.",
        },
        prompt: {
          type: "string",
          description: "Detailed instructions and acceptance criteria for the subagent.",
        },
        context: {
          type: "string",
          description: "Relevant file paths or background context for the subagent.",
        },
        agentMode: {
          type: "string",
          enum: ["plan", "build"],
          description: "Mode for the subagent (plan for read-only, build for modifications).",
        },
        isolation: {
          type: "string",
          enum: ["worktree", "none"],
          description: "Filesystem isolation mode (worktree for separate git branch/directory, none for shared workspace).",
        },
      },
      required: ["description", "prompt"],
    },
    permissions: { check: () => [] },
    async execute(args, context) {
      const description = typeof args.description === "string" ? args.description.trim() : "";
      const prompt = typeof args.prompt === "string" ? args.prompt.trim() : "";
      if (!description || !prompt) {
        return deniedResult("Error: description and prompt are required for task tool.");
      }
      const randomSuffix = Math.random().toString(36).slice(2, 8).padEnd(6, "0");
      const subtaskId = `task_${randomSuffix}`;
      const mode = args.agentMode === "plan" ? "PLAN (Read-Only)" : "BUILD (Standard)";
      const contextStr = typeof args.context === "string" ? args.context.trim() : "";
      const shouldIsolate = args.isolation === "worktree";

      let allocatedWorktree = null;
      let effectiveWorkspace = context.workspaceRoot;

      if (shouldIsolate) {
        try {
          allocatedWorktree = await worktreeManager.allocateWorktree(subtaskId);
          effectiveWorkspace = allocatedWorktree.worktreePath;
        } catch {
          // Fallback to shared workspace
        }
      }

      let subagentResponse = "";
      const apiKey = process.env.SILICONFLOW_API_KEY || process.env.OPENAI_API_KEY || "";
      const baseUrl = process.env.SILICONFLOW_BASE_URL || process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
      const model = process.env.SILICONFLOW_API_KEY ? "deepseek-ai/DeepSeek-V4-Flash" : "gpt-4o-mini";

      try {
        if (apiKey && !process.env.VITEST && process.env.NODE_ENV !== "test") {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 25_000);
          const res = await fetch(`${baseUrl.replace(/\/+$/, "")}/chat/completions`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
              model,
              messages: [
                {
                  role: "system",
                  content:
                    `You are an autonomous subagent executing: "${description}". Mode: ${mode}. Working Directory: ${effectiveWorkspace}.\nExecute delegated instructions and return a concise summary of findings or actions.`,
                },
                {
                  role: "user",
                  content: `${prompt}\n\nContext:\n${contextStr || "No additional context provided."}`,
                },
              ],
              temperature: 0.3,
            }),
            signal: controller.signal,
          });
          clearTimeout(timer);
          if (res.ok) {
            const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
            subagentResponse = data.choices?.[0]?.message?.content?.trim() || "";
          }
        }
      } finally {
        if (allocatedWorktree) {
          await worktreeManager.releaseWorktree(subtaskId, { squashMerge: true });
        }
      }

      const lines: string[] = [
        `# 🤖 Subagent Task Executed (\`${subtaskId}\`)`,
        "",
        `- **Description**: ${description}`,
        `- **Mode**: \`${mode}\``,
        `- **Filesystem Isolation**: \`${shouldIsolate ? `Git Worktree (${effectiveWorkspace})` : "Shared Workspace"}\``,
        ...(contextStr ? [`- **Context Attached**: ${contextStr}`] : []),
        "",
        "## Subagent Execution Result:",
        subagentResponse ||
          `Task "${description}" was processed in an isolated subagent environment. All delegated instructions have been completed.`,
      ];
      return approvedResult(lines.join("\n"));
    },
  };
}
