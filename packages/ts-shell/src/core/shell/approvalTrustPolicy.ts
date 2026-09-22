import fs from "node:fs";
import path from "node:path";
import type { EscalationPrompt } from "../../sandbox/index.js";
import {
  buildCacheKey,
  buildScope,
  defaultPolicyFilePath,
  ensureParentDir,
  normalizeProjectRoot,
  parsePolicyState,
  selectGrantBySelector,
  type ApprovalTrustGrantView,
  type PersistedApprovalGrant,
  type PersistedApprovalPolicyState,
} from "./approval/store.js";

export type {
  ApprovalTrustGrantView,
  PersistedApprovalGrant,
} from "./approval/store.js";

export interface ApprovalEvaluation {
  readonly cacheKey: string;
  readonly scopeLabel: string;
  readonly matchedGrant?: PersistedApprovalGrant;
  readonly projectScopedCandidates: readonly PersistedApprovalGrant[];
  readonly sameOperationCandidates: readonly PersistedApprovalGrant[];
}

export interface ApprovalLastHit {
  readonly source: "allow-once-cache" | "allow-always-policy";
  readonly projectRoot: string;
  readonly scopeLabel: string;
  readonly cacheKey: string;
  readonly at: string;
}

export class ApprovalTrustPolicy {
  private readonly policyFilePath: string;
  private readonly allowOnceCache = new Set<string>();
  private lastHit: ApprovalLastHit | null = null;

  constructor(policyFilePath?: string) {
    this.policyFilePath = policyFilePath ?? defaultPolicyFilePath();
  }

  evaluate(prompt: EscalationPrompt, projectRoot: string): ApprovalEvaluation {
    const normalizedProjectRoot = normalizeProjectRoot(projectRoot);
    const scope = buildScope(prompt);
    const state = this.readState();
    const projectScopedCandidates = state.grants.filter(
      (grant) => grant.projectRoot === normalizedProjectRoot,
    );
    const sameOperationCandidates = projectScopedCandidates.filter(
      (grant) =>
        grant.toolName === scope.toolName && grant.operation === scope.operation,
    );
    const matchedGrant = sameOperationCandidates.find(
      (grant) => grant.scopeKey === scope.scopeKey,
    );

    return {
      cacheKey: buildCacheKey(normalizedProjectRoot, scope.scopeKey),
      scopeLabel: scope.scopeLabel,
      matchedGrant,
      projectScopedCandidates,
      sameOperationCandidates,
    };
  }

  hasAllowOnce(cacheKey: string): boolean {
    return this.allowOnceCache.has(cacheKey);
  }

  rememberAllowOnce(cacheKey: string): void {
    this.allowOnceCache.add(cacheKey);
  }

  consumeAllowOnce(cacheKey: string): boolean {
    const had = this.allowOnceCache.has(cacheKey);
    if (had) {
      this.allowOnceCache.delete(cacheKey);
    }
    return had;
  }

  recordLastHit(input: {
    source: ApprovalLastHit["source"];
    projectRoot: string;
    scopeLabel: string;
    cacheKey: string;
  }): void {
    this.lastHit = {
      source: input.source,
      projectRoot: normalizeProjectRoot(input.projectRoot),
      scopeLabel: input.scopeLabel,
      cacheKey: input.cacheKey,
      at: new Date().toISOString(),
    };
  }

  getLastHit(): ApprovalLastHit | null {
    return this.lastHit;
  }

  rememberAllowAlways(
    prompt: EscalationPrompt,
    projectRoot: string,
  ): PersistedApprovalGrant {
    const normalizedProjectRoot = normalizeProjectRoot(projectRoot);
    const scope = buildScope(prompt);
    const state = this.readState();
    const now = new Date().toISOString();
    const nextGrant: PersistedApprovalGrant = {
      projectRoot: normalizedProjectRoot,
      toolName: scope.toolName,
      operation: scope.operation,
      scopeKey: scope.scopeKey,
      scopeLabel: scope.scopeLabel,
      createdAt: now,
      updatedAt: now,
    };

    const deduped = state.grants.filter(
      (grant) =>
        !(
          grant.projectRoot === normalizedProjectRoot &&
          grant.toolName === scope.toolName &&
          grant.operation === scope.operation &&
          grant.scopeKey === scope.scopeKey
        ),
    );
    const trimmed = [nextGrant, ...deduped].slice(0, 300);
    this.writeState({ grants: trimmed });
    return nextGrant;
  }

