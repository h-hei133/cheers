import type { QueryEvent } from "../../core/query/runtime/events.js";
import type { QueryRuntimeStateSeed } from "../../core/query/runtime/state.js";
import type { ProviderCredentialResolution } from "../../core/shell/providerCredentials.js";
import type {
  EscalationPrompt,
  EscalationResponse,
} from "../../sandbox/index.js";
import type { PermissionScope } from "../approval/permissionScope.js";
import type { AskQuestion } from "../../core/tools/ask.js";
import type { SessionMessage } from "../../session/schema/sessionMessage.js";
import type { SessionContinuitySnapshot } from "../../session/SessionManager.js";
import type { CliOptions } from "../options/cliOptions.js";
import {
  applyPatchDecisionFromApprovalMode,
} from "../../entrypoints/cliApprovalModule.js";
import {
  runCliRuntimeInvocation,
  type CliApplyPatchRuntimeRouteOptions,
} from "../../entrypoints/cliRuntimeInvocation.js";
import type { CliProviderRuntimeBridge } from "../provider/cliProviderRuntimeBridge.js";
import { buildCliRuntimePlanningMutationOptions } from "./cliPlanningMutationBridge.js";

export function buildCliApplyPatchRuntimeRouteOptions(input: {
  readonly options: Pick<
    CliOptions,
    | "applyPatchRuntimeRoute"
    | "applyPatchWorkspaceWrite"
    | "nonInteractiveApproval"
  >;
}): CliApplyPatchRuntimeRouteOptions | undefined {
  if (
    input.options.applyPatchRuntimeRoute !== true &&
    input.options.applyPatchWorkspaceWrite !== true
  ) {
    return undefined;
  }
  return {
    explicitRuntimeOptIn: true,
    requestedUserDecision: applyPatchDecisionFromApprovalMode(
      input.options.nonInteractiveApproval,
    ),
    runtimeSource: "production-adjacent",
    ...(input.options.applyPatchWorkspaceWrite === true
      ? {
          workspaceWrite: {
            explicitWorkspaceWriteOptIn: true,
          },
        }
      : {}),
  };
}

export async function* streamCliRuntimePrompt(input: {
  readonly prompt: string;
  readonly sessionId: string;
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
  readonly options: CliOptions;
  readonly providerRuntimeBridge: CliProviderRuntimeBridge;
}): AsyncIterable<QueryEvent> {
  const invocation = runCliRuntimeInvocation({
    sessionId: input.sessionId,
    prompt: input.prompt,
    workspaceRoot: input.workspaceRoot,
    signal: input.signal,
    maxTurns: input.maxTurns,
    escalationPromptHandler: input.escalationPromptHandler,
    providerCredentialResolution: input.providerCredentialResolution,
    agentMode: input.agentMode,
    permissionScope: input.permissionScope,
    interactiveAsk: input.interactiveAsk,
    historyMessages: input.historyMessages,
    onTurnMessage: input.onTurnMessage,
    runtimeSeed: input.runtimeSeed,
    applyPatchRuntimeRoute: buildCliApplyPatchRuntimeRouteOptions({
      options: input.options,
    }),
    planningMutationExecution: buildCliRuntimePlanningMutationOptions({
      options: input.options,
      workspaceRoot: input.workspaceRoot,
      prompt: input.prompt,
      providerCredentialResolution: input.providerCredentialResolution,
      providerRuntimeBridge: input.providerRuntimeBridge,
    }),
    providerModeEnv: input.providerRuntimeBridge.providerModeEnv(),
  });
  for await (const event of invocation.events) {
    yield event;
  }
}
