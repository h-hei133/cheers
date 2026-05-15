import type { ContextProjectionFact } from "./contextStateProjection.js";

export type CompactContinuityPacketSource =
  | "compact"
  | "session-handoff"
  | "route-handoff"
  | "manual-export";

export interface CompactContinuityPacket {
  readonly packetVersion: "compact-v2";
  readonly generatedAt: string;
  readonly source: CompactContinuityPacketSource;
  readonly taskGoal: {
    readonly objective?: string;
    readonly currentUserRequest?: string;
    readonly constraints: readonly string[];
    readonly nextAction?: string;
    readonly unresolvedBlockers: readonly string[];
  };
  readonly route: {
    readonly routeId?: string;
    readonly name?: string;
    readonly objective?: string;
    readonly currentPhase?: string;
    readonly nextAction?: string;
    readonly stopConditions: readonly string[];
    readonly forbiddenScope: readonly string[];
  };
  readonly project: {
    readonly projectRoot?: string;
    readonly branch?: string;
    readonly baseCommit?: string;
    readonly repositoryHints: readonly string[];
  };
  readonly editCapability: {
    readonly closeoutStatus?: string;
    readonly boundedCap?: number;
    readonly supportedDefault: readonly string[];
    readonly supportedNonDefault: readonly string[];
    readonly explicitOptInOnly: readonly string[];
    readonly blockedByDesign: readonly {
      readonly id: string;
      readonly reason: string;
    }[];
    readonly arbitraryBroadApplyPatch?: string;
    readonly automaticRecovery: false;
    readonly atomicRollback: false;
    readonly defaultPersistence?: string;
  };
  readonly mutationEvidence: {
    readonly plannedFiles: readonly string[];
    readonly changedFiles: readonly string[];
    readonly failedFiles: ReadonlyArray<{ readonly path: string; readonly reason: string }>;
    readonly postWriteVerification?: string;
    readonly writerStarted?: boolean;
    readonly writeEffect?: string;
    readonly writerFlags: readonly string[];
  };
  readonly recovery: {
    readonly restoreAvailable: boolean;
    readonly restorePreviewAvailable: boolean;
    readonly restoreExecuteExplicitOnly: boolean;
    readonly recoveryAuthorityReferences: readonly string[];
    readonly restorableFiles: readonly string[];
    readonly blockedFiles: ReadonlyArray<{ readonly path: string; readonly reason: string }>;
    readonly currentContentGuardSummary?: string;
    readonly automaticRecoveryAvailable: false;
    readonly atomicRollbackAvailable: false;
    readonly recoveryExecuted: false;
  };
  readonly validation: {
    readonly testsRun: readonly string[];
    readonly verifierStatus: readonly {
      readonly command: string;
      readonly status: string;
    }[];
    readonly buildStatus?: string;
    readonly resultContractStatus?: string;
    readonly commandOutputSummary?: string;
  };
  readonly context: {
    readonly compactSurvivorFacts: readonly string[];
    readonly memoryCandidates: readonly string[];
    readonly sidebarFacts: readonly string[];
    readonly startupWarmCandidates: readonly string[];
  };
  readonly redactions: readonly {
    readonly inputField: string;
    readonly reason: string;
  }[];
  readonly warnings: readonly {
    readonly id: string;
    readonly message: string;
  }[];
  readonly evidence: readonly string[];
}

export function factValue<T extends Record<string, unknown>>(
  facts: readonly ContextProjectionFact[],
  id: string,
): T | undefined {
  const value = facts.find((fact) => fact.id === id)?.value;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  return value as T;
}

export function factIds(facts: readonly ContextProjectionFact[]): readonly string[] {
  return facts.map((fact) => fact.id);
}

