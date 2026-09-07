import type { ProviderCredentialResolution } from "../core/shell/providerCredentials.js";
import { checkRealProviderReadiness } from "../core/shell/providerReadiness.js";
import { streamLightweightChat } from "../core/query/lightweightChat.js";
import type { QueryEvent } from "../core/query/runtime/events.js";
import type { QueryRuntimeStateSeed } from "../core/query/runtime/state.js";
import {
  type ApplyPatchRuntimeRouteOptions,
} from "../orchestration/runMvpIntegratedFlow.js";
import { streamProductTurn } from "../turn/turnFacade.js";
import type { PlanningRuntimeProductExecutionOptions } from "../orchestration/planningRuntimeProductExecution.js";
import type { EscalationPrompt, EscalationResponse } from "../sandbox/index.js";
import type { SessionContinuitySnapshot } from "../session/SessionManager.js";
import { createProviderReadinessCliTerminalEvent } from "./providerReadinessCliSurface.js";
import { runAutonomousReActLoop } from "../core/query/agentLoop.js";
import type { PermissionScope } from "../cli/approval/permissionScope.js";
import type { AskQuestion } from "../core/tools/ask.js";
import type { SessionMessage } from "../session/schema/sessionMessage.js";
import { decideQueryRoute } from "../core/query/routeDecision.js";
import { validateLightweightProviderCredential } from "../core/query/lightweightRoute.js";
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
  readonly permissionScope?: PermissionScope;
  readonly interactiveAsk?: (
    questions: AskQuestion[],
  ) => Promise<Record<string, string>>;
  readonly historyMessages?: readonly SessionMessage[];
  readonly onTurnMessage?: (message: SessionMessage) => void;
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
  // If in synthetic test mode or explicitly requested via legacy patch route, run integrated flow or lightweight test mock
  if (request.applyPatchRuntimeRoute || request.providerMode === "synthetic") {
    const routeDecision = decideQueryRoute({
      prompt: request.prompt,
      agentMode: request.agentMode,
      hasRuntimeSeed: Boolean(request.runtimeSeed),
    });

    if (
      !request.applyPatchRuntimeRoute &&
      routeDecision.mode === "chat" &&
      validateLightweightProviderCredential({
        providerMode: request.providerMode,
        providerCredentialResolution: request.providerCredentialResolution,
      }).ok
    ) {
      yield* dependencies.streamLightweight({
        sessionId: request.sessionId,
        prompt: request.prompt,
        mode: "chat",
        providerMode: request.providerMode,
        providerCredential: request.providerCredentialResolution.credential,
        signal: request.signal,
      });
      return;
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

  // Unified Autonomous ReAct Agent Loop: Always injects full tools and drives iterative tool-calling
  yield* runAutonomousReActLoop({
    sessionId: request.sessionId,
    prompt: request.prompt,
    workspaceRoot: request.workspaceRoot,
    agentMode: request.agentMode,
    permissionScope: request.permissionScope,
    escalationPromptHandler: request.escalationPromptHandler,
    interactiveAsk: request.interactiveAsk,
    historyMessages: request.historyMessages,
    onTurnMessage: request.onTurnMessage,
    realProvider: {
      apiKey: request.providerCredentialResolution.credential?.apiKey,
      baseUrl:
        request.providerCredentialResolution.baseUrl ??
        request.providerCredentialResolution.credential?.baseUrl,
      model:
        request.providerCredentialResolution.model ??
        request.providerCredentialResolution.credential?.model,
    },
    maxTurns: request.maxTurns,
    abortSignal: request.signal,
  });
}
