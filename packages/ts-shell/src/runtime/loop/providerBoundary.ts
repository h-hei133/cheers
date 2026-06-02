import { createModelRequestBoundary } from "../../provider/request/boundary.js";
import type { ProviderRegistryProjection } from "../../provider/registry/provider.js";
import {
  selectSyntheticProviderStep,
  syntheticProviderStepToStreamEvents,
  type SyntheticProviderProgram,
} from "../../provider/response/synthetic.js";
import {
  projectModelBoundaryPhase,
  type ModelBoundaryPhaseProjection,
} from "./modelBoundary.js";
import type {
  AgentLoopContractModelResponseBoundary,
  AgentLoopContractTurnInput,
} from "./contract.js";

export interface SyntheticModelBoundaryInput {
  readonly program: SyntheticProviderProgram;
  readonly providerId?: string;
  readonly providerRegistry?: ProviderRegistryProjection;
  readonly providerSafeLabel?: string;
  readonly modelSafeLabel?: string;
  readonly loopId?: string;
}

export type SyntheticModelBoundary = (
  input: AgentLoopContractTurnInput,
) => Promise<AgentLoopContractModelResponseBoundary>;

export function createSyntheticModelBoundary(
  input: SyntheticModelBoundaryInput,
): SyntheticModelBoundary {
  return async (turnInput) => {
    const turnId = `${turnInput.sessionId}:turn:${turnInput.turn}`;
    const requestId = `${turnId}:model-request`;
    const responseId = `${turnId}:synthetic-response`;
    const requestBoundary = createModelRequestBoundary({
      requestId,
      turnId,
      loopId: input.loopId ?? turnInput.sessionId,
      providerId: input.providerId ?? "synthetic",
      providerMode: "synthetic",
      providerSafeLabel: input.providerSafeLabel ?? "synthetic-provider",
      modelSafeLabel: input.modelSafeLabel ?? "synthetic-model",
      providerReadinessStatus: "ready",
      providerRegistry: input.providerRegistry,
      planningConstraints: turnInput.pendingNextTurnFacts,
      missingRequiredFacts: turnInput.pendingPreparedRequest?.blockedReasons ?? [],
      notProvenClaims: [
        "synthetic-provider-response-is-not-task-success",
        ...(turnInput.pendingPreparedRequest?.notProvenClaims ?? []),
      ],
    });
    const step = selectSyntheticProviderStep(input.program, turnInput.turn);
    const streamEvents = await syntheticProviderStepToStreamEvents({
      step,
      turn: {
        requestId,
        responseId,
        turnId,
        turn: turnInput.turn,
      },
    });
    const phase = projectModelBoundaryPhase({
      phaseId: `${turnId}:model-boundary`,
      turnId,
      requestBoundary,
      responseId,
      streamId: `${turnId}:provider-stream`,
      streamEvents,
      notProvenClaims: [
        "synthetic-provider-response-is-not-task-success",
        "model-boundary-observed-is-not-task-success",
      ],
    });

    return modelBoundaryFromPhase(phase);
  };
}

export function modelBoundaryFromPhase(
  phase: ModelBoundaryPhaseProjection,
): AgentLoopContractModelResponseBoundary {
  const toolCalls = phase.toolCallBatch.calls
    .filter((call) => call.status === "prepared")
    .map((call) => {
      const args = call.reportSafeArguments && typeof call.reportSafeArguments === "object"
        ? call.reportSafeArguments as Record<string, unknown>
        : undefined;
      return {
        id: call.id,
        name: call.name,
        ...(args ? { arguments: args } : {}),
      };
    });

  return {
    responseId: phase.responseBoundary.responseId,
    stopReason: stopReasonFromPhase(phase),
    safeSummary: phase.responseBoundary.assistantContentSummary,
    toolCalls,
    requestBoundary: phase.requestBoundary,
    responseBoundary: phase.responseBoundary,
    assistantResponse: phase.assistantResponse,
    toolCallBatch: phase.toolCallBatch,
    modelBoundaryPhase: phase,
    notProvenClaims: phase.notProvenClaims,
  };
}

function stopReasonFromPhase(
  phase: ModelBoundaryPhaseProjection,
): AgentLoopContractModelResponseBoundary["stopReason"] {
  if (phase.stream.status === "cancelled") {
    return "aborted";
  }
  if (
    phase.stream.status === "failed" ||
    phase.stream.status === "output_invalid" ||
    phase.stream.status === "output_insufficient" ||
    phase.stream.status === "redaction_failed"
  ) {
    return "failed";
  }
  return phase.toolCallBatch.calls.length > 0 ? "tool-calls" : "stop";
}
