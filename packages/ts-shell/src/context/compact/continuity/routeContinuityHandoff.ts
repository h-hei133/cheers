import type { EditCapabilityCloseoutManifest } from "../../../orchestration/patchResult/editCapabilityCloseoutManifest.js";
import type { EditCapabilityReadiness } from "../../../orchestration/patchResult/editCapabilityReadiness.js";
import type { RecoverySurfaceSummary } from "../../../edit/recovery/recoverySurfaceProjection.js";
import {
  factIds,
  factValue,
  type CompactContinuityPacket,
  type CompactContinuityPacketSource,
} from "./compactContinuityPacket.js";
import { CONTEXT_CONTINUITY_MANIFEST } from "../../../core/context/model/contextContinuityManifest.js";
import {
  projectContextState,
  type ContextStateProjection,
  type ContextStateProjectionInput,
} from "../../../core/context/model/contextStateProjection.js";
import { applyCompactRedactionPolicy } from "../policy/compactRedactionPolicy.js";

export interface RouteContinuityHandoffInput {
  readonly generatedAt: string;
  readonly source: CompactContinuityPacketSource;
  readonly contextProjection?: ContextStateProjection;
  readonly contextProjectionInput?: ContextStateProjectionInput;
  readonly route?: {
    readonly routeId?: string;
    readonly name?: string;
    readonly objective?: string;
    readonly currentPhase?: string;
    readonly nextAction?: string;
    readonly stopConditions?: readonly string[];
    readonly forbiddenScope?: readonly string[];
  };
  readonly project?: {
    readonly projectRoot?: string;
    readonly safeToPersistProjectRoot?: boolean;
    readonly branch?: string;
    readonly baseCommit?: string;
    readonly repositoryHints?: readonly string[];
  };
  readonly taskGoal?: ContextStateProjectionInput["taskGoal"];
  readonly editCapabilityCloseoutManifest?: EditCapabilityCloseoutManifest;
  readonly editCapabilityReadiness?: readonly EditCapabilityReadiness[];
  readonly recoverySurfaceSummary?: RecoverySurfaceSummary & {
    readonly currentContentGuardSummary?: string;
    readonly rawOriginalContent?: string;
  };
  readonly validation?: ContextStateProjectionInput["validationEvidence"];
  readonly secretValues?: readonly string[];
  readonly unsafeInputs?: Record<string, unknown>;
}

