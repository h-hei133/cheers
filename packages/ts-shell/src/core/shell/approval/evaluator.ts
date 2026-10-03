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
  lsp: true,
  todo: true,
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

export function isReadOnlyBashCommand(command: string): boolean {
  const trimmed = command.trim();
  if (!trimmed) return false;

  // Disallow shell chaining operators, subshells, substitutions, and redirections
  if (/[;&|><`$\\\'"(){}*?\[\]#\x00-\x1f\x7f]/.test(trimmed)) {
    return false;
  }

  const parts = trimmed.split(/\s+/);
  const binary = parts[0];

  if (binary === "git") return isReadOnlyGitCommand(parts.slice(1));

  // Standard read-only inspection commands (POSIX + Windows)
  if (
    binary === "cat" ||
    binary === "ls" ||
    binary === "dir" ||
    binary === "pwd" ||
    binary === "which" ||
    binary === "where" ||
    binary === "type" ||
    binary === "echo" ||
    binary === "head" ||
    binary === "tail" ||
    binary === "wc"
  ) {
    return true;
  }
  return false;
}

// Worktree inspection can invoke configured filters/fsmonitor, while diff and
// history rendering can run external diff, textconv or signature helpers. Those
// commands require approval even when their arguments look read-only.
const READ_ONLY_GIT_FLAGS: Readonly<Record<string, ReadonlySet<string>>> = {
  "rev-parse": new Set(["--git-dir", "--git-common-dir", "--absolute-git-dir", "--show-toplevel", "--show-prefix", "--show-cdup", "--is-inside-work-tree", "--is-bare-repository", "--verify", "--short", "--abbrev-ref", "--symbolic-full-name"]),
  branch: new Set(["--list", "-a", "--all", "-r", "--remotes", "-v", "-vv", "--verbose", "--show-current", "--no-color", "--color=never"]),
};

/** Unrecognized syntax must go through approval; do not guess from a subcommand name. */
function isReadOnlyGitCommand(parts: readonly string[]): boolean {
  const subcommand = parts[0] ?? "";
  const flags = Object.hasOwn(READ_ONLY_GIT_FLAGS, subcommand) ? READ_ONLY_GIT_FLAGS[subcommand] : undefined;
  if (!flags) return false;
  const args = parts.slice(1);
  const separator = args.indexOf("--");
  const listOption = args.indexOf("--list");
  const listsBranches = listOption >= 0 && (separator < 0 || listOption < separator);
  let pathsOnly = false;
  for (let index = 0; index < args.length; index++) {
    const arg = args[index]!;
    if (arg === "--") { pathsOnly = true; continue; }
    if (!pathsOnly && arg.startsWith("-")) {
      if (flags.has(arg)) continue;
      return false;
    }
    // A branch name without explicit --list creates a branch, even after flags.
    if (subcommand === "branch" && !listsBranches) return false;
  }
  return true;
}

export function evaluatePermission(input: {
  readonly scope: string;
  readonly toolName: string;
  readonly selector: string;
  readonly grants: readonly ApprovalTrustGrantView[];
  readonly autoApproveReadOnly?: boolean;
  readonly agentMode?: "plan" | "build";
}): ApprovalEvaluation {
  const isReadOnly =
    Boolean(READONLY_TOOLS[input.toolName]) ||
    (input.toolName === "bash" && isReadOnlyBashCommand(input.selector));

  // Plan mode enforcement:
  // Read-only tools (and read-only bash commands like git branch --show-current) are allowed freely.
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
      reason: `Plan mode is active: file modifications or non-read-only commands via '${input.toolName}' are disabled. Use /build to enable editing.`,
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
