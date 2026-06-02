import { describe, expect, it } from "vitest";

import { buildLoopContextRebuildInput } from "../../context/rebuildInput.js";
import { projectSessionContextRebuild } from "../../context/sessionContextRebuildProjection.js";
import { createEvidenceOnlySavePoint } from "../../evidence/savepoint/model.js";
import {
  buildRepairVerdictProofInput,
  type RepairVerdictProofInput,
} from "../../evidence/projection/repair/verdict.js";
import {
  createModelRequestBoundary,
  prepareNextTurnModelRequest,
  type NextTurnModelRequestPreparation,
} from "../../provider/request/boundary.js";
import {
  createRepairApplyRequest,
  observeRepairApply,
  observeRepairAuthority,
  observeRepairProposal,
  projectRepairRequiredHandoff,
  type RepairApplyObservation,
  type RepairApplyRequestObservation,
  type RepairAuthorityObservation,
  type RepairProposalObservation,
  type RepairRequiredHandoff,
} from "../../repair/handoff/boundary.js";
import {
  projectRepairVerdictTerminal,
  type RepairVerdictTerminalProjection,
} from "../../result/projection/repair/verdict.js";
import { evaluateContinuationReadiness } from "../../session/continuation/readiness.js";
import {
  summarizeReplaySafeLoopState,
  type ReplaySafeLoopStateSummary,
} from "../../session/replay/state.js";
import { projectSessionTree } from "../../session/sessionTreeProjection.js";
import { prepareNextTurnBundle, type NextTurnBundleProjection } from "../../turn/nextTurnBundle.js";
import { createRuntimeTurnSnapshot } from "../../turn/turnSnapshot.js";
import type { ToolOutcomeBundleProjection } from "../../tools/toolOutcomeBundle.js";
import {
  observePostRepairVerificationResult,
  observeVerificationResult,
  projectVerificationIntent,
  requestPostRepairVerification,
  requirePostRepairVerification,
  type PostRepairVerificationRequestObservation,
  type PostRepairVerificationRequirementObservation,
  type PostRepairVerificationResultObservation,
  type PostRepairVerificationResultStatus,
  type VerificationResultObservation,
} from "../../verification/result/boundary.js";
import {
  projectRuntimeEvents,
  type RuntimeProjectionEvent,
} from "../events/projection.js";
import {
  createLoopFinalizationInput,
  createProductLoopCloseoutInput,
  decideLoopFinalization,
  projectProductLoopCloseout,
  type LoopFinalizationDecision,
  type LoopFinalizationInput,
  type ProductLoopCloseoutInput,
  type ProductLoopCloseoutProjection,
} from "./finalization.js";
import {
  buildProductCompletionPacket,
  type ProductCompletionPacket,
  type ProductCompletionPacketStatus,
} from "./completionPacket.js";
import {
  projectLoopTrajectory,
  type LoopTrajectoryProjection,
} from "./trajectory.js";
import {
  projectProductSurfaceViewModel,
  type ProductSurfaceViewModel,
} from "../../presentation/surface/model.js";

export type ProductTruthCaseName =
  | "complete_proof"
  | "failed_verification"
  | "repair_required"
  | "proposal_only"
  | "authority_only"
  | "apply_without_post_repair_verification"
  | "post_repair_failed_verification"
  | "blocked_request_preparation"
  | "failed_tool_outcome"
  | "partial_stopped_loop"
  | "waiting_for_user"
  | "missing_proof";

