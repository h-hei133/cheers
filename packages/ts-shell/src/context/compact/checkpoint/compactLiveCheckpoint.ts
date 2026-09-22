import type { CompactContinuityPacket } from "../continuity/compactContinuityPacket.js";
import type { CompactCommandRunResult } from "../command/compactCommandRunner.js";

export type CompactCheckpointSourceCommand = "/compact" | "/handoff" | "internal";
export type CompactCheckpointStatus =
  | "created"
  | "superseded"
  | "cleared"
  | "invalid";

export interface CompactLiveCheckpoint {
  readonly checkpointId: string;
  readonly sessionScopeId: string;
  readonly packetVersion: "compact-v2";
  readonly createdAt: string;
  readonly sourceCommand: CompactCheckpointSourceCommand;
  readonly status: CompactCheckpointStatus;
  readonly packet: CompactContinuityPacket;
  readonly packetSummary: {
    readonly source: CompactContinuityPacket["source"];
    readonly routeLabel?: string;
    readonly taskObjective?: string;
    readonly nextAction?: string;
    readonly editCloseoutStatus?: string;
    readonly changedFileCount: number;
    readonly failedFileCount: number;
    readonly recoveryAuthorityReferenceCount: number;
    readonly validationCommandCount: number;
  };
  readonly renderedMarkdown: string;
  readonly compactSurvivorFacts: readonly string[];
  readonly redactions: CompactContinuityPacket["redactions"];
  readonly warnings: CompactContinuityPacket["warnings"];
  readonly persistence: "none";
  readonly providerCall: "none";
  readonly futureTurnInjection: "not-injected";
  readonly automaticRecovery: false;
  readonly atomicRollback: false;
  readonly evidence: readonly string[];
}

export interface CompactLiveCheckpointStore {
  getLatest(sessionScopeId: string): CompactLiveCheckpoint | undefined;
  getById(checkpointId: string): CompactLiveCheckpoint | undefined;
  updateLatest(input: UpdateCompactLiveCheckpointInput): CompactLiveCheckpoint;
  clearLatest(sessionScopeId: string): CompactLiveCheckpoint | undefined;
  markSuperseded(checkpointId: string): CompactLiveCheckpoint | undefined;
}

export interface UpdateCompactLiveCheckpointInput {
  readonly sessionScopeId: string;
  readonly sourceCommand: CompactCheckpointSourceCommand;
  readonly result: CompactCommandRunResult;
  readonly checkpointId?: string;
  readonly createdAt?: string;
}

export interface CompactLiveCheckpointStoreOptions {
  readonly now?: () => string;
  readonly nextId?: () => string;
}

export function createCompactLiveCheckpointStore(
  options: CompactLiveCheckpointStoreOptions = {},
): CompactLiveCheckpointStore {
  const latestBySession = new Map<string, string>();
  const checkpointsById = new Map<string, CompactLiveCheckpoint>();
  let counter = 0;
  const now = options.now ?? (() => new Date().toISOString());
  const nextId =
    options.nextId ??
    (() => {
      counter += 1;
      return `compact-checkpoint-${counter}`;
    });

  const write = (checkpoint: CompactLiveCheckpoint): CompactLiveCheckpoint => {
    checkpointsById.set(checkpoint.checkpointId, checkpoint);
    if (checkpoint.status === "created") {
      latestBySession.set(checkpoint.sessionScopeId, checkpoint.checkpointId);
    }
    return checkpoint;
  };

  return {
    getLatest(sessionScopeId) {
      const latestId = latestBySession.get(sessionScopeId);
      if (!latestId) {
        return undefined;
      }
      const checkpoint = checkpointsById.get(latestId);
      return checkpoint?.status === "created" ? checkpoint : undefined;
    },
    getById(checkpointId) {
      return checkpointsById.get(checkpointId);
    },
    updateLatest(input) {
      const previousLatestId = latestBySession.get(input.sessionScopeId);
      if (previousLatestId) {
        const previous = checkpointsById.get(previousLatestId);
        if (previous?.status === "created") {
          checkpointsById.set(previousLatestId, {
            ...previous,
            status: "superseded",
            evidence: [
              ...previous.evidence,
              "compact-live-checkpoint:superseded-by-new-latest",
            ],
          });
        }
      }
      return write(
        buildCompactLiveCheckpoint({
          ...input,
          checkpointId: input.checkpointId ?? nextId(),
          createdAt: input.createdAt ?? now(),
        }),
      );
    },
    clearLatest(sessionScopeId) {
      const latestId = latestBySession.get(sessionScopeId);
      if (!latestId) {
        return undefined;
      }
      const latest = checkpointsById.get(latestId);
      latestBySession.delete(sessionScopeId);
      if (!latest) {
        return undefined;
      }
      const cleared = {
        ...latest,
        status: "cleared" as const,
        evidence: [
          ...latest.evidence,
          "compact-live-checkpoint:cleared",
        ],
      };
      checkpointsById.set(latestId, cleared);
      return cleared;
    },
    markSuperseded(checkpointId) {
      const checkpoint = checkpointsById.get(checkpointId);
      if (!checkpoint) {
        return undefined;
      }
      const superseded = {
        ...checkpoint,
        status: "superseded" as const,
        evidence: [
          ...checkpoint.evidence,
          "compact-live-checkpoint:marked-superseded",
        ],
      };
      checkpointsById.set(checkpointId, superseded);
      if (latestBySession.get(checkpoint.sessionScopeId) === checkpointId) {
        latestBySession.delete(checkpoint.sessionScopeId);
      }
      return superseded;
    },
  };
}

