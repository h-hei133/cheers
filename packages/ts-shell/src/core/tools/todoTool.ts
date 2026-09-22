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
      const action = typeof args.action === "string" ? args.action.toLowerCase().trim() : "";
      const validActions = ["add", "start", "done", "clear", "list"];
      if (!action || !validActions.includes(action)) {
        return deniedResult(`Error: action must be one of: ${validActions.join(", ")} (received: "${action}")`);
      }

      const cmdArgs: string[] = [action];
      if (action === "add") {
        const taskText = typeof args.task === "string" ? args.task.trim() : "";
        if (!taskText) {
          return deniedResult("Error: task parameter is required for 'add' action.");
        }
        cmdArgs.push(taskText);
      } else if (action === "done" || action === "start") {
        const numericId = Number(args.id);
        if (!Number.isFinite(numericId) || isNaN(numericId)) {
          return deniedResult(`Error: valid numeric id parameter is required for '${action}' action.`);
        }
        cmdArgs.push(String(numericId));
      }

      const result = await runTodoCommand(action === "list" ? [] : cmdArgs, {
        cwd: context.workspaceRoot,
        sessionId: context.taskId,
      });

      return approvedResult(result.output);
    },
  };
}