export interface ProductTruthMatrixCase {
  readonly name: ProductTruthCaseName;
  readonly expected: {
    readonly terminalSuccess: boolean;
    readonly resultStatus: RepairVerdictTerminalProjection["status"];
    readonly resultClassification: RepairVerdictTerminalProjection["terminalClassification"];
    readonly loopDecision: LoopFinalizationDecision["decision"];
    readonly completionStatus: ProductCompletionPacketStatus;
    readonly completionComplete: boolean;
    readonly nextAction: string;
    readonly missingProofItems: readonly string[];
  };
  readonly verificationResult: VerificationResultObservation;
  readonly repairRequired?: RepairRequiredHandoff;
  readonly repairProposal?: RepairProposalObservation;
  readonly repairAuthority?: RepairAuthorityObservation;
  readonly repairApplyRequest?: RepairApplyRequestObservation;
  readonly repairApply?: RepairApplyObservation;
  readonly postRepairVerificationRequirement?: PostRepairVerificationRequirementObservation;
  readonly postRepairVerificationRequest?: PostRepairVerificationRequestObservation;
  readonly postRepairVerificationResult?: PostRepairVerificationResultObservation;
  readonly repairVerdictProofInput: RepairVerdictProofInput;
  readonly repairVerdictTerminalProjection: RepairVerdictTerminalProjection;
  readonly loopFinalizationInput: LoopFinalizationInput;
  readonly loopFinalizationDecision: LoopFinalizationDecision;
  readonly productLoopCloseoutInput: ProductLoopCloseoutInput;
  readonly productLoopCloseout: ProductLoopCloseoutProjection;
  readonly productCompletionPacket: ProductCompletionPacket;
  readonly toolOutcomeBundle?: ToolOutcomeBundleProjection;
  readonly nextTurnBundle: NextTurnBundleProjection;
  readonly requestPreparation?: NextTurnModelRequestPreparation;
  readonly replaySafeLoopStateSummary: ReplaySafeLoopStateSummary;
  readonly runtimeEvents: readonly RuntimeProjectionEvent[];
  readonly loopTrajectory: LoopTrajectoryProjection;
  readonly productSurface: ProductSurfaceViewModel;
}

interface ProductTruthCaseSpec {
  readonly name: ProductTruthCaseName;
  readonly authority: RepairAuthorityObservation["authorityDecision"];
  readonly applyStatus: RepairApplyObservation["repairApplyStatus"];
  readonly postRepairStatus: PostRepairVerificationResultStatus;
  readonly taskRelevanceStatus?: PostRepairVerificationResultObservation["taskRelevanceStatus"];
  readonly coverageStatus?: PostRepairVerificationResultObservation["coverageStatus"];
  readonly originalReceiptIds?: readonly string[];
  readonly applyReceiptIds?: readonly string[];
  readonly postRepairReceiptIds?: readonly string[];
  readonly includeProposal?: boolean;
  readonly includeAuthority?: boolean;
  readonly includeApplyRequest?: boolean;
  readonly includeApply?: boolean;
  readonly includePostRepairRequirement?: boolean;
  readonly includePostRepairRequest?: boolean;
  readonly includePostRepairResult?: boolean;
  readonly blockRequest?: boolean;
  readonly failedToolOutcome?: boolean;
  readonly expected: Omit<ProductTruthMatrixCase["expected"], "nextAction" | "missingProofItems">;
}

