import path from "node:path";
import type { PermissionScope } from "../../cli/approval/permissionScope.js";
import type { EscalationPrompt } from "../../sandbox/index.js";
import { isReadOnlyBashCommand } from "../shell/approval/evaluator.js";

export interface ToolPermissionEvaluation {
  readonly requiresEscalation: boolean;
  readonly operation: "read" | "write" | "delete" | "execute";
  readonly target: string;
  readonly reason: string;
}

const READ_ONLY_TOOLS: Record<string, true> = {
  read: true,
  glob: true,
  grep: true,
  lsp: true,
  web_search: true,
  web_fetch: true,
  todo: true,
  ask: true,
};

const READ_ONLY_BROWSER_ACTIONS: Record<string, true> = {
  observe: true,
  extract: true,
  url: true,
  title: true,
};

export function evaluateToolPermissionScope(
  toolName: string,
  args: Record<string, unknown> = {},
  scope: PermissionScope = "ask",
  workspaceRoot: string = process.cwd(),
): ToolPermissionEvaluation {
  let operation: "read" | "write" | "delete" | "execute" = "read";
  let target = "";
  let isReadOnly = false;

  if (READ_ONLY_TOOLS[toolName]) {
    operation = "read";
    target = String(args.path ?? args.pattern ?? args.query ?? args.url ?? toolName);
    isReadOnly = true;
  } else if (toolName === "write" || toolName === "edit") {
    operation = "write";
    target = typeof args.path === "string" ? args.path : "(unspecified path)";
    isReadOnly = false;
  } else if (toolName === "bash") {
    const cmd = typeof args.command === "string" ? args.command.trim() : "";
    target = cmd || "bash";
    if (isReadOnlyBashCommand(cmd)) {
      operation = "read";
      isReadOnly = true;
    } else if (/^\s*(rm|rmdir|unlink)\b/.test(cmd)) {
      operation = "delete";
      isReadOnly = false;
    } else {
      operation = "execute";
      isReadOnly = false;
    }
  } else if (toolName === "browser") {
    const action = typeof args.action === "string" ? args.action.toLowerCase().trim() : "";
    target = typeof args.url === "string" ? args.url : action || "browser";
    if (READ_ONLY_BROWSER_ACTIONS[action]) {
      operation = "read";
      isReadOnly = true;
    } else {
      operation = "execute";
      isReadOnly = false;
    }
  } else if (toolName === "task") {
    operation = "execute";
    target = typeof args.task === "string" ? args.task : "subagent task";
    isReadOnly = false;
  } else {
    operation = "execute";
    target = toolName;
    isReadOnly = false;
  }

  if (scope === "allow-all") {
    return {
      requiresEscalation: false,
      operation,
      target,
      reason: "Allowed by permission scope 'allow-all'",
    };
  }

  if (isReadOnly) {
    return {
      requiresEscalation: false,
      operation,
      target,
      reason: `Read-only operation allowed in '${scope}' mode`,
    };
  }

  if (scope === "accept-edits") {
    if (operation === "write" || operation === "delete") {
      const resolved = path.isAbsolute(target) ? target : path.resolve(workspaceRoot, target);
      const rel = path.relative(workspaceRoot, resolved);
      const isInside = !rel.startsWith("..") && !path.isAbsolute(rel);
      if (isInside) {
        return {
          requiresEscalation: false,
          operation,
          target,
          reason: `File modification inside workspace allowed in 'accept-edits' mode`,
        };
      }
    }
    return {
      requiresEscalation: true,
      operation,
      target,
      reason: `Operation '${toolName}' (${operation}) requires escalation in 'accept-edits' mode`,
    };
  }

  return {
    requiresEscalation: true,
    operation,
    target,
    reason: `Operation '${toolName}' (${operation}) requires user approval in 'ask' mode`,
  };
}

export function buildToolEscalationPrompt(
  toolName: string,
  operation: string,
  target: string,
  reason: string,
): EscalationPrompt {
  const id = `esc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const isDangerous = operation === "delete" || operation === "execute";
  const severity = isDangerous ? "high" : "medium";
  return {
    id,
    title: `${toolName} ${operation}: ${target}`,
    message: `Tool '${toolName}' requested ${operation} on '${target}'. ${reason}`,
    context: {
      toolName,
      operation,
      target,
    },
    options: [
      { value: "allow-once", label: "Allow Once", description: "Allow this operation once" },
      { value: "allow-always", label: "Allow Always", description: "Always allow similar operations in this project" },
      { value: "deny", label: "Deny", description: "Deny this operation" },
    ],
    defaultOption: "deny",
    recommendedAction: isDangerous ? "Deny unless you trust this operation." : "Allow Once is recommended.",
    severity,
  };
}
