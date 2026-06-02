import type { Interface as ReadlineInterface } from "node:readline";
import type { ReadStream } from "node:tty";

import { ApprovalTrustPolicy } from "../../core/shell/approvalTrustPolicy.js";
import {
  createComponentLogger,
  createTraceContext,
  setGlobalTraceContext,
} from "../../observability/index.js";
import { parseCliArgs } from "../../entrypoints/cliArgs.js";
import type { CliOptions } from "../options/cliOptions.js";
import { printCliDoctor } from "../../entrypoints/cliDoctor.js";
import {
  createCliApprovalModeState,
} from "../approval/cliApprovalModeState.js";
import {
  runCliHostCommand,
} from "../host/runner.js";
import {
  createCliProviderRuntimeBridge,
} from "../provider/cliProviderRuntimeBridge.js";
import {
  createCliSessionRuntime,
} from "../runtime/cliSessionRuntimeFactory.js";
import {
  createCliBootstrapRuntimeContext,
  createCliRootContext,
  logCliBootstrapSessionInitialized,
} from "./cliBootstrapContext.js";
import {
  projectAndRenderCliStartupSurface,
} from "./cliStartupSurface.js";
import {
  runInteractiveLoop,
} from "../interactive/interactiveLoop.js";
import {
  runCliPrintModeRouter,
} from "../print/printModeRouter.js";
import {
  captureCliStdinPrompts,
} from "../print/stdinPromptCapture.js";

export interface CliProcessRunnerInput {
  readonly args: readonly string[];
  readonly launchCwd: string;
  readonly stdin: ReadStream;
  readonly process: NodeJS.Process;
  readonly writeOutput: (message: string) => void;
  readonly writeError: (message: string) => void;
  readonly exit: (code: number) => never;
}

export async function runCliProcess(
  input: CliProcessRunnerInput,
): Promise<void> {
  setGlobalTraceContext(createTraceContext());
  const logger = createComponentLogger("cli");
  const approvalTrustPolicy = new ApprovalTrustPolicy();
  const approvalModeState = createCliApprovalModeState();

  const parsedCliArgs = parseCliArgs(input.args, { cwd: input.launchCwd });
  if (parsedCliArgs.ok === false) {
    input.writeError(parsedCliArgs.error.message);
    input.exit(parsedCliArgs.error.exitCode);
  }
  if (parsedCliArgs.args.versionRequested) {
    input.writeOutput("0.1.0 (ts-shell MVP)");
    return;
  }

  const options: CliOptions = parsedCliArgs.args.options;
  if (options.hostCommand) {
    await runCliHostCommand({
      commandJson: options.hostCommand,
      projectRoot: input.launchCwd,
      writeOutput: input.writeOutput,
      exit: input.exit,
    });
    return;
  }

  const rootContext = createCliRootContext({
    launchCwd: input.launchCwd,
    options,
  });

  if (parsedCliArgs.args.doctorRequested) {
    printCliDoctor(rootContext.workspaceRoot, input.launchCwd);
    return;
  }

  const bootstrapRuntime = createCliBootstrapRuntimeContext({
    launchCwd: input.launchCwd,
    options,
    rootContext,
    writeError: input.writeError,
    exit: input.exit,
  });
  const {
    sessionManager,
    renderer,
    recoveryCandidate,
    runtimeContext,
  } = bootstrapRuntime;
  const providerRuntimeBridge = createCliProviderRuntimeBridge({
    projectRoot: runtimeContext.projectRoot,
    options,
  });
  const resolvedCredential =
    providerRuntimeBridge.resolveCredentialSnapshot();
  const mcpGateway = bootstrapRuntime.mcpGateway;

  const stdinPromptCapture = await captureCliStdinPrompts({
    options,
    stdin: input.stdin,
  });
  projectAndRenderCliStartupSurface({
    options,
    cliModePlan: stdinPromptCapture.cliModePlan,
    stdinTransportMode: stdinPromptCapture.stdinTransportMode,
    nonInteractivePromptCount:
      stdinPromptCapture.nonInteractivePrompts.length,
    launchCwd: input.launchCwd,
    bootstrapRuntime,
    providerCredentialResolution: resolvedCredential,
    providerModeEnv: providerRuntimeBridge.providerModeEnv(),
  });
  logCliBootstrapSessionInitialized({ logger, bootstrapRuntime });

  let readline: ReadlineInterface | null = null;

  const sessionRuntime = createCliSessionRuntime({
    sessionManager,
    renderer,
    runtimeContext,
    options,
    approvalTrustPolicy,
    approvalModeState,
    providerRuntimeBridge,
    getReadline: () => readline,
    isStdinTty: () => Boolean(input.stdin.isTTY),
  });

  const handledPrintMode = await runCliPrintModeRouter({
    cliModePlan: stdinPromptCapture.cliModePlan,
    options,
    nonInteractivePrompts: stdinPromptCapture.nonInteractivePrompts,
    pipedInput: stdinPromptCapture.pipedInput,
    bootstrapRuntime,
    sessionRuntime,
    logger,
    writeError: input.writeError,
    exit: input.exit,
    setActiveNonInteractiveApprovalMode: (mode) => {
      approvalModeState.set(mode);
    },
  });
  if (handledPrintMode) {
    return;
  }

  await runInteractiveLoop({
    stdin: input.stdin,
    process: input.process,
    sessionManager,
    renderer,
    runtimeContext,
    sessionRuntime,
    logger,
    approvalTrustPolicy,
    fallbackSessionId: recoveryCandidate?.id,
    initialMcpGateway: mcpGateway,
    setReadline: (nextReadline) => {
      readline = nextReadline;
    },
    setActiveNonInteractiveApprovalMode: (mode) => {
      approvalModeState.set(mode);
    },
    exit: input.exit,
  });
}
