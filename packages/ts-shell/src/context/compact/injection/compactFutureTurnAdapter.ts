import type { CompactLiveCheckpoint } from "../checkpoint/compactLiveCheckpoint.js";

export interface CompactFutureTurnCandidateContext {
  readonly adapterVersion: "compact-future-turn-adapter-v1";
  readonly checkpointId: string;
  readonly modelFacingSummary: string;
  readonly structuredFacts: {
    readonly taskRoute: {
      readonly objective?: string;
      readonly routeId?: string;
      readonly routeName?: string;
      readonly currentPhase?: string;
    };
    readonly editCapability: {
      readonly closeoutStatus?: string;
      readonly supportedDefault: readonly string[];
      readonly supportedNonDefault: readonly string[];
      readonly explicitOptInOnly: readonly string[];
      readonly blockedByDesign: readonly {
        readonly id: string;
        readonly reason: string;
      }[];
      readonly automaticRecovery: false;
      readonly atomicRollback: false;
    };
    readonly mutationEvidence: CompactLiveCheckpoint["packet"]["mutationEvidence"];
    readonly recoveryRestoreReferences: {
      readonly restoreAvailable: boolean;
      readonly restorePreviewAvailable: boolean;
      readonly restoreExecuteExplicitOnly: true;
      readonly recoveryAuthorityReferences: readonly string[];
      readonly restorableFiles: readonly string[];
      readonly blockedFiles: CompactLiveCheckpoint["packet"]["recovery"]["blockedFiles"];
      readonly automaticRecoveryAvailable: false;
      readonly atomicRollbackAvailable: false;
      readonly recoveryExecuted: false;
    };
    readonly validationStatus: CompactLiveCheckpoint["packet"]["validation"];
    readonly constraints: readonly string[];
    readonly nextAction?: string;
  };
  readonly excludedFacts: readonly string[];
  readonly redactions: CompactLiveCheckpoint["redactions"];
  readonly warnings: CompactLiveCheckpoint["warnings"];
  readonly injectionStatus: "candidate-only";
  readonly providerInjectionStatus: "not-injected";
  readonly persistence: "none";
  readonly providerCall: "none";
  readonly evidence: readonly string[];
}

export function adaptCompactCheckpointForFutureTurn(
  checkpoint: CompactLiveCheckpoint,
): CompactFutureTurnCandidateContext {
  const packet = checkpoint.packet;
  const warnings = [
    ...checkpoint.warnings,
    ...(checkpoint.status === "created"
      ? []
      : [
          {
            id: "checkpoint-not-current",
            message: `Checkpoint status is ${checkpoint.status}; adapter payload remains candidate-only.`,
          },
        ]),
  ];

  return {
    adapterVersion: "compact-future-turn-adapter-v1",
    checkpointId: checkpoint.checkpointId,
    modelFacingSummary: buildModelFacingSummary(checkpoint),
    structuredFacts: {
      taskRoute: {
        objective: packet.taskGoal.objective ?? packet.route.objective,
        routeId: packet.route.routeId,
        routeName: packet.route.name,
        currentPhase: packet.route.currentPhase,
      },
      editCapability: {
        closeoutStatus: packet.editCapability.closeoutStatus,
        supportedDefault: packet.editCapability.supportedDefault,
        supportedNonDefault: packet.editCapability.supportedNonDefault,
        explicitOptInOnly: packet.editCapability.explicitOptInOnly,
        blockedByDesign: packet.editCapability.blockedByDesign,
        automaticRecovery: false,
        atomicRollback: false,
      },
      mutationEvidence: packet.mutationEvidence,
      recoveryRestoreReferences: {
        restoreAvailable: packet.recovery.restoreAvailable,
        restorePreviewAvailable: packet.recovery.restorePreviewAvailable,
        restoreExecuteExplicitOnly: true,
        recoveryAuthorityReferences:
          packet.recovery.recoveryAuthorityReferences,
        restorableFiles: packet.recovery.restorableFiles,
        blockedFiles: packet.recovery.blockedFiles,
        automaticRecoveryAvailable: false,
        atomicRollbackAvailable: false,
        recoveryExecuted: false,
      },
      validationStatus: packet.validation,
      constraints: [
        ...packet.taskGoal.constraints,
        ...packet.route.forbiddenScope,
        ...packet.route.stopConditions,
      ],
      nextAction: packet.route.nextAction ?? packet.taskGoal.nextAction,
    },
    excludedFacts: [
      "raw-original-content",
      "raw-recovery-content",
      "raw-content-blobs",
      "full-command-output",
      "secrets-provider-credentials-auth",
      "hidden-reasoning",
      "future-turn-query-loop-injection",
      "provider-model-call",
      "automatic-recovery",
      "atomic-rollback",
      ...checkpoint.redactions.map((entry) => entry.inputField),
    ],
    redactions: checkpoint.redactions,
    warnings,
    injectionStatus: "candidate-only",
    providerInjectionStatus: "not-injected",
    persistence: "none",
    providerCall: "none",
    evidence: [
      ...checkpoint.evidence,
      "compact-future-turn-adapter:candidate-only",
      "compact-future-turn-adapter:not-injected",
      "compact-future-turn-adapter:no-provider-call",
      "compact-future-turn-adapter:no-persistence",
      "compact-future-turn-adapter:no-automatic-recovery",
      "compact-future-turn-adapter:no-atomic-rollback",
    ],
  };
}

function buildModelFacingSummary(checkpoint: CompactLiveCheckpoint): string {
  const packet = checkpoint.packet;
  const route = [packet.route.routeId, packet.route.name]
    .filter(Boolean)
    .join(" ") || "route not recorded";
  const nextAction =
    packet.route.nextAction ?? packet.taskGoal.nextAction ?? "not recorded";
  const changed = packet.mutationEvidence.changedFiles.length;
  const failed = packet.mutationEvidence.failedFiles.length;
  const restoreRefs = packet.recovery.recoveryAuthorityReferences.length;
  return [
    `Compact v2 checkpoint ${checkpoint.checkpointId} is available for future-turn candidate context.`,
    `Route: ${route}.`,
    `Objective: ${packet.taskGoal.objective ?? packet.route.objective ?? "not recorded"}.`,
    `Edit capability: ${packet.editCapability.closeoutStatus ?? "not recorded"}; automatic recovery and atomic rollback are unavailable.`,
    `Mutation evidence: ${changed} changed file(s), ${failed} failed file(s).`,
    `Recovery: ${restoreRefs} authority reference(s); restore execute remains explicit-only.`,
    `Next action: ${nextAction}.`,
  ].join(" ");
}