export const DEFAULT_COMPACT_LIVE_CHECKPOINT_STORE =
  createCompactLiveCheckpointStore();

export function updateLatestCompactCheckpoint(
  store: CompactLiveCheckpointStore,
  input: UpdateCompactLiveCheckpointInput,
): CompactLiveCheckpoint {
  return store.updateLatest(input);
}

export function getLatestCompactCheckpoint(
  store: CompactLiveCheckpointStore,
  sessionScopeId: string,
): CompactLiveCheckpoint | undefined {
  return store.getLatest(sessionScopeId);
}

export function clearLatestCompactCheckpoint(
  store: CompactLiveCheckpointStore,
  sessionScopeId: string,
): CompactLiveCheckpoint | undefined {
  return store.clearLatest(sessionScopeId);
}

export function markCompactCheckpointSuperseded(
  store: CompactLiveCheckpointStore,
  checkpointId: string,
): CompactLiveCheckpoint | undefined {
  return store.markSuperseded(checkpointId);
}

function buildCompactLiveCheckpoint(input: {
  readonly sessionScopeId: string;
  readonly sourceCommand: CompactCheckpointSourceCommand;
  readonly result: CompactCommandRunResult;
  readonly checkpointId: string;
  readonly createdAt: string;
}): CompactLiveCheckpoint {
  const packet = input.result.packet;
  return {
    checkpointId: input.checkpointId,
    sessionScopeId: input.sessionScopeId,
    packetVersion: packet.packetVersion,
    createdAt: input.createdAt,
    sourceCommand: input.sourceCommand,
    status: "created",
    packet,
    packetSummary: {
      source: packet.source,
      routeLabel: [packet.route.routeId, packet.route.name]
        .filter(Boolean)
        .join(" ") || undefined,
      taskObjective: packet.taskGoal.objective ?? packet.route.objective,
      nextAction: packet.route.nextAction ?? packet.taskGoal.nextAction,
      editCloseoutStatus: packet.editCapability.closeoutStatus,
      changedFileCount: packet.mutationEvidence.changedFiles.length,
      failedFileCount: packet.mutationEvidence.failedFiles.length,
      recoveryAuthorityReferenceCount:
        packet.recovery.recoveryAuthorityReferences.length,
      validationCommandCount:
        packet.validation.testsRun.length + packet.validation.verifierStatus.length,
    },
    renderedMarkdown: input.result.markdown ?? "",
    compactSurvivorFacts: packet.context.compactSurvivorFacts,
    redactions: packet.redactions,
    warnings: packet.warnings,
    persistence: "none",
    providerCall: "none",
    futureTurnInjection: "not-injected",
    automaticRecovery: false,
    atomicRollback: false,
    evidence: [
      ...input.result.evidence,
      "compact-live-checkpoint:in-memory",
      "compact-live-checkpoint:session-scoped",
      "compact-live-checkpoint:no-persistence",
      "compact-live-checkpoint:no-provider-call",
      "compact-live-checkpoint:not-injected",
      "compact-live-checkpoint:no-automatic-recovery",
      "compact-live-checkpoint:no-atomic-rollback",
    ],
  };
}
