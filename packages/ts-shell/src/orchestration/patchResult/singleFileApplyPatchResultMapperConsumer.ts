import type {
  CodingPatchFailureCode,
  CodingResultSummary,
} from "../types.js";
import type { QueryRuntimeState } from "../../core/query/runtime/state.js";
import { createEmptyLifecycleIndex } from "../../core/tools/toolResultLifecycle.js";
import type { QueryTerminal } from "../../core/query/runtime/transitions.js";
import type {
  SingleFileApplyPatchRuntimeBridge,
  SingleFileApplyPatchRuntimeBridgeBlocker,
} from "./singleFileApplyPatchRuntimeBridge.js";

export interface SingleFileApplyPatchResultMapperConsumerContract {
  readonly source: "single-file-apply-patch-runtime-bridge";
  readonly mapperConsumerSafe: true;
  readonly status: SingleFileApplyPatchRuntimeBridge["status"];
  readonly willWrite: false;
  readonly changedFiles: readonly [];
  readonly writeIntents: readonly [];
  readonly attemptedFiles: readonly string[];
  readonly wouldChangeFiles: readonly string[];
  readonly previewChangedFiles: readonly string[];
  readonly blockerKind: SingleFileApplyPatchRuntimeBridgeBlocker;
  readonly nextAction: string;
  readonly doNext: string;
  readonly codingResult: CodingResultSummary;
  readonly resultMapperInput: {
    readonly state: QueryRuntimeState;
    readonly terminal: QueryTerminal;
  };
  readonly mapperSafetyProof: {
    readonly noMutationSuccess: true;
    readonly noWriteSuccess: true;
    readonly noAppliedPatchRecord: true;
    readonly noApprovedDecision: true;
    readonly noChangedFiles: true;
    readonly previewFilesOnlyInAttemptedOrEvidence: true;
    readonly mapsCompletedTerminalToNonSuccess: true;
  };
}

export function buildSingleFileApplyPatchResultMapperConsumerContract(input: {
  readonly runtimeBridge: SingleFileApplyPatchRuntimeBridge;
}): SingleFileApplyPatchResultMapperConsumerContract {
  const bridge = input.runtimeBridge;
  const blockerKind = bridge.codingResultProjection.verification.blockerKind;
  const attemptedFiles = uniqueStrings([
    ...bridge.wouldChangeFiles,
    ...bridge.previewChangedFiles,
    ...bridge.codingResultProjection.failedFiles.map((file) => file.path),
    ...bridge.codingResultProjection.patches.map((patch) => patch.path),
  ]);
  const reason = bridge.codingResultProjection.verification.reason;
  const evidence = resultMapperEvidence({ bridge, blockerKind, attemptedFiles });
  const verificationBlockerKind = "unknown";
  const codingResult: CodingResultSummary = {
    taskKind: "edit-file",
    changedFiles: [],
    failedFiles: bridge.codingResultProjection.failedFiles.map((file) => ({
      path: file.path,
      reason: file.reason,
    })),
    patches: bridge.codingResultProjection.patches.map((patch) => ({
      path: patch.path,
      operation: "replace",
      status: "failed",
      failureCode: patch.failureCode as CodingPatchFailureCode,
      reason: patch.reason,
      continuationStrategy: patch.continuationStrategy,
    })),
    repair: {
      status: "not-needed",
      attempts: 0,
      recoveredItems: [],
      failedItems: [],
      notes: [
        "resultMapper consumer contract only; no writer was invoked and no repair was attempted.",
      ],
    },
    continuation: {
      status: "first-pass-success",
      attempts: 0,
      evidence: ["single-file-apply-patch-resultmapper-consumer:no-continuation"],
    },
    changeSet: {
      gitAware: false,
      preExistingDirtyFiles: [],
      postRunDirtyFiles: [],
      attemptedFiles: [...attemptedFiles],
      changedFiles: [],
      unchangedAttemptedFiles: [...attemptedFiles],
    },
    taskSatisfaction: {
      verdict: bridge.codingResultProjection.taskSatisfaction.verdict,
      reasons: [...bridge.codingResultProjection.taskSatisfaction.reasons],
      requiredEvidence: [
        ...bridge.codingResultProjection.taskSatisfaction.requiredEvidence,
        "resultMapper must downgrade completed terminal input to stopped/stopped_error before any production write claim.",
      ],
      observedEvidence: [
        ...bridge.codingResultProjection.taskSatisfaction.observedEvidence,
        "single-file-apply-patch-resultmapper-consumer:projection-built",
      ],
    },
    verifiedFiles: [],
    unverifiedFiles: attemptedFiles.map((path) => ({
      path,
      reason,
    })),
    verification: {
      status: bridge.codingResultProjection.verification.status,
      reason,
      blockerKind: verificationBlockerKind,
      nextAction: bridge.nextAction,
    },
    evidence,
    lastActionResultSeed: {
      actionKind: "edit-file",
      target: attemptedFiles[0],
      changedFiles: [],
      verifiedFiles: [],
      verification: {
        status: bridge.codingResultProjection.verification.status,
        reason,
        blockerKind: verificationBlockerKind,
      },
      reason,
      blockerKind: verificationBlockerKind,
    },
    failureBoundary:
      bridge.status === "dry-run-ready"
        ? "single-file-apply-patch-dry-run-preview"
        : `single-file-apply-patch-${blockerKind}`,
  };
  const state = buildResultMapperState({ bridge, codingResult });

  return {
    source: "single-file-apply-patch-runtime-bridge",
    mapperConsumerSafe: true,
    status: bridge.status,
    willWrite: false,
    changedFiles: [],
    writeIntents: [],
    attemptedFiles,
    wouldChangeFiles: bridge.wouldChangeFiles,
    previewChangedFiles: bridge.previewChangedFiles,
    blockerKind,
    nextAction: bridge.nextAction,
    doNext: bridge.doNext,
    codingResult,
    resultMapperInput: {
      state,
      terminal: {
        action: "terminal",
        terminalReason: "completed",
        terminalClassification: "success",
      },
    },
    mapperSafetyProof: {
      noMutationSuccess: true,
      noWriteSuccess: true,
      noAppliedPatchRecord: true,
      noApprovedDecision: true,
      noChangedFiles: true,
      previewFilesOnlyInAttemptedOrEvidence: true,
      mapsCompletedTerminalToNonSuccess: true,
    },
  };
}