export const PRODUCT_TRUTH_MATRIX: readonly ProductTruthMatrixCase[] = Object.freeze([
  buildProductTruthCase({
    name: "complete_proof",
    authority: "granted",
    applyStatus: "applied",
    postRepairStatus: "passed",
    includeProposal: true,
    includeAuthority: true,
    includeApplyRequest: true,
    includeApply: true,
    includePostRepairRequirement: true,
    includePostRepairRequest: true,
    includePostRepairResult: true,
    expected: {
      terminalSuccess: true,
      resultStatus: "verified_with_repair",
      resultClassification: "success",
      loopDecision: "stop_complete",
      completionStatus: "complete",
      completionComplete: true,
    },
  }),
  buildProductTruthCase({
    name: "failed_verification",
    authority: "missing",
    applyStatus: "not_applied",
    postRepairStatus: "not_run",
    includeProposal: false,
    includeAuthority: false,
    includeApplyRequest: false,
    includeApply: false,
    includePostRepairRequirement: false,
    includePostRepairRequest: false,
    includePostRepairResult: false,
    expected: {
      terminalSuccess: false,
      resultStatus: "not_proven",
      resultClassification: "stopped",
      loopDecision: "await_user",
      completionStatus: "awaiting_user",
      completionComplete: false,
    },
  }),
  buildProductTruthCase({
    name: "repair_required",
    authority: "missing",
    applyStatus: "not_applied",
    postRepairStatus: "not_run",
    includeProposal: false,
    includeAuthority: false,
    includeApplyRequest: false,
    includeApply: false,
    includePostRepairRequirement: false,
    includePostRepairRequest: false,
    includePostRepairResult: false,
    expected: {
      terminalSuccess: false,
      resultStatus: "not_proven",
      resultClassification: "stopped",
      loopDecision: "await_user",
      completionStatus: "awaiting_user",
      completionComplete: false,
    },
  }),
  buildProductTruthCase({
    name: "proposal_only",
    authority: "missing",
    applyStatus: "not_applied",
    postRepairStatus: "not_run",
    includeProposal: true,
    includeAuthority: false,
    includeApplyRequest: false,
    includeApply: false,
    includePostRepairRequirement: false,
    includePostRepairRequest: false,
    includePostRepairResult: false,
    expected: {
      terminalSuccess: false,
      resultStatus: "not_proven",
      resultClassification: "stopped",
      loopDecision: "await_user",
      completionStatus: "awaiting_user",
      completionComplete: false,
    },
  }),
  buildProductTruthCase({
    name: "authority_only",
    authority: "granted",
    applyStatus: "not_applied",
    postRepairStatus: "not_run",
    includeProposal: true,
    includeAuthority: true,
    includeApplyRequest: false,
    includeApply: false,
    includePostRepairRequirement: false,
    includePostRepairRequest: false,
    includePostRepairResult: false,
    expected: {
      terminalSuccess: false,
      resultStatus: "not_proven",
      resultClassification: "stopped",
      loopDecision: "continue_verification",
      completionStatus: "continue_verification",
      completionComplete: false,
    },
  }),
  buildProductTruthCase({
    name: "apply_without_post_repair_verification",
    authority: "granted",
    applyStatus: "applied",
    postRepairStatus: "not_run",
    includeProposal: true,
    includeAuthority: true,
    includeApplyRequest: true,
    includeApply: true,
    includePostRepairRequirement: true,
    includePostRepairRequest: true,
    includePostRepairResult: false,
    expected: {
      terminalSuccess: false,
      resultStatus: "not_proven",
      resultClassification: "stopped",
      loopDecision: "continue_verification",
      completionStatus: "continue_verification",
      completionComplete: false,
    },
  }),
  buildProductTruthCase({
    name: "post_repair_failed_verification",
    authority: "granted",
    applyStatus: "applied",
    postRepairStatus: "failed",
    includeProposal: true,
    includeAuthority: true,
    includeApplyRequest: true,
    includeApply: true,
    includePostRepairRequirement: true,
    includePostRepairRequest: true,
    includePostRepairResult: true,
    expected: {
      terminalSuccess: false,
      resultStatus: "failed",
      resultClassification: "stopped",
      loopDecision: "continue_verification",
      completionStatus: "continue_verification",
      completionComplete: false,
    },
  }),
  buildProductTruthCase({
    name: "blocked_request_preparation",
    authority: "missing",
    applyStatus: "not_applied",
    postRepairStatus: "not_run",
    blockRequest: true,
    includeProposal: true,
    includeAuthority: false,
    includeApplyRequest: false,
    includeApply: false,
    includePostRepairRequirement: false,
    includePostRepairRequest: false,
    includePostRepairResult: false,
    expected: {
      terminalSuccess: false,
      resultStatus: "not_proven",
      resultClassification: "stopped",
      loopDecision: "await_user",
      completionStatus: "awaiting_user",
      completionComplete: false,
    },
  }),
  buildProductTruthCase({
    name: "failed_tool_outcome",
    authority: "missing",
    applyStatus: "not_applied",
    postRepairStatus: "not_run",
    failedToolOutcome: true,
    includeProposal: true,
    includeAuthority: false,
    includeApplyRequest: false,
    includeApply: false,
    includePostRepairRequirement: false,
    includePostRepairRequest: false,
    includePostRepairResult: false,
    expected: {
      terminalSuccess: false,
      resultStatus: "not_proven",
      resultClassification: "stopped",
      loopDecision: "await_user",
      completionStatus: "awaiting_user",
      completionComplete: false,
    },
  }),
  buildProductTruthCase({
    name: "partial_stopped_loop",
    authority: "granted",
    applyStatus: "applied",
    postRepairStatus: "passed",
    originalReceiptIds: [],
    includeProposal: true,
    includeAuthority: true,
    includeApplyRequest: true,
    includeApply: true,
    includePostRepairRequirement: true,
    includePostRepairRequest: true,
    includePostRepairResult: true,
    expected: {
      terminalSuccess: false,
      resultStatus: "partial",
      resultClassification: "stopped",
      loopDecision: "continue_next_turn",
      completionStatus: "continue_next_turn",
      completionComplete: false,
    },
  }),
  buildProductTruthCase({
    name: "waiting_for_user",
    authority: "missing",
    applyStatus: "not_applied",
    postRepairStatus: "not_run",
    includeProposal: true,
    includeAuthority: true,
    includeApplyRequest: false,
    includeApply: false,
    includePostRepairRequirement: false,
    includePostRepairRequest: false,
    includePostRepairResult: false,
    expected: {
      terminalSuccess: false,
      resultStatus: "not_proven",
      resultClassification: "stopped",
      loopDecision: "await_user",
      completionStatus: "awaiting_user",
      completionComplete: false,
    },
  }),
  buildProductTruthCase({
    name: "missing_proof",
    authority: "granted",
    applyStatus: "applied",
    postRepairStatus: "passed",
    coverageStatus: "not_proven",
    includeProposal: true,
    includeAuthority: true,
    includeApplyRequest: true,
    includeApply: true,
    includePostRepairRequirement: true,
    includePostRepairRequest: true,
    includePostRepairResult: true,
    expected: {
      terminalSuccess: false,
      resultStatus: "partial",
      resultClassification: "stopped",
      loopDecision: "continue_verification",
      completionStatus: "continue_verification",
      completionComplete: false,
    },
  }),
]);