export function buildRouteContinuityHandoffPacket(
  input: RouteContinuityHandoffInput,
): CompactContinuityPacket {
  const projection = input.contextProjection ?? projectContextState({
    ...(input.contextProjectionInput ?? {}),
    ...(input.taskGoal ? { taskGoal: input.taskGoal } : {}),
    ...(input.route
      ? {
          routeInfo: {
            routeId: input.route.routeId,
            title: input.route.name,
            status: input.route.currentPhase,
          },
        }
      : {}),
    ...(input.project
      ? {
          projectInfo: {
            projectRoot: input.project.projectRoot,
            safeToPersistProjectRoot: input.project.safeToPersistProjectRoot,
            projectFacts: input.project.repositoryHints,
          },
        }
      : {}),
    ...(input.editCapabilityCloseoutManifest
      ? { editCapabilityCloseoutManifest: input.editCapabilityCloseoutManifest }
      : {}),
    ...(input.recoverySurfaceSummary
      ? { recoverySummary: input.recoverySurfaceSummary }
      : {}),
    ...(input.validation ? { validationEvidence: input.validation } : {}),
    ...(input.secretValues ? { secretValues: input.secretValues } : {}),
  });

  const taskGoal = factValue<{
    objective?: string;
    currentUserRequest?: string;
    constraints?: readonly string[];
    nextAction?: string;
    unresolvedBlockers?: readonly string[];
  }>(projection.compactSurvivorFacts, "task-goal");
  const routeInfo = factValue<{
    routeId?: string;
    title?: string;
    status?: string;
  }>(projection.compactSurvivorFacts, "route-info");
  const projectRoot = factValue<{ projectRoot?: string }>(
    projection.compactSurvivorFacts,
    "project-root",
  );
  const edit = factValue<{
    status?: string;
    defaultReadyCapabilityIds?: readonly string[];
    blockedCapabilityIds?: readonly string[];
    arbitraryBroadApplyPatch?: string;
    automaticRecovery?: boolean;
    atomicRollback?: boolean;
    boundedCap?: number;
  }>(projection.compactSurvivorFacts, "edit-closeout-status");
  const mutation = factValue<{
    plannedFiles?: readonly string[];
    changedFiles?: readonly string[];
    failedFiles?: ReadonlyArray<{ readonly path: string; readonly reason: string }>;
    postWriteVerification?: string;
    writerStarted?: boolean;
    writeEffect?: string;
    writerFlags?: readonly string[];
  }>(projection.compactSurvivorFacts, "mutation-evidence");
  const recovery = factValue<{
    recoveryAvailable?: boolean;
    explicitRestoreAvailable?: boolean;
    restorableFiles?: readonly string[];
    blockedFiles?: ReadonlyArray<{ readonly path: string; readonly reason: string }>;
    recoveryAuthorityId?: string;
    recoveryAction?: string;
  }>(projection.compactSurvivorFacts, "recovery-restore-summary");
  const validation = factValue<{
    testsRun?: readonly string[];
    verifierResults?: ReadonlyArray<{ readonly command: string; readonly status: string }>;
    buildStatus?: string;
    resultContractStatus?: string;
    commandOutputSummary?: string;
  }>(projection.compactSurvivorFacts, "validation-evidence");

  const readinessById = new Map(
    (input.editCapabilityReadiness ?? []).map((entry) => [entry.id, entry]),
  );
  const supportedNonDefault = Array.from(readinessById.values())
    .filter((entry) => entry.status === "non-default-ready-candidate")
    .map((entry) => entry.id);
  const explicitOptInOnly = Array.from(readinessById.values())
    .filter((entry) => entry.status === "explicit-opt-in-only")
    .map((entry) => entry.id);

  const packet: CompactContinuityPacket = {
    packetVersion: "compact-v2",
    generatedAt: input.generatedAt,
    source: input.source,
    taskGoal: {
      objective: taskGoal?.objective ?? input.taskGoal?.objective,
      currentUserRequest: taskGoal?.currentUserRequest ?? input.taskGoal?.currentUserRequest,
      constraints: unique([
        ...(taskGoal?.constraints ?? []),
        ...(input.taskGoal?.constraints ?? []),
      ]),
      nextAction: taskGoal?.nextAction ?? input.route?.nextAction ?? input.taskGoal?.nextAction,
      unresolvedBlockers: unique([
        ...(taskGoal?.unresolvedBlockers ?? []),
        ...(input.taskGoal?.unresolvedBlockers ?? []),
      ]),
    },
    route: {
      routeId: routeInfo?.routeId ?? input.route?.routeId,
      name: routeInfo?.title ?? input.route?.name,
      objective: input.route?.objective ?? taskGoal?.objective,
      currentPhase: routeInfo?.status ?? input.route?.currentPhase,
      nextAction: input.route?.nextAction ?? taskGoal?.nextAction,
      stopConditions: unique(input.route?.stopConditions ?? []),
      forbiddenScope: unique(input.route?.forbiddenScope ?? []),
    },
    project: {
      projectRoot:
        input.project?.safeToPersistProjectRoot === false
          ? undefined
          : projectRoot?.projectRoot ?? input.project?.projectRoot,
      branch: input.project?.branch,
      baseCommit: input.project?.baseCommit,
      repositoryHints: unique(input.project?.repositoryHints ?? []),
    },
    editCapability: {
      closeoutStatus: edit?.status ?? input.editCapabilityCloseoutManifest?.status,
      boundedCap: edit?.boundedCap,
      supportedDefault: unique(edit?.defaultReadyCapabilityIds ?? []),
      supportedNonDefault: unique(supportedNonDefault),
      explicitOptInOnly: unique(explicitOptInOnly),
      blockedByDesign: blockedEditCapabilities(input, edit?.blockedCapabilityIds ?? []),
      arbitraryBroadApplyPatch:
        edit?.arbitraryBroadApplyPatch ??
        input.editCapabilityCloseoutManifest?.arbitraryBroadApplyPatch,
      automaticRecovery: false,
      atomicRollback: false,
      defaultPersistence: input.editCapabilityCloseoutManifest?.defaultPersistence,
    },
    mutationEvidence: {
      plannedFiles: unique(mutation?.plannedFiles ?? []),
      changedFiles: unique(mutation?.changedFiles ?? []),
      failedFiles: mutation?.failedFiles ?? [],
      postWriteVerification: mutation?.postWriteVerification,
      writerStarted: mutation?.writerStarted,
      writeEffect: mutation?.writeEffect,
      writerFlags: unique(mutation?.writerFlags ?? []),
    },
    recovery: {
      restoreAvailable: Boolean(recovery?.explicitRestoreAvailable),
      restorePreviewAvailable: Boolean(recovery?.explicitRestoreAvailable),
      restoreExecuteExplicitOnly: true,
      recoveryAuthorityReferences: unique(
        recovery?.recoveryAuthorityId ? [recovery.recoveryAuthorityId] : [],
      ),
      restorableFiles: unique(recovery?.restorableFiles ?? []),
      blockedFiles: recovery?.blockedFiles ?? [],
      currentContentGuardSummary: input.recoverySurfaceSummary?.currentContentGuardSummary,
      automaticRecoveryAvailable: false,
      atomicRollbackAvailable: false,
      recoveryExecuted: false,
    },
    validation: {
      testsRun: unique(validation?.testsRun ?? []),
      verifierStatus: validation?.verifierResults ?? [],
      buildStatus: validation?.buildStatus,
      resultContractStatus: validation?.resultContractStatus,
      commandOutputSummary: validation?.commandOutputSummary,
    },
    context: {
      compactSurvivorFacts: factIds(projection.compactSurvivorFacts),
      memoryCandidates: factIds(projection.memoryCandidates),
      sidebarFacts: factIds(projection.sidebarFacts),
      startupWarmCandidates: factIds(projection.startupWarmCandidates),
    },
    redactions: projection.redactions,
    warnings: [
      ...projection.warnings,
      ...criticalFactWarnings(projection),
    ],
    evidence: [
      ...projection.evidence,
      `context-continuity-manifest:${CONTEXT_CONTINUITY_MANIFEST.status}`,
      "compact-v2:pure-packet",
      "compact-v2:no-persistence",
      "compact-v2:no-automatic-recovery",
      "compact-v2:no-atomic-rollback",
    ],
  };

  return applyCompactRedactionPolicy({
    packet,
    unsafeInputs: {
      ...(input.unsafeInputs ?? {}),
      recoverySurfaceSummary: input.recoverySurfaceSummary,
      contextProjectionInput: input.contextProjectionInput,
    },
    secretValues: input.secretValues,
  }).packet;
}

function blockedEditCapabilities(
  input: RouteContinuityHandoffInput,
  ids: readonly string[],
): CompactContinuityPacket["editCapability"]["blockedByDesign"] {
  const manifestEntries = input.editCapabilityCloseoutManifest?.entries ?? [];
  return unique(ids).map((id) => {
    const entry = manifestEntries.find((candidate) => candidate.id === id);
    return {
      id,
      reason: entry?.blockedReason ?? "blocked-by-design",
    };
  });
}

function criticalFactWarnings(
  projection: ContextStateProjection,
): CompactContinuityPacket["warnings"] {
  const compactIds = new Set(projection.compactSurvivorFacts.map((fact) => fact.id));
  const warnings: Array<{ id: string; message: string }> = [];
  for (const required of [
    "task-goal",
    "route-info",
    "edit-closeout-status",
    "mutation-evidence",
    "recovery-restore-summary",
    "validation-evidence",
  ]) {
    if (!compactIds.has(required)) {
      warnings.push({
        id: `missing-${required}`,
        message: `Compact v2 handoff is missing ${required}.`,
      });
    }
  }
  return warnings;
}

function unique(values: readonly string[]): readonly string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

