import type { ContextLayerId } from "./contextLayerModel.js";
import { CONTEXT_CONTINUITY_MANIFEST } from "./contextContinuityManifest.js";

export interface ContextProjectionFact {
  readonly id: string;
  readonly layer: ContextLayerId;
  readonly summary: string;
  readonly evidence: readonly string[];
  readonly value?: unknown;
}

export interface ContextProjectionRedaction {
  readonly inputField: string;
  readonly reason: string;
}

export interface ContextProjectionWarning {
  readonly id: string;
  readonly message: string;
}

export interface ContextStateProjection {
  readonly route: "74";
  readonly status: "context-baseline-projection";
  readonly layers: readonly ContextLayerId[];
  readonly compactSurvivorFacts: readonly ContextProjectionFact[];
  readonly memoryCandidates: readonly ContextProjectionFact[];
  readonly sidebarFacts: readonly ContextProjectionFact[];
  readonly startupWarmCandidates: readonly ContextProjectionFact[];
  readonly redactions: readonly ContextProjectionRedaction[];
  readonly warnings: readonly ContextProjectionWarning[];
  readonly evidence: readonly string[];
}

export interface ContextStateProjectionInput {
  readonly taskGoal?: {
    readonly objective?: string;
    readonly currentUserRequest?: string;
    readonly constraints?: readonly string[];
    readonly nextAction?: string;
    readonly unresolvedBlockers?: readonly string[];
  };
  readonly routeInfo?: {
    readonly routeId?: string;
    readonly title?: string;
    readonly status?: string;
  };
  readonly projectInfo?: {
    readonly projectRoot?: string;
    readonly safeToPersistProjectRoot?: boolean;
    readonly projectFacts?: readonly string[];
  };
  readonly editCapabilityCloseoutManifest?: {
    readonly status: string;
    readonly automaticRecovery: boolean;
    readonly atomicRollback: boolean;
    readonly arbitraryBroadApplyPatch: string;
    readonly entries: readonly {
      readonly id: string;
      readonly status: string;
      readonly evidence?: readonly string[];
      readonly blockedReason?: string;
    }[];
  };
  readonly mutationEvidence?: {
    readonly plannedFiles?: readonly string[];
    readonly changedFiles?: readonly string[];
    readonly failedFiles?: ReadonlyArray<{ readonly path: string; readonly reason: string }>;
    readonly postWriteVerification?: string;
    readonly writerStarted?: boolean;
    readonly writeEffect?: string;
    readonly writerFlags?: readonly string[];
    readonly rawOriginalContent?: string;
    readonly rawFileDump?: string;
  };
  readonly recoverySummary?: {
    readonly recoveryAvailable: boolean;
    readonly explicitRestoreAvailable: boolean;
    readonly automaticRecoveryAvailable: boolean;
    readonly atomicRollbackAvailable: boolean;
    readonly recoveryExecuted: boolean;
    readonly restorableFiles: readonly string[];
    readonly blockedFiles: ReadonlyArray<{ readonly path: string; readonly reason: string }>;
    readonly recoveryAuthorityId?: string;
    readonly recoveryAction?: string;
    readonly evidence?: readonly string[];
    readonly rawOriginalContent?: string;
  };
  readonly validationEvidence?: {
    readonly testsRun?: readonly string[];
    readonly verifierResults?: ReadonlyArray<{ readonly command: string; readonly status: string }>;
    readonly buildStatus?: string;
    readonly resultContractStatus?: string;
    readonly fullCommandOutput?: string;
  };
  readonly toolAvailabilitySummary?: {
    readonly tools?: readonly string[];
    readonly mcp?: readonly string[];
    readonly skills?: readonly string[];
  };
  readonly compactSummary?: string;
  readonly secretValues?: readonly string[];
}

