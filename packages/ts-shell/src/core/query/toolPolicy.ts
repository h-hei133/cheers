import path from "node:path";
import type { PermissionScope } from "../../cli/approval/permissionScope.js";
import type { EscalationPrompt } from "../shell/approval/contract.js";
import { isReadOnlyBashCommand } from "../shell/approval/evaluator.js";
import { matchDenyRule, type DenyRule } from "../shell/approval/deny.js";
import type { ToolDefinition } from "../../tools/types.js";
import { filePolicyTargets } from "../tools/permissionContext.js";

export interface ToolPermissionEvaluation {
  readonly requiresEscalation: boolean;
  readonly operation: "read" | "write" | "delete" | "execute";
  readonly target: string;
  readonly reason: string;
  /**
   * Set when a rule refuses this call outright.
   *
   * Separate from `requiresEscalation` because the two mean opposite things: an
   * escalation is a question, and a refusal is an answer. A caller that only
   * read `requiresEscalation` would offer to ask the user about a call the user
   * had already forbidden, and a user who said "never" would be asked again.
   */
  readonly denied?: boolean;
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

export const READ_ONLY_BROWSER_ACTIONS: Record<string, true> = {
  observe: true,
  extract: true,
  url: true,
  title: true,
  screenshot: true,
  ariasnapshot: true,
};

/** Plan eligibility only; approval and deny rules still apply to eligible calls. */
export function toolPlanMode(name: string, tool?: ToolDefinition): "allowed" | "read-only" | "blocked" {
  if (Object.hasOwn(READ_ONLY_TOOLS, name)) return "allowed";
  if (name === "bash" || name === "browser") return "read-only";
  return tool?.mcpAnnotations?.readOnlyHint === true ? "allowed" : "blocked";
}

export function planModeBlock(
  agentMode: "plan" | "build" | undefined,
  name: string,
  args: Record<string, unknown>,
  tool?: ToolDefinition,
): string | undefined {
  if (agentMode !== "plan" || toolPlanMode(name, tool) === "allowed") return undefined;
  if (name === "bash" && typeof args.command === "string" && isReadOnlyBashCommand(args.command)) return undefined;
  if (name === "browser" && typeof args.action === "string" && Object.hasOwn(READ_ONLY_BROWSER_ACTIONS, args.action.toLowerCase().trim())) return undefined;
  return `Blocked: Plan mode is active. Tool '${name}' ${name === "bash" ? "with non-read-only command " : ""}is not permitted in plan mode. Switch to build mode via /build to execute modifications or commands.`;
}

/**
 * The same target with `.` and `..` resolved, so a prefix rule sees one spelling.
 *
 * Returns the input unchanged when it is not a path — a bash command or a URL is
 * compared as written, because those are not resolved against the workspace and
 * rewriting them would compare a rule against something the tool never runs.
 */
function normalizedPathTarget(target: string, workspaceRoot: string, isFileTarget: boolean): string {
  if (!isFileTarget) {
    if (target === "" || target.startsWith("(")) return target;
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(target)) return target;
    if (/[\s|&;<>$`()]/.test(target)) return target;
  }
  const root = path.resolve(workspaceRoot);
  const resolved = path.resolve(root, target);
  return resolved === root ? target : path.relative(root, resolved) || target;
}

export function evaluateToolPermissionScope(
  toolName: string,
  args: Record<string, unknown> = {},
  scope: PermissionScope = "ask",
  workspaceRoot: string = process.cwd(),
  denyRules: readonly DenyRule[] = [],
): ToolPermissionEvaluation {
  const safeArgs = args && typeof args === "object" ? args : {};
  let operation: "read" | "write" | "delete" | "execute" = "read";
  let target = "";
  let isReadOnly = false;

  if (Object.hasOwn(READ_ONLY_TOOLS, toolName)) {
    operation = "read";
    target = String(safeArgs.path ?? safeArgs.filePath ?? safeArgs.pattern ?? safeArgs.query ?? safeArgs.url ?? toolName);
    isReadOnly = true;
  } else if (toolName === "write" || toolName === "edit") {
    operation = "write";
    const rawPath = typeof safeArgs.path === "string" ? safeArgs.path : "";
    target = rawPath || "(unspecified path)";
    isReadOnly = false;
  } else if (toolName === "bash") {
    const cmd = typeof safeArgs.command === "string" ? safeArgs.command : "";
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
    const action = typeof safeArgs.action === "string" ? safeArgs.action.toLowerCase().trim() : "";
    target = typeof safeArgs.url === "string" ? safeArgs.url : action || "browser";
    if (Object.hasOwn(READ_ONLY_BROWSER_ACTIONS, action)) {
      operation = "read";
      isReadOnly = true;
    } else {
      operation = "execute";
      isReadOnly = false;
    }
  } else if (toolName === "task") {
    operation = "execute";
    target =
      typeof safeArgs.description === "string" && safeArgs.description.trim()
        ? safeArgs.description.trim()
        : typeof safeArgs.prompt === "string" && safeArgs.prompt.trim()
          ? safeArgs.prompt.trim().slice(0, 80)
          : typeof safeArgs.task === "string" && safeArgs.task.trim()
            ? safeArgs.task.trim()
            : "subagent task";
    isReadOnly = false;
  } else {
    operation = "execute";
    target = toolName;
    isReadOnly = false;
  }

  // Before every scope branch, because a refusal is not a scope. `allow-all`
  // allows what approval governs; it does not un-write a rule the user wrote,
  // and a scope that could override one would make the rule a suggestion.
  //
  // Matched against the path as written *and* against its normalized form,
  // because a prefix rule is only as good as the spelling it is compared to.
  // `src/secrets` is the same file as `./src/secrets` and as
  // `src/other/../secrets`, and a rule that refused the first while letting the
  // other two through would be defeated by writing the path differently — which
  // costs nothing and is not something a user would think to defend against.
  const denied =
    matchDenyRule(denyRules, toolName, target) ??
    (toolName === "bash" ? matchDenyRule(denyRules, toolName, target.trim()) : undefined) ??
    matchDenyRule(denyRules, toolName, normalizedPathTarget(toolName === "bash" ? target.trim() : target, workspaceRoot,
      ["read", "write", "edit"].includes(toolName) && typeof safeArgs.path === "string")) ??
    filePolicyTargets(toolName, safeArgs, workspaceRoot)
      .map(candidate => matchDenyRule(denyRules, toolName, candidate)).find(Boolean);
  if (denied) {
    return {
      requiresEscalation: false,
      denied: true,
      operation,
      target,
      reason:
        `Refused by a rule: '${denied.rule.tool}'` +
        `${denied.rule.pattern ? ` matching '${denied.rule.pattern}'` : ""} is not permitted.`,
    };
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
    // accept-edits is strictly a statement about workspace file edits (write/edit).
    // Process spawns, shell commands (including bash rm), and network operations
    // must always require user escalation.
    if ((toolName === "write" || toolName === "edit") && (operation === "write" || operation === "delete")) {
      const rawPath = typeof safeArgs.path === "string" ? safeArgs.path : "";
      if (!rawPath.trim()) {
        return {
          requiresEscalation: true,
          operation,
          target,
          reason: `Operation '${toolName}' with missing target path requires escalation`,
        };
      }
      const resolved = path.isAbsolute(target) ? target : path.resolve(workspaceRoot, target);
      const rel = path.relative(workspaceRoot, resolved);
      const isInside = rel.length > 0 && !rel.startsWith("..") && !path.isAbsolute(rel);
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
