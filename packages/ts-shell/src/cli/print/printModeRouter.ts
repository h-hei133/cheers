import type { StructuredLogger } from "../../observability/index.js";
import type { ShellSessionRuntime } from "../../core/shell/sessionRuntime.js";
import type {
  CliBootstrapRuntimeContext,
} from "../bootstrap/cliBootstrapContext.js";
import type { ApprovalModeObject } from "../approval/approvalModeContract.js";
import type { CliOptions } from "../options/cliOptions.js";
import type { CliModePlan } from "../../entrypoints/cliModeDispatch.js";
import {
  runNonInteractivePrompt,
  runNonTtyPromptStream,
} from "../../entrypoints/cliRuntimeModule.js";
import { runCliPrintMode } from "./printModeRunner.js";
import { runCliReplayMode } from "./replayModeRunner.js";
import { runCliStdinMode } from "./stdinBatchModeRunner.js";

export interface RunCliPrintModeRouterInput {
  readonly cliModePlan: CliModePlan;
  readonly options: CliOptions;
  readonly nonInteractivePrompts: readonly string[];
  readonly pipedInput: string | null;
  readonly bootstrapRuntime: CliBootstrapRuntimeContext;
  readonly sessionRuntime: ShellSessionRuntime;
  readonly logger: StructuredLogger;
  readonly writeError: (message: string) => void;
  readonly exit: (code: number) => never;
  readonly setActiveNonInteractiveApprovalMode: (
    mode: ApprovalModeObject | undefined,
  ) => void;
}

export async function runCliPrintModeRouter(
  input: RunCliPrintModeRouterInput,
): Promise<boolean> {
  const runtimeInput = {
    sessionManager: input.bootstrapRuntime.sessionManager,
    runtimeContext: input.bootstrapRuntime.runtimeContext,
    renderer: input.bootstrapRuntime.renderer,
    sessionRuntime: input.sessionRuntime,
    logger: input.logger,
    fallbackSessionId: input.bootstrapRuntime.recoveryCandidate?.id,
    lifecycleNotices: input.bootstrapRuntime.bootstrap.lifecycleNotices,
    setActiveNonInteractiveApprovalMode:
      input.setActiveNonInteractiveApprovalMode,
    nonInteractiveCliApprovalMode: input.options.nonInteractiveApproval,
  };

  if (input.cliModePlan.kind === "replay") {
    await runCliReplayMode({
      replayFile: input.cliModePlan.replayFile,
      bootstrapRuntime: input.bootstrapRuntime,
      sessionRuntime: input.sessionRuntime,
      logger: input.logger,
      printMode: Boolean(input.options.printMode),
      setActiveNonInteractiveApprovalMode:
        input.setActiveNonInteractiveApprovalMode,
      nonInteractiveCliApprovalMode: input.options.nonInteractiveApproval,
    });
    return true;
  }

  if (input.cliModePlan.kind === "stdin-stream") {
    await runCliStdinMode({
      mode: "stream-live",
      runStream: () =>
        runNonTtyPromptStream({
          ...runtimeInput,
        }),
    });
    return true;
  }

  if (input.cliModePlan.kind === "print") {
    await runCliPrintMode({
      prompts: input.nonInteractivePrompts,
      writeError: input.writeError,
      exit: input.exit,
      runPrompt: (prompt) =>
        runNonInteractivePrompt({
          ...runtimeInput,
          prompt,
          printMode: true,
          jsonEvents: input.options.jsonEvents === true,
        }),
    });
    return true;
  }

  if (input.cliModePlan.kind === "stdin-batch") {
    await runCliStdinMode({
      mode: "batch",
      prompts: input.nonInteractivePrompts,
      pipedInput: input.pipedInput,
      sessionId: input.bootstrapRuntime.runtimeContext.session.id,
      renderLine: (line) => input.bootstrapRuntime.renderer.renderLine(line),
      runPrompt: (prompt) =>
        runNonInteractivePrompt({
          ...runtimeInput,
          prompt,
          printMode: false,
        }),
    });
    return true;
  }

  return false;
}