export const PRODUCT_TRUTH_NEGATIVE_CASES = PRODUCT_TRUTH_MATRIX.filter(
  (item) => !item.expected.terminalSuccess,
);

export function productTruthCase(name: ProductTruthCaseName): ProductTruthMatrixCase {
  const found = PRODUCT_TRUTH_MATRIX.find((item) => item.name === name);
  if (!found) {
    throw new Error(`Unknown product truth matrix case: ${name}`);
  }
  return found;
}

describe("product truth matrix fixture", () => {
  it("covers the required product path states", () => {
    expect(PRODUCT_TRUTH_MATRIX.map((item) => item.name)).toEqual([
      "complete_proof",
      "failed_verification",
      "repair_required",
      "proposal_only",
      "authority_only",
      "apply_without_post_repair_verification",
      "post_repair_failed_verification",
      "blocked_request_preparation",
      "failed_tool_outcome",
      "partial_stopped_loop",
      "waiting_for_user",
      "missing_proof",
    ]);
  });

  it("keeps complete proof as the only terminal success path", () => {
    const successful = PRODUCT_TRUTH_MATRIX.filter((item) =>
      item.expected.terminalSuccess
    );

    expect(successful.map((item) => item.name)).toEqual(["complete_proof"]);
    for (const item of PRODUCT_TRUTH_MATRIX) {
      expect(item.productCompletionPacket.complete).toBe(item.expected.terminalSuccess);
      expect(item.productCompletionPacket.status).toBe(item.expected.completionStatus);
      expect(item.repairVerdictTerminalProjection.status).toBe(item.expected.resultStatus);
      expect(item.loopFinalizationDecision.decision).toBe(item.expected.loopDecision);
      expect(item.productSurface.terminalSuccessClaim).toBe(false);
      expect(item.runtimeEvents.every((event) => event.facts.terminalSuccessClaim === false)).toBe(true);
      expect(item.replaySafeLoopStateSummary.terminalSuccessClaim).toBe(false);
    }
  });
});

