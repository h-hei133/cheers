import { approvedResult, deniedResult } from "./toolResultLifecycle.js";
import type { ToolDefinition } from "../../tools/types.js";
import { runTodoCommand } from "../commands/todoCommandRuntime.js";

/**
 * /todo tool
 * Allows the agent to programmatically manage and advance the structured task list.
 */
export function createTodoToolDefinition(): ToolDefinition {
  return {
    name: "todo",
    description:
      "Manage the session task list (add, start, done, clear, or list tasks) to maintain structured task execution.",
    argsSchema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["add", "start", "done", "clear", "list"],
          description: "Todo action to perform.",
        },
        task: {
          type: "string",
          description: "Task description for add action.",
        },
        id: {
          type: "number",
          description: "Task ID for start or done action.",
        },
      },
      required: ["action"],
    },
    permissions: { check: () => [] },
    async execute(args, context) {
      const action = typeof args.action === "string" ? args.action.toLowerCase() : "";
      if (!action) {
        return deniedResult("Error: action parameter is required for todo tool.");
      }

      const cmdArgs: string[] = [action];
      if (action === "add" && typeof args.task === "string") {
        cmdArgs.push(args.task);
      } else if ((action === "done" || action === "start") && typeof args.id === "number") {
        cmdArgs.push(String(args.id));
      }

      const result = await runTodoCommand(action === "list" ? [] : cmdArgs, {
        cwd: context.workspaceRoot,
        sessionId: context.taskId,
      });

      return approvedResult(result.output);
    },
  };
}
