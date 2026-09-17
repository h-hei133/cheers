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
import { requestCompactionSummary } from "../../core/query/compaction/summarize.js";
import { markContextUnknown } from "../../observability/usageTelemetry.js";
import { toChatMessages } from "../../turn/prompt.js";
import type { CompactionSetup } from "../../turn/session.js";
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
  /**
   * Read at prompt time, not at construction: the interactive surface installs
   * its handler after this runtime is created, so a plain value here would
   * freeze at undefined and the approval overlay would never appear.
   */
  readonly getPromptInteractiveApproval?: () => (
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
    runPrompt: (prompt, signal) => {
      const resolvedCredential =
        input.providerRuntimeBridge.resolveCredentialSnapshot();
      const sessionId = input.runtimeContext.session.id;
      const compactionProvider = {
        apiKey: resolvedCredential.credential?.apiKey,
        baseUrl: resolvedCredential.baseUrl ?? resolvedCredential.credential?.baseUrl,
        model: resolvedCredential.model ?? resolvedCredential.credential?.model,
      };
      // Automatic compaction needs a provider to write the checkpoint; without
      // one the turn runs with the history it has and overflow reports itself.
      const compaction: CompactionSetup | undefined =
        compactionProvider.apiKey && compactionProvider.baseUrl && compactionProvider.model
          ? {
              policy: { contextWindow: input.runtimeContext.runtimeConfig.contextWindow ?? 64_000 },
              summarize: (messages, summarizeSignal) =>
                requestCompactionSummary({
                  provider: {
                    apiKey: compactionProvider.apiKey!,
                    baseUrl: compactionProvider.baseUrl!,
                    model: compactionProvider.model!,
                  },
                  messages: toChatMessages(messages),
                  signal: summarizeSignal,
                }),
              onCompact: (record) => {
                input.sessionManager.appendCompactionEntry(sessionId, record);
                markContextUnknown(sessionId);
              },
            }
          : undefined;
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
        promptInteractiveApproval: input.getPromptInteractiveApproval?.(),
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
        // Carried so the tool pool honours disabledTools / hiddenToolPrefixes.
        runtimeConfig: input.runtimeContext.runtimeConfig,
        prompt,
        sessionId,
        workspaceRoot: input.runtimeContext.cwd,
        signal,
        maxTurns: input.runtimeContext.runtimeConfig.maxTurns,
        escalationPromptHandler,
        permissionScope: sessionRuntime.getPermissionScope(),
        interactiveAsk: (questions) =>
          promptInteractiveQuestions(input.getReadline(), questions),
        historyMessages,
        onTurnMessage: (message) => input.sessionManager.addTurn(sessionId, message),
        compaction,
        providerCredentialResolution: resolvedCredential,
        agentMode: sessionRuntime.getAgentMode(),
        providerRuntimeBridge: input.providerRuntimeBridge,
      });
    },
  });
  return sessionRuntime;
}