function buildProductTruthCase(spec: ProductTruthCaseSpec): ProductTruthMatrixCase {
  const id = spec.name.replaceAll("_", "-");
  const originalReceiptIds = spec.originalReceiptIds ?? ["receipt:original"];
  const applyReceiptIds = spec.applyReceiptIds ??
    (spec.applyStatus === "applied" ? ["receipt:apply"] : []);
  const postRepairReceiptIds = spec.postRepairReceiptIds ??
    (spec.postRepairStatus === "passed" || spec.postRepairStatus === "failed"
      ? ["receipt:post"]
      : []);
  const intent = projectVerificationIntent({
    sourceTurnId: `turn:${id}`,
    targetSummary: `target:${id}`,
    dispatchStatus: "dispatched",
    authorityRequirement: "granted",
    relevanceStatus: "task_relevant",
    coverageStatus: "covered",
  });
  const verificationResult = observeVerificationResult({
    intent,
    status: "failed",
    runtimeReceiptIds: originalReceiptIds,
    failureClass: "test-failed",
    repairEligible: true,
    safeSummary: `verification failed for ${id}`,
  });
  const repairRequired = projectRepairRequiredHandoff({
    verification: verificationResult,
    authorityRequirement: "required",
  });
  const repairProposal = observeRepairProposal({
    handoff: repairRequired,
    proposalSource: "deterministic_from_failure_evidence",
    targetSummary: `src/${id}.ts`,
    readinessStatus: "exact_ready",
    authorityRequirement: "required",
    applyStatus: spec.applyStatus,
    postRepairVerificationStatus: spec.postRepairStatus === "passed"
      ? "passed"
      : spec.postRepairStatus === "failed"
        ? "failed"
        : "not_run",
  });
  const repairAuthority = observeRepairAuthority({
    proposal: repairProposal,
    authorityDecision: spec.authority,
    authoritySource: spec.authority === "granted"
      ? "explicit_repair_authority"
      : "none",
  });
  const repairApplyRequest = createRepairApplyRequest({
    proposal: repairProposal,
    authority: repairAuthority,
    expectedEditOperationKind: "hunk_set",
  });
  const repairApply = observeRepairApply({
    proposal: repairProposal,
    authority: repairAuthority,
    request: repairApplyRequest,
    repairApplyStatus: spec.applyStatus,
    applyReceiptIds,
    touchedTargetSummaries: spec.applyStatus === "applied" ? [`src/${id}.ts`] : [],
    postRepairVerificationStatus: spec.postRepairStatus === "passed"
      ? "passed"
      : spec.postRepairStatus === "failed"
        ? "failed"
        : "not_run",
  });
  const postRepairVerificationRequirement = requirePostRepairVerification({
    repairApply,
    taskRelevanceExpectation: spec.taskRelevanceStatus ?? "task_relevant",
    coverageExpectation: spec.coverageStatus ?? "covered",
  });
  const postRepairVerificationRequest = requestPostRepairVerification({
    requirement: postRepairVerificationRequirement,
    dispatchStatus: postRepairReceiptIds.length > 0 ? "dispatched" : "not_run",
    receiptIds: postRepairReceiptIds,
    taskRelevanceStatus: spec.taskRelevanceStatus ?? "task_relevant",
    coverageStatus: spec.coverageStatus ?? "covered",
  });
  const postRepairVerificationResult = observePostRepairVerificationResult({
    requirement: postRepairVerificationRequirement,
    request: postRepairVerificationRequest,
    status: spec.postRepairStatus,
    receiptIds: postRepairReceiptIds,
    taskRelevanceStatus: spec.taskRelevanceStatus ?? "task_relevant",
    coverageStatus: spec.coverageStatus ?? "covered",
  });
  const repairVerdictProofInput = buildRepairVerdictProofInput({
    postRepairVerification: postRepairVerificationResult,
  });
  const repairVerdictTerminalProjection = projectRepairVerdictTerminal({
    proofInput: repairVerdictProofInput,
  });
  const loopFinalizationInput = createLoopFinalizationInput({
    resultProjection: repairVerdictTerminalProjection,
  });
  const loopFinalizationDecision = decideLoopFinalization({ finalizationInput: loopFinalizationInput });
  const productLoopCloseoutInput = createProductLoopCloseoutInput({
    resultProjection: repairVerdictTerminalProjection,
    loopDecision: loopFinalizationDecision,
  });
  const productLoopCloseout = projectProductLoopCloseout({ closeoutInput: productLoopCloseoutInput });
  const productCompletionPacket = buildProductCompletionPacket({
    resultProjection: repairVerdictTerminalProjection,
    loopDecision: loopFinalizationDecision,
    closeout: productLoopCloseout,
    repairRequired,
    ...(spec.includeProposal ? { repairProposal } : {}),
    ...(spec.includeAuthority ? { repairAuthority } : {}),
    ...(spec.includeApplyRequest ? { repairApplyRequest } : {}),
    ...(spec.includeApply ? { repairApply } : {}),
    ...(spec.includePostRepairRequirement ? { postRepairVerificationRequirement } : {}),
    ...(spec.includePostRepairRequest ? { postRepairVerificationRequest } : {}),
    ...(spec.includePostRepairResult ? { postRepairVerificationResult } : {}),
    repairVerdictProofInput,
  });
  const sessionProjection = projectSessionTree({
    session: {
      id: `session:${id}`,
      projectRoot: "/workspace",
      createdAt: "2026-06-02T00:00:00.000Z",
      updatedAt: "2026-06-02T00:00:01.000Z",
      status: "active",
      turns: [{
        role: "user",
        content: `raw provider output hidden reasoning oldText=before newText=after token=secret ${id}`,
      }],
    },
  });
  const contextRebuildProjection = projectSessionContextRebuild({
    sessionProjection,
    requiredFacts: spec.blockRequest ? ["fresh-context"] : [],
  });
  const contextRebuildInput = buildLoopContextRebuildInput({
    sessionProjection,
    contextRebuildProjection,
  });
  const continuationReadiness = evaluateContinuationReadiness({
    sessionProjection,
    contextRebuildProjection,
    rebuildInput: contextRebuildInput,
    requiredFacts: spec.blockRequest ? ["fresh-context"] : [],
  });
  const toolOutcomeBundle = spec.failedToolOutcome ? failedToolOutcome(id) : undefined;
  const nextTurnBundle = prepareNextTurnBundle({
    bundleId: `next-turn:${id}`,
    turnId: `turn:${id}`,
    ...(toolOutcomeBundle ? { toolOutcomeBundle } : {}),
    deliveryStatus: loopFinalizationDecision.decision === "await_user"
      ? "waiting"
      : "prepared",
  });
  const requestPreparation = spec.blockRequest
    ? prepareNextTurnModelRequest({
        nextTurnBundle,
        modelRequestBoundary: createModelRequestBoundary({
          requestId: `request:${id}`,
          providerReadinessStatus: "ready",
          continuationReadiness,
          missingRequiredFacts: ["fresh-context"],
        }),
        continuationReadiness,
      })
    : undefined;
  const savePoint = createEvidenceOnlySavePoint({
    turnSnapshot: createRuntimeTurnSnapshot({
      sessionId: `session:${id}`,
      turn: 1,
      phase: "turn",
      workspaceRoot: "/workspace",
      providerOptIn: false,
    }),
    phase: "save_point",
    pendingNextTurnFacts: productCompletionPacket.sessionCarryForwardFacts,
  });
  const replaySafeLoopStateSummary = summarizeReplaySafeLoopState({
    sessionProjection,
    contextRebuildProjection,
    continuationReadiness,
    rebuildInput: contextRebuildInput,
    savePoint,
    nextTurnBundle,
    ...(requestPreparation ? { requestPreparation } : {}),
    ...(toolOutcomeBundle ? { toolOutcomeBundle } : {}),
    terminalResultFacts: {
      status: repairVerdictTerminalProjection.status,
      terminalClassification: repairVerdictTerminalProjection.terminalClassification,
      terminalReason: loopFinalizationDecision.decision,
    },
  });
  const runtimeEvents = projectRuntimeEvents({
    verificationIntents: [intent],
    verificationResults: [verificationResult],
    repairRequiredHandoffs: [repairRequired],
    ...(spec.includeProposal ? { repairProposals: [repairProposal] } : {}),
    ...(spec.includeAuthority ? { repairAuthorities: [repairAuthority] } : {}),
    ...(spec.includeApplyRequest ? { repairApplyRequests: [repairApplyRequest] } : {}),
    ...(spec.includeApply ? { repairApplyObservations: [repairApply] } : {}),
    ...(spec.includePostRepairRequirement
      ? { postRepairVerificationRequirements: [postRepairVerificationRequirement] }
      : {}),
    ...(spec.includePostRepairRequest
      ? { postRepairVerificationRequests: [postRepairVerificationRequest] }
      : {}),
    ...(spec.includePostRepairResult
      ? { postRepairVerificationResults: [postRepairVerificationResult] }
      : {}),
    repairVerdictProofInputs: [repairVerdictProofInput],
    repairVerdictTerminalProjections: [repairVerdictTerminalProjection],
    loopFinalizationInputs: [loopFinalizationInput],
    loopFinalizationDecisions: [loopFinalizationDecision],
    productLoopCloseoutInputs: [productLoopCloseoutInput],
    productLoopCloseouts: [productLoopCloseout],
    productCompletionPackets: [productCompletionPacket],
    nextTurnBundles: [nextTurnBundle],
    ...(requestPreparation ? { nextTurnRequestPreparations: [requestPreparation] } : {}),
    ...(toolOutcomeBundle ? { toolOutcomeBundles: [toolOutcomeBundle] } : {}),
    replaySafeLoopStateSummaries: [replaySafeLoopStateSummary],
    resultFacts: {
      status: repairVerdictTerminalProjection.status,
      terminalClassification: repairVerdictTerminalProjection.terminalClassification,
      terminalReason: loopFinalizationDecision.decision,
      verdictSource: "result",
    },
  });
  const loopTrajectory = projectLoopTrajectory({
    loopId: `loop:${id}`,
    prompt: `matrix ${id}`,
    sessionProjection,
    contextRebuildProjection,
    contextRebuildInput,
    continuationReadiness,
    replaySafeLoopStateSummary,
    resultFacts: {
      status: repairVerdictTerminalProjection.status,
      terminalClassification: repairVerdictTerminalProjection.terminalClassification,
      terminalReason: loopFinalizationDecision.decision,
      verdictSource: "result",
    },
  });
  const productSurface = projectProductSurfaceViewModel({
    status: repairVerdictTerminalProjection.terminalClassification === "success"
      ? "completed"
      : "stopped_error",
    terminalClassification: repairVerdictTerminalProjection.terminalClassification,
    terminalReason: repairVerdictTerminalProjection.terminalClassification === "success"
      ? "completed"
      : "stopped_error",
    runtimeEvents,
    loopTrajectory,
  });

  if (!productSurface) {
    throw new Error(`Product surface was not projected for ${spec.name}`);
  }

  return Object.freeze({
    name: spec.name,
    expected: {
      ...spec.expected,
      nextAction: productCompletionPacket.nextAction,
      missingProofItems: productCompletionPacket.missingProofItems,
    },
    verificationResult,
    repairRequired,
    ...(spec.includeProposal ? { repairProposal } : {}),
    ...(spec.includeAuthority ? { repairAuthority } : {}),
    ...(spec.includeApplyRequest ? { repairApplyRequest } : {}),
    ...(spec.includeApply ? { repairApply } : {}),
    ...(spec.includePostRepairRequirement ? { postRepairVerificationRequirement } : {}),
    ...(spec.includePostRepairRequest ? { postRepairVerificationRequest } : {}),
    ...(spec.includePostRepairResult ? { postRepairVerificationResult } : {}),
    repairVerdictProofInput,
    repairVerdictTerminalProjection,
    loopFinalizationInput,
    loopFinalizationDecision,
    productLoopCloseoutInput,
    productLoopCloseout,
    productCompletionPacket,
    ...(toolOutcomeBundle ? { toolOutcomeBundle } : {}),
    nextTurnBundle,
    ...(requestPreparation ? { requestPreparation } : {}),
    replaySafeLoopStateSummary,
    runtimeEvents,
    loopTrajectory,
    productSurface,
  });
}

