import path from "node:path";
import type {
  ApprovalEvaluation,
  ApprovalTrustGrantView,
} from "./types.js";

export const READONLY_TOOLS: Record<string, true> = {
  read: true,
  glob: true,
  grep: true,
  search: true,
  list: true,
  view: true,
  status: true,
  web_fetch: true,
  web_search: true,
  "git-status": true,
  "git-diff": true,
};
export const DESTRUCTIVE_TOOLS: Record<string, true> = {
  bash: true,
  eval: true,
  write: true,
  edit: true,
  rm: true,
};

export function buildScope(projectRoot: string): string {
  return path.resolve(projectRoot);
}

export function buildCacheKey(
  scope: string,
  toolName: string,
  selector: string,
): string {
  return `${scope}::${toolName}::${selector}`;
}

export function selectGrantBySelector(
  grants: readonly ApprovalTrustGrantView[],
  scope: string,
  toolName: string,
  selector: string,
  nowIso: string = new Date().toISOString(),
): ApprovalTrustGrantView | undefined {
  return grants.find((grant) => {
    if (grant.scope !== scope || grant.toolName !== toolName) {
      return false;
    }
    if (grant.expiresAt && grant.expiresAt <= nowIso) {
      return false;
    }
    if (grant.selector === "*" || grant.selector === selector) {
      return true;
    }
    // Prefix wildcard match
    if (grant.selector.endsWith("*")) {
      const prefix = grant.selector.slice(0, -1);
      return selector.startsWith(prefix);
    }
    return false;
  });
}

export function evaluatePermission(input: {
  readonly scope: string;
  readonly toolName: string;
  readonly selector: string;
  readonly grants: readonly ApprovalTrustGrantView[];
  readonly autoApproveReadOnly?: boolean;
  readonly agentMode?: "plan" | "build";
}): ApprovalEvaluation {
  const isReadOnly = Boolean(READONLY_TOOLS[input.toolName]);

  // Plan mode enforcement (Inspired by Claude Code permissions):
  // Read-only tools are allowed freely to explore the codebase.
  // Write/destructive tools are hard-blocked with an explicit explanation.
  if (input.agentMode === "plan") {
    if (isReadOnly) {
      return {
        behavior: "allow",
        granted: true,
        reason: `Plan mode allows read-only tool '${input.toolName}' for codebase exploration.`,
      };
    }
    return {
      behavior: "deny",
      granted: false,
      reason: `Plan mode is active: file modifications via '${input.toolName}' are disabled. Use /build to enable editing.`,
    };
  }

  // Check read-only tool auto-approval in build/default mode
  if (input.autoApproveReadOnly && isReadOnly) {
    return {
      behavior: "allow",
      granted: true,
      reason: `Tool '${input.toolName}' is classified safe read-only and automatically allowed.`,
    };
  }

  // Check matching grant from session or persisted store
  const matched = selectGrantBySelector(
    input.grants,
    input.scope,
    input.toolName,
    input.selector,
  );
  if (matched) {
    return {
      behavior: "allow",
      granted: true,
      reason: `Matched trust grant for '${input.toolName}' on '${matched.selector}'.`,
      matchedGrant: matched,
    };
  }

  // Default ask for mutation/destructive operations
  const isDestructive = Boolean(DESTRUCTIVE_TOOLS[input.toolName]);
  return {
    behavior: "ask",
    granted: false,
    reason: isDestructive
      ? `Tool '${input.toolName}' requires user confirmation before execution.`
      : `No trust rule found for '${input.toolName}' on '${input.selector}'.`,
  };
}