export function projectContextState(
  input: ContextStateProjectionInput,
): ContextStateProjection {
  const compactSurvivorFacts: ContextProjectionFact[] = [];
  const memoryCandidates: ContextProjectionFact[] = [];
  const sidebarFacts: ContextProjectionFact[] = [];
  const startupWarmCandidates: ContextProjectionFact[] = [];
  const redactions: ContextProjectionRedaction[] = [];
  const warnings: ContextProjectionWarning[] = [];
  const evidence = [
    "context-state-projection:pure",
    "context-state-projection:no-persistence",
    "context-state-projection:route74",
  ];

  projectTaskGoal(input, compactSurvivorFacts, sidebarFacts);
  projectRouteAndProject(input, compactSurvivorFacts, memoryCandidates, startupWarmCandidates);
  projectEditCloseout(input, compactSurvivorFacts, memoryCandidates, sidebarFacts, startupWarmCandidates, warnings);
  projectMutation(input, compactSurvivorFacts, sidebarFacts, redactions);
  projectRecovery(input, compactSurvivorFacts, sidebarFacts, redactions, warnings);
  projectValidation(input, compactSurvivorFacts, redactions);
  projectTools(input, compactSurvivorFacts, sidebarFacts);
  projectCompactSummary(input, compactSurvivorFacts);
  projectSecrets(input, redactions);

  return {
    route: "74",
    status: "context-baseline-projection",
    layers: uniqueLayers([
      ...compactSurvivorFacts,
      ...memoryCandidates,
      ...sidebarFacts,
      ...startupWarmCandidates,
    ]),
    compactSurvivorFacts,
    memoryCandidates,
    sidebarFacts,
    startupWarmCandidates,
    redactions,
    warnings,
    evidence,
  };
}

function projectTaskGoal(
  input: ContextStateProjectionInput,
  compact: ContextProjectionFact[],
  sidebar: ContextProjectionFact[],
): void {
  if (!input.taskGoal) {
    return;
  }
  const value = stripUndefined({
    objective: input.taskGoal.objective,
    currentUserRequest: input.taskGoal.currentUserRequest,
    constraints: unique(input.taskGoal.constraints ?? []),
    nextAction: input.taskGoal.nextAction,
    unresolvedBlockers: unique(input.taskGoal.unresolvedBlockers ?? []),
  });
  compact.push(fact("task-goal", "task-goal", "Current task goal and constraints.", value));
  if (input.taskGoal.nextAction || input.taskGoal.unresolvedBlockers?.length) {
    sidebar.push(
      fact("task-next-action", "sidebar-state", "Current blocker and next action.", {
        nextAction: input.taskGoal.nextAction,
        unresolvedBlockers: unique(input.taskGoal.unresolvedBlockers ?? []),
      }),
    );
  }
}

function projectRouteAndProject(
  input: ContextStateProjectionInput,
  compact: ContextProjectionFact[],
  memory: ContextProjectionFact[],
  startup: ContextProjectionFact[],
): void {
  if (input.routeInfo) {
    const value = stripUndefined(input.routeInfo);
    compact.push(fact("route-info", "route-history", "Current route status.", value));
  }
  if (input.projectInfo?.safeToPersistProjectRoot && input.projectInfo.projectRoot) {
    compact.push(
      fact("project-root", "project", "Safe project root.", {
        projectRoot: input.projectInfo.projectRoot,
      }),
    );
    startup.push(
      fact("startup-project-root", "startup-warm", "Project root warm-start candidate.", {
        projectRoot: input.projectInfo.projectRoot,
      }),
    );
  }
  if (input.projectInfo?.projectFacts?.length) {
    memory.push(
      fact("project-facts-memory-candidate", "memory-candidate", "Project facts that may become memory later.", {
        facts: unique(input.projectInfo.projectFacts),
      }),
    );
  }
}