  explain(
    evaluation: ApprovalEvaluation,
    projectRoot: string,
    viewMode: "compact" | "verbose",
  ): readonly string[] {
    const lines: string[] = [];
    const projectName =
      path.basename(projectRoot.trim()) || normalizeProjectRoot(projectRoot);
    lines.push(`Trust boundary project: ${projectName}`);
    lines.push(`Scope key: ${evaluation.scopeLabel}`);

    if (evaluation.matchedGrant) {
      lines.push("Decision basis: matched stored allow-always grant.");
      return lines;
    }

    if (evaluation.sameOperationCandidates.length > 0) {
      lines.push(
        `Why asked again: stored allow-always exists for this tool/operation, but current target scope is different.`,
      );
      if (viewMode === "verbose") {
        lines.push(
          `Known scopes in this project: ${evaluation.sameOperationCandidates
            .slice(0, 3)
            .map((candidate) => candidate.scopeLabel)
            .join(" | ")}`,
        );
      }
      return lines;
    }

    if (evaluation.projectScopedCandidates.length > 0) {
      lines.push(
        "Why asked again: this project has trust grants, but none for this tool/operation.",
      );
      return lines;
    }

    lines.push(
      "Why asked again: no allow-always grant exists for this project scope yet.",
    );
    return lines;
  }

  listGrants(projectRoot?: string): readonly ApprovalTrustGrantView[] {
    const normalizedProjectRoot = projectRoot
      ? normalizeProjectRoot(projectRoot)
      : undefined;
    const grants = this.readState().grants
      .filter((grant) =>
        normalizedProjectRoot
          ? grant.projectRoot === normalizedProjectRoot
          : true,
      )
      .map((grant) => ({
        ...grant,
        key: buildCacheKey(grant.projectRoot, grant.scopeKey),
      }))
      .sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      );

    return grants;
  }

  revokeGrant(projectRoot: string, selector: string): {
    removed: number;
    removedGrant?: ApprovalTrustGrantView;
  } {
    const normalizedProjectRoot = normalizeProjectRoot(projectRoot);
    const current = this.listGrants(normalizedProjectRoot);
    const state = this.readState();
    const selected = selectGrantBySelector(current, selector);
    if (!selected) {
      return { removed: 0 };
    }

    const nextGrants = state.grants.filter(
      (grant) =>
        !(
          grant.projectRoot === normalizedProjectRoot &&
          grant.scopeKey === selected.scopeKey &&
          grant.toolName === selected.toolName &&
          grant.operation === selected.operation
        ),
    );
    this.writeState({ grants: nextGrants });
    return { removed: 1, removedGrant: selected };
  }

  resetProject(projectRoot: string): { removed: number } {
    const normalizedProjectRoot = normalizeProjectRoot(projectRoot);
    const state = this.readState();
    const nextGrants = state.grants.filter(
      (grant) => grant.projectRoot !== normalizedProjectRoot,
    );
    const removed = state.grants.length - nextGrants.length;
    this.writeState({ grants: nextGrants });
    return { removed };
  }

  resetAll(): { removed: number } {
    const state = this.readState();
    this.writeState({ grants: [] });
    return { removed: state.grants.length };
  }

  private readState(): PersistedApprovalPolicyState {
    if (!fs.existsSync(this.policyFilePath)) {
      return { grants: [] };
    }
    return parsePolicyState(fs.readFileSync(this.policyFilePath, "utf8"));
  }

  private writeState(state: PersistedApprovalPolicyState): void {
    ensureParentDir(this.policyFilePath);
    fs.writeFileSync(
      this.policyFilePath,
      JSON.stringify({ grants: state.grants }, null, 2),
      "utf8",
    );
  }
}