function failedToolOutcome(id: string): ToolOutcomeBundleProjection {
  const resultMessageIds = [`tool-result-message:${id}`];
  const blockedReasons = [`tool-call:${id}:executed_failed`];
  return Object.freeze({
    bundleId: `tool-outcome-bundle:${id}`,
    sourceBatchId: `tool-result-batch:${id}`,
    resultMessageIds,
    receiptIds: [`receipt:tool:${id}`],
    executedCount: 1,
    failedCount: 1,
    blockedCount: 0,
    authorityRequiredCount: 0,
    unsupportedCount: 0,
    malformedCount: 0,
    unknownCount: 0,
    notDispatchedCount: 0,
    mixedOutcomeStatus: "single_non_success",
    nextAction: "review_failed_result",
    nextActionReason: "failed tool result must remain visible before continuing",
    redactionStatus: "report-safe",
    detailStatuses: [{
      toolCallId: `tool-call:${id}`,
      toolName: "read",
      resultStatus: "executed_failed",
      terminalSuccessClaim: false,
    }],
    carryForwardFacts: {
      status: "single_non_success",
      nextAction: "review_failed_result",
      resultMessageIds,
      blockedReasons,
      terminalSuccessClaim: false,
    },
    blockingFacts: blockedReasons,
    notProvenClaims: [
      "terminal-success",
      "task-success",
      "tool-outcome-bundle-is-not-task-success",
      "tool-outcome-next-action-is-not-task-success",
    ],
    terminalSuccessClaim: false,
  });
}