function projectEditCloseout(
  input: ContextStateProjectionInput,
  compact: ContextProjectionFact[],
  memory: ContextProjectionFact[],
  sidebar: ContextProjectionFact[],
  startup: ContextProjectionFact[],
  warnings: ContextProjectionWarning[],
): void {
  const manifest = input.editCapabilityCloseoutManifest;
  if (!manifest) {
    return;
  }
  const defaultReady = manifest.entries
    .filter((entry) => entry.status === "default-ready-candidate")
    .map((entry) => entry.id);
  const blocked = manifest.entries
    .filter((entry) => entry.status === "blocked-by-design")
    .map((entry) => ({
      id: entry.id,
      reason: entry.blockedReason ?? "blocked-by-design",
    }));
  const value = {
    status: manifest.status,
    defaultReadyCapabilityIds: defaultReady,
    blockedCapabilityIds: blocked.map((entry) => entry.id),
    arbitraryBroadApplyPatch: manifest.arbitraryBroadApplyPatch,
    automaticRecovery: manifest.automaticRecovery,
    atomicRollback: manifest.atomicRollback,
    boundedCap: inferBoundedCap(defaultReady),
  };
  compact.push(fact("edit-closeout-status", "edit-capability", "Route 73 edit closeout state.", value));
  memory.push(
    fact("blocked-edit-capability-memory-candidate", "memory-candidate", "Blocked edit decisions that may become project memory.", {
      blocked,
    }),
  );
  sidebar.push(
    fact("edit-blocked-sidebar", "sidebar-state", "Blocked edit capability facts.", {
      blockedCapabilityIds: blocked.map((entry) => entry.id),
    }),
  );
  startup.push(
    fact("startup-edit-closeout", "startup-warm", "Edit closeout warm-start candidate.", value),
  );
  if (manifest.automaticRecovery) {
    warnings.push({
      id: "automatic-recovery-claim",
      message: "Edit closeout input claims automatic recovery; Route 74 projection does not rely on that claim.",
    });
  }
  if (manifest.atomicRollback) {
    warnings.push({
      id: "atomic-rollback-claim",
      message: "Edit closeout input claims atomic rollback; Route 74 projection does not rely on that claim.",
    });
  }
}

function projectMutation(
  input: ContextStateProjectionInput,
  compact: ContextProjectionFact[],
  sidebar: ContextProjectionFact[],
  redactions: ContextProjectionRedaction[],
): void {
  const mutation = input.mutationEvidence;
  if (!mutation) {
    return;
  }
  compact.push(
    fact("mutation-evidence", "mutation-evidence", "Compact-safe mutation evidence.", {
      plannedFiles: unique(mutation.plannedFiles ?? []),
      changedFiles: unique(mutation.changedFiles ?? []),
      failedFiles: mutation.failedFiles ?? [],
      postWriteVerification: mutation.postWriteVerification,
      writerStarted: mutation.writerStarted,
      writeEffect: mutation.writeEffect,
      writerFlags: unique(mutation.writerFlags ?? []),
    }),
  );
  sidebar.push(
    fact("mutation-sidebar", "sidebar-state", "Sidebar-ready mutation facts.", {
      plannedFiles: unique(mutation.plannedFiles ?? []),
      changedFiles: unique(mutation.changedFiles ?? []),
      failedFiles: mutation.failedFiles ?? [],
      writerStarted: mutation.writerStarted,
    }),
  );
  if (mutation.rawOriginalContent !== undefined) {
    redactions.push(redaction("mutationEvidence.rawOriginalContent", "raw original content must not survive compact"));
  }
  if (mutation.rawFileDump !== undefined) {
    redactions.push(redaction("mutationEvidence.rawFileDump", "broad raw file dumps must not survive compact"));
  }
}

function projectRecovery(
  input: ContextStateProjectionInput,
  compact: ContextProjectionFact[],
  sidebar: ContextProjectionFact[],
  redactions: ContextProjectionRedaction[],
  warnings: ContextProjectionWarning[],
): void {
  const recovery = input.recoverySummary;
  if (!recovery) {
    return;
  }
  const value = {
    recoveryAvailable: recovery.recoveryAvailable,
    explicitRestoreAvailable: recovery.explicitRestoreAvailable,
    automaticRecoveryAvailable: false,
    atomicRollbackAvailable: false,
    recoveryExecuted: false,
    restorableFiles: recovery.restorableFiles,
    blockedFiles: recovery.blockedFiles,
    recoveryAuthorityId: recovery.recoveryAuthorityId,
    recoveryAction: recovery.recoveryAction,
  };
  compact.push(fact("recovery-restore-summary", "recovery-restore", "Recovery/restore availability without raw authority content.", value));
  sidebar.push(
    fact("recovery-sidebar", "sidebar-state", "Restorable and blocked recovery facts.", {
      restorableFiles: recovery.restorableFiles,
      blockedFiles: recovery.blockedFiles,
      recoveryAuthorityId: recovery.recoveryAuthorityId,
      explicitRestoreAvailable: recovery.explicitRestoreAvailable,
    }),
  );
  if (recovery.rawOriginalContent !== undefined) {
    redactions.push(redaction("recoverySummary.rawOriginalContent", "raw recovery authority content must not survive compact"));
  }
  if (recovery.automaticRecoveryAvailable) {
    warnings.push({
      id: "recovery-automatic-claim-redacted",
      message: "Recovery summary claimed automatic recovery; projection forces automaticRecoveryAvailable=false.",
    });
  }
  if (recovery.atomicRollbackAvailable) {
    warnings.push({
      id: "recovery-atomic-claim-redacted",
      message: "Recovery summary claimed atomic rollback; projection forces atomicRollbackAvailable=false.",
    });
  }
}

