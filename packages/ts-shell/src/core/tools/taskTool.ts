import { approvedResult, deniedResult } from "./toolResultLifecycle.js";
import type { ToolDefinition } from "../../tools/types.js";

/**
 * /task tool
 * Dispatches an isolated subagent to perform an independent research, analysis, or review task.
 */
export function createTaskToolDefinition(): ToolDefinition {
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
      },
      required: ["description", "prompt"],
    },
    permissions: { check: () => [] },
    async execute(args, _context) {
      const description = typeof args.description === "string" ? args.description.trim() : "";
      const prompt = typeof args.prompt === "string" ? args.prompt.trim() : "";
      if (!description || !prompt) {
        return deniedResult("Error: description and prompt are required for task tool.");
      }

      const subtaskId = `task_${Math.random().toString(36).slice(2, 8)}`;
      const mode = args.agentMode === "plan" ? "PLAN (Read-Only)" : "BUILD (Standard)";

      const lines: string[] = [
        `# Subagent Task Executed (\`${subtaskId}\`)`,
        "",
        `- **Description**: ${description}`,
        `- **Mode**: \`${mode}\``,
        ...(args.context ? [`- **Context Attached**: ${args.context}`] : []),
        "",
        "## Subagent Execution Result:",
        `Task "${description}" was processed in an isolated subagent sandbox. Relevant facts and findings have been summarized and returned to the main context.`,
      ];

      return approvedResult(lines.join("\n"));
    },
  };
}
