import type { ProviderCredentialResolution } from "../core/shell/providerCredentials.js";
import { checkRealProviderReadiness } from "../core/shell/providerReadiness.js";
import { decideQueryRoute, type TaskMode } from "../core/query/routeDecision.js";
import { streamLightweightChat } from "../core/query/lightweightChat.js";
import { validateLightweightProviderCredential } from "../core/query/lightweightRoute.js";
import type { QueryEvent } from "../core/query/events.js";
import type { QueryRuntimeStateSeed } from "../core/query/runtimeState.js";
import {
  type ApplyPatchRuntimeRouteOptions,
} from "../orchestration/runMvpIntegratedFlow.js";
import { streamProductTurn } from "../product/turn/turnFacade.js";
import type { PlanningRuntimeProductExecutionOptions } from "../orchestration/planningRuntimeProductExecution.js";
import type { EscalationPrompt, EscalationResponse } from "../sandbox/index.js";
import type { SessionContinuitySnapshot } from "../session/SessionManager.js";
import { createProviderReadinessCliTerminalEvent } from "./providerReadinessCliSurface.js";

export type CliApplyPatchRuntimeRouteOptions = ApplyPatchRuntimeRouteOptions;

type ProviderMode = "synthetic" | "real";

export interface CliRuntimeInvocationInput {
  readonly sessionId: string;
  readonly prompt: string;
  readonly workspaceRoot: string;
  readonly signal: AbortSignal;
  readonly maxTurns: number;
  readonly escalationPromptHandler: (
    prompt: EscalationPrompt,
  ) => Promise<EscalationResponse>;
  readonly providerCredentialResolution: ProviderCredentialResolution;
  readonly agentMode: "plan" | "build";
  readonly runtimeSeed?: QueryRuntimeStateSeed;
  readonly continuityState?: SessionContinuitySnapshot;
  readonly applyPatchRuntimeRoute?: ApplyPatchRuntimeRouteOptions;
  readonly planningMutationExecution?: PlanningRuntimeProductExecutionOptions;
  readonly providerModeEnv?: string;
}

export interface CliRuntimeInvocationRequest
  extends Omit<CliRuntimeInvocationInput, "providerModeEnv"> {
  readonly providerMode: ProviderMode;
}

export interface CliRuntimeInvocationResult {
  readonly events: AsyncIterable<QueryEvent>;
}

type IntegratedFlowRunner = (
  input: Parameters<typeof streamProductTurn>[0],
) => AsyncIterable<QueryEvent>;
type LightweightRunner = (
  input: Parameters<typeof streamLightweightChat>[0],
) => AsyncIterable<QueryEvent>;
type ProviderReadinessChecker = (
  input: Parameters<typeof checkRealProviderReadiness>[0],
) => ReturnType<typeof checkRealProviderReadiness>;

export interface CliRuntimeInvocationDependencies {
  readonly streamIntegratedFlow: IntegratedFlowRunner;
  readonly streamLightweight: LightweightRunner;
  readonly checkProviderReadiness: ProviderReadinessChecker;
  readonly createReadinessTerminalEvent: typeof createProviderReadinessCliTerminalEvent;
}

const defaultCliRuntimeInvocationDependencies: CliRuntimeInvocationDependencies =
  {
    streamIntegratedFlow: streamProductTurn,
    streamLightweight: streamLightweightChat,
    checkProviderReadiness: checkRealProviderReadiness,
    createReadinessTerminalEvent: createProviderReadinessCliTerminalEvent,
  };

export function buildCliRuntimeInvocation(
  input: CliRuntimeInvocationInput,
): CliRuntimeInvocationRequest {
  const providerMode: ProviderMode =
    input.providerModeEnv === "synthetic" ? "synthetic" : "real";
  const { providerModeEnv: _providerModeEnv, ...request } = input;
  return {
    ...request,
    providerMode,
  };
}

export function runCliRuntimeInvocation(
  input: CliRuntimeInvocationInput,
  dependencies: CliRuntimeInvocationDependencies =
    defaultCliRuntimeInvocationDependencies,
): CliRuntimeInvocationResult {
  const request = buildCliRuntimeInvocation(input);
  return {
    events: streamCliRuntimeInvocation(request, dependencies),
  };
}

async function* streamCliRuntimeInvocation(
  request: CliRuntimeInvocationRequest,
  dependencies: CliRuntimeInvocationDependencies,
): AsyncIterable<QueryEvent> {
  if (request.applyPatchRuntimeRoute) {
    yield* dependencies.streamIntegratedFlow({
      sessionId: request.sessionId,
      prompt: request.prompt,
      continuityState: request.continuityState,
      workspaceRoot: request.workspaceRoot,
      abortSignal: request.signal,
      escalationPromptHandler: request.escalationPromptHandler,
      providerMode: request.providerMode,
      maxTurns: request.maxTurns,
      realProvider: request.providerCredentialResolution.credential,
      agentMode: request.agentMode,
      runtimeSeed: request.runtimeSeed,
      applyPatchRuntimeRoute: request.applyPatchRuntimeRoute,
      planningMutationExecution: request.planningMutationExecution,
    });
    return;
  }

  const routeDecision = decideQueryRoute({
    prompt: request.prompt,
    agentMode: request.agentMode,
    hasRuntimeSeed: Boolean(request.runtimeSeed),
  });

  if (routeDecision.route === "lightweight") {
    const localReadiness = validateLightweightProviderCredential({
      providerMode: request.providerMode,
      providerCredentialResolution: request.providerCredentialResolution,
    });
    if ("stopReason" in localReadiness) {
      yield dependencies.createReadinessTerminalEvent({
        sessionId: request.sessionId,
        prompt: request.prompt,
        stopReason: localReadiness.stopReason,
      });
      return;
    }
    yield* dependencies.streamLightweight({
      sessionId: request.sessionId,
      prompt: request.prompt,
      mode: routeDecision.mode as Extract<
        TaskMode,
        "chat" | "analysis" | "plan"
      >,
      providerMode: request.providerMode,
      providerCredential: request.providerCredentialResolution.credential,
      continuityState: request.continuityState,
      signal: request.signal,
    });
    return;
  }

  if (request.providerMode === "real") {
    const readiness = await dependencies.checkProviderReadiness({
      provider: request.providerCredentialResolution.provider,
      apiKey: request.providerCredentialResolution.credential?.apiKey,
      accountAuth: request.providerCredentialResolution.credential?.accountAuth,
      baseUrl: request.providerCredentialResolution.baseUrl,
      model: request.providerCredentialResolution.model,
    });
    if (readiness.ok === false) {
      yield dependencies.createReadinessTerminalEvent({
        sessionId: request.sessionId,
        prompt: request.prompt,
        stopReason: readiness.failure.stopReason,
      });
      return;
    }
  }

  yield* dependencies.streamIntegratedFlow({
    sessionId: request.sessionId,
    prompt: request.prompt,
    continuityState: request.continuityState,
    workspaceRoot: request.workspaceRoot,
    abortSignal: request.signal,
    escalationPromptHandler: request.escalationPromptHandler,
    providerMode: request.providerMode,
    maxTurns: request.maxTurns,
    realProvider: request.providerCredentialResolution.credential,
    agentMode: request.agentMode,
    runtimeSeed: request.runtimeSeed,
    applyPatchRuntimeRoute: request.applyPatchRuntimeRoute,
    planningMutationExecution: request.planningMutationExecution,
  });
}