function buildResultMapperState(input: {
  readonly bridge: SingleFileApplyPatchRuntimeBridge;
  readonly codingResult: CodingResultSummary;
}): QueryRuntimeState {
  const initialPrompt =
    "single-file apply_patch resultMapper consumer contract";

  return {
    config: {
      sessionId: "single-file-apply-patch-resultmapper-consumer",
      initialPrompt,
      maxTurns: 1,
      startingRole: "coder",
    },
    currentRole: "coder",
    turn: 1,
    pendingLifecycle: createEmptyLifecycleIndex(),
    sharedContext: {
      sessionId: "single-file-apply-patch-resultmapper-consumer",
      initialPrompt,
      notes: [
        "runtime/session must consume mapper-safe projection, not raw permission metadata.",
      ],
      handoffs: [],
    },
    transcript: [
      {
        role: "coder",
        content: [
          `single-file apply_patch ${input.bridge.status}`,
          `nextAction=${input.bridge.nextAction}`,
          `doNext=${input.bridge.doNext}`,
          "willWrite=false",
          "changedFiles=[]",
        ].join("\n"),
        codingResult: input.codingResult,
      },
    ],
    visitedTransitions: new Set<string>(),
  };
}

function resultMapperEvidence(input: {
  readonly bridge: SingleFileApplyPatchRuntimeBridge;
  readonly blockerKind: SingleFileApplyPatchRuntimeBridgeBlocker;
  readonly attemptedFiles: readonly string[];
}): string[] {
  return [
    ...input.bridge.codingResultProjection.evidence,
    "single-file-apply-patch-resultmapper-consumer:mapper-safe",
    "single-file-apply-patch-resultmapper-consumer:will-write-false",
    "single-file-apply-patch-resultmapper-consumer:changed-files-empty",
    "single-file-apply-patch-resultmapper-consumer:no-write-success",
    "single-file-apply-patch-resultmapper-consumer:no-mutation-success",
    "single-file-apply-patch-resultmapper-consumer:no-applied-patch-record",
    "single-file-apply-patch-resultmapper-consumer:no-approved-decision",
    `single-file-apply-patch-resultmapper-consumer:blocker:${input.blockerKind}`,
    ...actionableEvidence(input.blockerKind),
    ...input.attemptedFiles.map(
      (path) => `single-file-apply-patch-resultmapper-consumer:attempted:${path}`,
    ),
  ];
}

function actionableEvidence(
  blockerKind: SingleFileApplyPatchRuntimeBridgeBlocker,
): string[] {
  switch (blockerKind) {
    case "stale-read":
      return ["actionable-blocker-kind:stale-read"];
    case "target-missing":
      return [
        "single-file-apply-patch-resultmapper-consumer:blocker:target-missing",
        "actionable-blocker-kind:patch-target-missing",
      ];
    case "unsupported-patch-shape":
      return ["actionable-blocker-kind:patch-generation-failed"];
    default:
      return [];
  }
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}
