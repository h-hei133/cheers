import type { StructuredLogger } from "../../observability/index.js";
import type { ShellSessionRuntime } from "../../core/shell/sessionRuntime.js";
import type {
  CliBootstrapRuntimeContext,
} from "../bootstrap/cliBootstrapContext.js";
import type { ApprovalModeObject } from "../approval/approvalModeContract.js";
import type { CliOptions } from "../options/cliOptions.js";
import {
  runReplayPromptScript,
} from "../../entrypoints/cliRuntimeModule.js";
import type { ApprovalTrustPolicy } from "../../core/shell/approvalTrustPolicy.js";

export interface RunCliReplayModeInput {
  readonly replayFile: string;
  readonly bootstrapRuntime: CliBootstrapRuntimeContext;
  readonly sessionRuntime: ShellSessionRuntime;
  readonly logger: StructuredLogger;
  /** Passed through so a scripted `/permissions` writes the same trust store. */
  readonly approvalTrustPolicy: ApprovalTrustPolicy;
  readonly printMode: boolean;
  readonly jsonEvents?: boolean;
  readonly setActiveNonInteractiveApprovalMode: (
    mode: ApprovalModeObject | undefined,
  ) => void;
  readonly nonInteractiveCliApprovalMode: CliOptions["nonInteractiveApproval"];
}

export async function runCliReplayMode(
  input: RunCliReplayModeInput,
): Promise<void> {
  await runReplayPromptScript({
    replayFile: input.replayFile,
    sessionManager: input.bootstrapRuntime.sessionManager,
    runtimeContext: input.bootstrapRuntime.runtimeContext,
    renderer: input.bootstrapRuntime.renderer,
    sessionRuntime: input.sessionRuntime,
    logger: input.logger,
    approvalTrustPolicy: input.approvalTrustPolicy,
    printMode: input.printMode,
    jsonEvents: input.jsonEvents,
    fallbackSessionId: input.bootstrapRuntime.recoveryCandidate?.id,
    lifecycleNotices: input.bootstrapRuntime.bootstrap.lifecycleNotices,
    setActiveNonInteractiveApprovalMode:
      input.setActiveNonInteractiveApprovalMode,
    nonInteractiveCliApprovalMode: input.nonInteractiveCliApprovalMode,
  });
}
