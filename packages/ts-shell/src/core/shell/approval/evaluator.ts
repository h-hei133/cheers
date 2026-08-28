import path from "node:path";
import type {
  ApprovalEvaluation,
  ApprovalTrustGrantView,
  PermissionBehavior,
} from "./types.js";

export const READONLY_TOOLS: Record<string, true> = {
  read: true,
  glob: true,
  grep: true,
  search: true,
  list: true,
  view: true,
  status: true,
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
}): ApprovalEvaluation {
  // Check read-only tool auto-approval
  if (input.autoApproveReadOnly && READONLY_TOOLS[input.toolName]) {
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