function projectValidation(
  input: ContextStateProjectionInput,
  compact: ContextProjectionFact[],
  redactions: ContextProjectionRedaction[],
): void {
  const validation = input.validationEvidence;
  if (!validation) {
    return;
  }
  compact.push(
    fact("validation-evidence", "mutation-evidence", "Validation summary without full command output.", {
      testsRun: validation.testsRun ?? [],
      verifierResults: validation.verifierResults ?? [],
      buildStatus: validation.buildStatus,
      resultContractStatus: validation.resultContractStatus,
      commandOutputSummary: validation.fullCommandOutput
        ? summarizeOmittedCommandOutput(validation.fullCommandOutput)
        : undefined,
    }),
  );
  if (validation.fullCommandOutput !== undefined) {
    redactions.push(redaction("validationEvidence.fullCommandOutput", "full command output must be summarized before compact survival"));
  }
}

function projectTools(
  input: ContextStateProjectionInput,
  compact: ContextProjectionFact[],
  sidebar: ContextProjectionFact[],
): void {
  const tools = input.toolAvailabilitySummary;
  if (!tools) {
    return;
  }
  const value = {
    tools: unique(tools.tools ?? []),
    mcp: unique(tools.mcp ?? []),
    skills: unique(tools.skills ?? []),
    discoveryImplemented: false,
  };
  compact.push(fact("tool-availability-summary", "tool-availability", "Caller-supplied tool/MCP/skill availability placeholders.", value));
  sidebar.push(fact("tool-availability-sidebar", "sidebar-state", "Tool availability placeholders without discovery.", value));
}

function projectCompactSummary(
  input: ContextStateProjectionInput,
  compact: ContextProjectionFact[],
): void {
  if (!input.compactSummary?.trim()) {
    return;
  }
  compact.push(
    fact("compact-summary", "compact-summary", "Compact-safe natural-language summary.", {
      summary: input.compactSummary.trim(),
    }),
  );
}

function projectSecrets(
  input: ContextStateProjectionInput,
  redactions: ContextProjectionRedaction[],
): void {
  if ((input.secretValues ?? []).length > 0) {
    redactions.push(redaction("secretValues", "raw secrets and provider credentials must not survive compact"));
  }
}

function fact(
  id: string,
  layer: ContextLayerId,
  summary: string,
  value: unknown,
): ContextProjectionFact {
  return {
    id,
    layer,
    summary,
    evidence: [
      `context-layer:${layer}`,
      `context-manifest:${CONTEXT_CONTINUITY_MANIFEST.status}`,
    ],
    value: stripUndefined(value),
  };
}

function redaction(
  inputField: string,
  reason: string,
): ContextProjectionRedaction {
  return { inputField, reason };
}

function unique(values: readonly string[]): readonly string[] {
  return Array.from(
    new Set(values.map((value) => value.trim()).filter(Boolean)),
  );
}

function uniqueLayers(facts: readonly ContextProjectionFact[]): readonly ContextLayerId[] {
  return Array.from(new Set(facts.map((factItem) => factItem.layer)));
}

function inferBoundedCap(defaultReadyCapabilityIds: readonly string[]): number | undefined {
  return defaultReadyCapabilityIds.some((id) => id.includes("2-32")) ? 32 : undefined;
}

function summarizeOmittedCommandOutput(output: string): string {
  const lines = output.split(/\r?\n/).filter((line) => line.length > 0).length;
  const bytes = Buffer.byteLength(output, "utf8");
  return `omitted full command output (${lines} non-empty lines, ${bytes} bytes)`;
}

function stripUndefined(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value).filter(([, entryValue]) => entryValue !== undefined),
  );
}
