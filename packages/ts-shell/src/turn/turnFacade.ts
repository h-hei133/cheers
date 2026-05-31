import type { QueryEvent } from "../core/query/runtime/events.js";
import type { RuntimeEvidenceSavePoint } from "../evidence/savepoint/model.js";
import {
  runMvpIntegratedFlow,
  streamMvpIntegratedFlow,
  type ApplyPatchRuntimeRouteOptions,
  type MvpIntegratedFlowOptions,
} from "../orchestration/runMvpIntegratedFlow.js";
import type { OrchestrationResult } from "../orchestration/types.js";
import type { RuntimeTurnBoundaryObserver } from "../runtime/turnBoundary.js";
import type { RuntimeTurnSnapshot } from "./turnSnapshot.js";

export const PRODUCT_TURN_FACADE_VERSION = "v1";

export type ProductTurnInput = MvpIntegratedFlowOptions;
export type ProductTurnStreamInput = Parameters<typeof streamMvpIntegratedFlow>[0];
export type { ApplyPatchRuntimeRouteOptions };

export interface ProductTurnContext {
  readonly sessionId: string;
  readonly workspaceRoot: string;
  readonly providerMode: "synthetic" | "real" | "default";
  readonly agentMode: "plan" | "build" | "default";
}

export interface ProductTurnCapabilityDecision {
  readonly source: "legacy-integrated-flow";
  readonly executionEntrypoint: "runMvpIntegratedFlow";
  readonly applyPatchRuntimeRoute: "provided" | "not-provided";
  readonly planningMutationExecution: "provided" | "not-provided";
  readonly browserRuntimeStatus: "provided" | "runtime-default";
  readonly evidence: readonly string[];
}

export interface ProductTurnResultHandoff {
  readonly status: OrchestrationResult["status"];
  readonly terminalClassification: OrchestrationResult["terminalClassification"];
  readonly terminalReason: OrchestrationResult["terminalReason"];
  readonly taskKind?: string;
  readonly changedFiles: readonly string[];
  readonly failedFiles: readonly string[];
  readonly verifiedFiles: readonly string[];
  readonly unverifiedFiles: readonly string[];
  readonly evidenceCount: number;
  readonly resultSessionCliSuccessUpgrade: false;
}

export interface ProductTurnResult {
  readonly facadeVersion: typeof PRODUCT_TURN_FACADE_VERSION;
  readonly context: ProductTurnContext;
  readonly capabilityDecision: ProductTurnCapabilityDecision;
  readonly result: OrchestrationResult;
  readonly handoff: ProductTurnResultHandoff;
  readonly runtimeBoundary: ProductTurnRuntimeBoundaryProjection;
}

export interface ProductTurnRuntimeBoundaryProjection {
  readonly snapshots: readonly RuntimeTurnSnapshot[];
  readonly savePoints: readonly RuntimeEvidenceSavePoint[];
}

export interface ProductTurnRuntimeDependencies {
  readonly runIntegratedFlow?: (
    input: ProductTurnInput,
  ) => Promise<OrchestrationResult>;
}

export interface ProductTurnStreamDependencies {
  readonly streamIntegratedFlow?: (
    input: ProductTurnStreamInput,
  ) => AsyncIterable<QueryEvent>;
}

// Compatibility facade: Route E establishes a product-owned entrypoint before
// the oversized integrated flow can be safely split into owned turn modules.
export async function runProductTurn(
  input: ProductTurnInput,
  dependencies: ProductTurnRuntimeDependencies = {},
): Promise<ProductTurnResult> {
  const runIntegratedFlow = dependencies.runIntegratedFlow ?? runMvpIntegratedFlow;
  const snapshots: RuntimeTurnSnapshot[] = [];
  const savePoints: RuntimeEvidenceSavePoint[] = [];
  const result = await runIntegratedFlow({
    ...input,
    runtimeTurnBoundary: composeRuntimeTurnBoundaryObservers(
      input.runtimeTurnBoundary,
      {
        onTurnSnapshot: (snapshot) => snapshots.push(snapshot),
        onEvidenceSavePoint: (savePoint) => savePoints.push(savePoint),
      },
    ),
  });
  return {
    facadeVersion: PRODUCT_TURN_FACADE_VERSION,
    context: projectProductTurnContext(input),
    capabilityDecision: projectProductTurnCapabilityDecision(input),
    result,
    handoff: projectProductTurnResultHandoff(result),
    runtimeBoundary: {
      snapshots,
      savePoints,
    },
  };
}

export function streamProductTurn(
  input: ProductTurnStreamInput,
  dependencies: ProductTurnStreamDependencies = {},
): AsyncIterable<QueryEvent> {
  const streamIntegratedFlow =
    dependencies.streamIntegratedFlow ?? streamMvpIntegratedFlow;
  return streamIntegratedFlow(input);
}

export function projectProductTurnContext(
  input: ProductTurnInput,
): ProductTurnContext {
  return {
    sessionId: input.sessionId,
    workspaceRoot: input.workspaceRoot,
    providerMode: input.providerMode ?? "default",
    agentMode: input.agentMode ?? "default",
  };
}

export function projectProductTurnCapabilityDecision(
  input: ProductTurnInput,
): ProductTurnCapabilityDecision {
  return {
    source: "legacy-integrated-flow",
    executionEntrypoint: "runMvpIntegratedFlow",
    applyPatchRuntimeRoute: input.applyPatchRuntimeRoute ? "provided" : "not-provided",
    planningMutationExecution: input.planningMutationExecution ? "provided" : "not-provided",
    browserRuntimeStatus: input.browserRuntimeStatus ? "provided" : "runtime-default",
    evidence: [
      "product-turn-facade:compatibility-entrypoint:runMvpIntegratedFlow",
      `product-turn-facade:provider-mode:${input.providerMode ?? "default"}`,
      `product-turn-facade:agent-mode:${input.agentMode ?? "default"}`,
    ],
  };
}

export function projectProductTurnResultHandoff(
  result: OrchestrationResult,
): ProductTurnResultHandoff {
  return {
    status: result.status,
    terminalClassification: result.terminalClassification,
    terminalReason: result.terminalReason,
    taskKind: result.codingResult?.taskKind,
    changedFiles: result.codingResult?.changedFiles ?? [],
    failedFiles: (result.codingResult?.failedFiles ?? []).map((entry) => entry.path),
    verifiedFiles: result.codingResult?.verifiedFiles ?? [],
    unverifiedFiles: (result.codingResult?.unverifiedFiles ?? []).map((entry) => entry.path),
    evidenceCount: result.codingResult?.evidence?.length ?? 0,
    resultSessionCliSuccessUpgrade: false,
  };
}

function composeRuntimeTurnBoundaryObservers(
  first: RuntimeTurnBoundaryObserver | undefined,
  second: RuntimeTurnBoundaryObserver,
): RuntimeTurnBoundaryObserver {
  return {
    onTurnSnapshot: (snapshot) => {
      first?.onTurnSnapshot?.(snapshot);
      second.onTurnSnapshot?.(snapshot);
    },
    onEvidenceSavePoint: (savePoint) => {
      first?.onEvidenceSavePoint?.(savePoint);
      second.onEvidenceSavePoint?.(savePoint);
    },
  };
}
