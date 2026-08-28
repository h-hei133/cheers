import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { EscalationPrompt } from "../../../sandbox/index.js";

export interface PersistedApprovalGrant {
  readonly projectRoot: string;
  readonly toolName: string;
  readonly operation: string;
  readonly scopeKey: string;
  readonly scopeLabel: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface PersistedApprovalPolicyState {
  readonly grants: readonly PersistedApprovalGrant[];
}

export interface ApprovalTrustGrantView extends PersistedApprovalGrant {
  readonly key: string;
}

export function defaultPolicyFilePath(): string {
  const homeDir = process.env.USERPROFILE || process.env.HOME || os.homedir();
  return path.join(homeDir, ".private-agents", "approval-policy.json");
}

export function normalizeProjectRoot(projectRoot: string): string {
  const resolved = path.resolve(projectRoot.trim());
  let canonical = resolved;
  try {
    canonical = fs.realpathSync.native(resolved);
  } catch {
    canonical = resolved;
  }
  return process.platform === "win32" ? canonical.toLowerCase() : canonical;
}

export function buildCacheKey(projectRoot: string, scopeKey: string): string {
  return `${projectRoot}|${scopeKey}`;
}

export function buildScope(prompt: EscalationPrompt): {
  readonly toolName: string;
  readonly operation: string;
  readonly scopeKey: string;
  readonly scopeLabel: string;
} {
  const toolName = prompt.context.toolName.trim().toLowerCase();
  const operation = prompt.context.operation.trim().toLowerCase();
  const target = prompt.context.target.trim();
  const processMatch =
    toolName === "bash" ? target.match(/^\s*([^\s]+)/) : undefined;
  const processScope = processMatch?.[1]?.toLowerCase();
  const normalizedTarget = target.toLowerCase();
  const scopeKey = processScope
    ? `${toolName}:${operation}:process:${processScope}`
    : `${toolName}:${operation}:target:${normalizedTarget}`;
  const scopeLabel = processScope
    ? `${toolName}/${operation}/process(${processScope})`
    : `${toolName}/${operation}/target(${target})`;

  return {
    toolName,
    operation,
    scopeKey,
    scopeLabel,
  };
}

export function isPersistedGrant(value: unknown): value is PersistedApprovalGrant {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.projectRoot === "string" &&
    typeof candidate.toolName === "string" &&
    typeof candidate.operation === "string" &&
    typeof candidate.scopeKey === "string" &&
    typeof candidate.scopeLabel === "string" &&
    typeof candidate.createdAt === "string" &&
    typeof candidate.updatedAt === "string"
  );
}

export function parsePolicyState(raw: string): PersistedApprovalPolicyState {
  try {
    const parsed = JSON.parse(raw) as { grants?: unknown };
    if (!Array.isArray(parsed.grants)) {
      return { grants: [] };
    }

    return {
      grants: parsed.grants.filter(isPersistedGrant),
    };
  } catch {
    return { grants: [] };
  }
}

export function ensureParentDir(filePath: string): void {
  const dirPath = path.dirname(filePath);
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

export function selectGrantBySelector(
  grants: readonly ApprovalTrustGrantView[],
  selector: string,
): ApprovalTrustGrantView | undefined {
  const normalized = selector.trim();
  if (!normalized) {
    return undefined;
  }

  const numeric = Number.parseInt(normalized, 10);
  if (
    Number.isFinite(numeric) &&
    String(numeric) === normalized &&
    numeric >= 1 &&
    numeric <= grants.length
  ) {
    return grants[numeric - 1];
  }

  return grants.find(
    (grant) =>
      grant.scopeKey === normalized ||
      grant.key === normalized ||
      grant.scopeLabel === normalized,
  );
}
