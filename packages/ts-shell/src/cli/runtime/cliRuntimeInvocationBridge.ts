import type { ProviderCredentialResolution } from "../../core/shell/providerCredentials.js";
import type { EscalationPrompt, EscalationResponse } from "../../sandbox/index.js";
import type { PermissionScope } from "../approval/permissionScope.js";
import type { AskQuestion } from "../../core/tools/ask.js";
import type { SessionMessage } from "../../session/schema/sessionMessage.js";
import { runCliRuntimeInvocation, type CliRuntimeInvocationResult } from "../../entrypoints/cliRuntimeInvocation.js";
import type { CompactionSetup } from "../../turn/session.js";
import type { CliProviderRuntimeBridge } from "../provider/cliProviderRuntimeBridge.js";

export function streamCliRuntimePrompt(input: {
  readonly prompt: string;
  readonly sessionId: string;
  readonly workspaceRoot: string;
  readonly signal: AbortSignal;
  readonly maxTurns: number;
  readonly escalationPromptHandler: (prompt: EscalationPrompt) => Promise<EscalationResponse>;
  readonly providerCredentialResolution: ProviderCredentialResolution;
  readonly agentMode: "plan" | "build";
  readonly permissionScope?: PermissionScope;
  readonly interactiveAsk?: (questions: AskQuestion[]) => Promise<Record<string, string>>;
  readonly historyMessages?: readonly SessionMessage[];
  readonly onTurnMessage?: (message: SessionMessage) => void;
  readonly compaction?: CompactionSetup;
  readonly providerRuntimeBridge: CliProviderRuntimeBridge;
}): CliRuntimeInvocationResult {
  return runCliRuntimeInvocation({
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
    compaction: input.compaction,
    providerModeEnv: input.providerRuntimeBridge.providerModeEnv(),
  });
}
