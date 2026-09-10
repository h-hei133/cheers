import type { Interface as ReadlineInterface } from "node:readline";
import process from "node:process";

import type { ApprovalTrustPolicy } from "../../core/shell/approvalTrustPolicy.js";
import type { ShellRuntimeContext } from "../../core/shell/runtimeContext.js";
import { ShellSessionRuntime } from "../../core/shell/sessionRuntime.js";
import type { StreamingRenderer } from "../../renderer/StreamingRenderer.js";
import type { SessionManager } from "../../session/SessionManager.js";
import type { CliOptions } from "../options/cliOptions.js";
import {
  createCliApprovalEscalationBridge,
} from "../approval/cliApprovalEscalationBridge.js";
import type { CliApprovalModeState } from "../approval/cliApprovalModeState.js";
import type { CliProviderRuntimeBridge } from "../provider/cliProviderRuntimeBridge.js";
import type { EscalationPrompt } from "../../sandbox/index.js";
import { promptInteractiveQuestions } from "../interactive/interactiveAskBridge.js";
import { streamCliRuntimePrompt } from "./cliRuntimeInvocationBridge.js";
import { compactSessionHistory } from "../../core/shell/compaction.js";
import type { InteractiveApprovalResult } from "../interactive/picker/approval.js";
export function createCliSessionRuntime(input: {
  readonly sessionManager: SessionManager;
  readonly renderer: StreamingRenderer;
  readonly runtimeContext: ShellRuntimeContext;
  readonly options: CliOptions;
  readonly approvalTrustPolicy: ApprovalTrustPolicy;
  readonly approvalModeState: CliApprovalModeState;
  readonly providerRuntimeBridge: CliProviderRuntimeBridge;
  readonly getReadline: () => ReadlineInterface | null;
  readonly isStdinTty?: () => boolean;
  readonly promptInteractiveApproval?: (
    prompt: EscalationPrompt,
  ) => Promise<InteractiveApprovalResult>;
}): ShellSessionRuntime {
  const isStdinTty = input.isStdinTty ?? (() => Boolean(process.stdin.isTTY));
  const sessionRuntime = new ShellSessionRuntime({
    sessionManager: input.sessionManager,
    renderer: input.renderer,
    compactHistory: (sessionId, signal, instructions) => {
      const resolved = input.providerRuntimeBridge.resolveCredentialSnapshot();
      const apiKey = resolved.credential?.apiKey;
      const baseUrl = resolved.baseUrl ?? resolved.credential?.baseUrl;
      const model = resolved.model ?? resolved.credential?.model;
      if (!apiKey || !baseUrl || !model) {
        return Promise.resolve({
          status: "failed" as const,
          reason: `No credential for provider ${resolved.provider}; set ${resolved.expectedEnvVarName} or configure a connection.`,
        });
      }
      return compactSessionHistory({
        store: input.sessionManager,
        sessionId,
        provider: { apiKey, baseUrl, model },
        signal,
        instructions,
      });
    },
    runPrompt: (prompt, signal, runtimeSeed, continuityState) => {
      const resolvedCredential =
        input.providerRuntimeBridge.resolveCredentialSnapshot();
      const escalationPromptHandler = createCliApprovalEscalationBridge({
        renderer: input.renderer,
        readline: input.getReadline,
        getViewMode: () => sessionRuntime.getViewMode(),
        trustPolicy: input.approvalTrustPolicy,
        getProjectRoot: () => input.runtimeContext.projectRoot,
        getNonInteractiveDecision: () =>
          !isStdinTty()
            ? input.options.nonInteractiveApproval
            : undefined,
        getApprovalModeObject: input.approvalModeState.get,
        sessionManager: input.sessionManager,
        getSessionId: () => input.runtimeContext.session.id,
        getPermissionScope: () => sessionRuntime.getPermissionScope(),
        promptInteractiveApproval: input.promptInteractiveApproval,
      });
      const existingSession = input.sessionManager.getSession(
        input.runtimeContext.session.id,
      );
      const allTurns = existingSession?.turns ?? [];
      const historyMessages =
        allTurns.length > 0 &&
        allTurns[allTurns.length - 1]?.content === prompt
          ? allTurns.slice(0, -1)
          : allTurns;

      return streamCliRuntimePrompt({
        prompt,
        sessionId: input.runtimeContext.session.id,
        workspaceRoot: input.runtimeContext.cwd,
        signal,
        maxTurns: input.runtimeContext.runtimeConfig.maxTurns,
        escalationPromptHandler,
        permissionScope: sessionRuntime.getPermissionScope(),
        interactiveAsk: (questions) =>
          promptInteractiveQuestions(input.getReadline(), questions),
        historyMessages,
        onTurnMessage: (message) =>
          input.sessionManager.addTurn(input.runtimeContext.session.id, message),
        providerCredentialResolution: resolvedCredential,
        agentMode: sessionRuntime.getAgentMode(),
        runtimeSeed,
        continuityState,
        options: input.options,
        providerRuntimeBridge: input.providerRuntimeBridge,
      });
    },
  });
  return sessionRuntime;
}
