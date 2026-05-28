import type { Interface as ReadlineInterface } from "node:readline";
import process from "node:process";

import type { ApprovalTrustPolicy } from "../../core/shell/approvalTrustPolicy.js";
import type { ShellRuntimeContext } from "../../core/shell/runtimeContext.js";
import { ShellSessionRuntime } from "../../core/shell/sessionRuntime.js";
import type { StreamingRenderer } from "../../renderer/StreamingRenderer.js";
import type { SessionManager } from "../../session/SessionManager.js";
import type { CliOptions } from "../../entrypoints/cliArgs.js";
import {
  createCliApprovalEscalationBridge,
} from "../approval/cliApprovalEscalationBridge.js";
import type { CliApprovalModeState } from "../approval/cliApprovalModeState.js";
import type { CliProviderRuntimeBridge } from "../provider/cliProviderRuntimeBridge.js";
import { streamCliRuntimePrompt } from "./cliRuntimeInvocationBridge.js";

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
}): ShellSessionRuntime {
  const isStdinTty = input.isStdinTty ?? (() => Boolean(process.stdin.isTTY));
  const sessionRuntime = new ShellSessionRuntime({
    sessionManager: input.sessionManager,
    renderer: input.renderer,
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
      });
      return streamCliRuntimePrompt({
        prompt,
        sessionId: input.runtimeContext.session.id,
        workspaceRoot: input.runtimeContext.cwd,
        signal,
        maxTurns: input.runtimeContext.runtimeConfig.maxTurns,
        escalationPromptHandler,
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
