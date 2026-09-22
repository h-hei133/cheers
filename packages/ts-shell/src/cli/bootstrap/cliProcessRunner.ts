import type { Interface as ReadlineInterface } from "node:readline";
import type { ReadStream } from "node:tty";

import { ApprovalTrustPolicy } from "../../core/shell/approvalTrustPolicy.js";
import type { InteractiveApprovalResult } from "../interactive/picker/approval.js";
import {
  createComponentLogger,
  createTraceContext,
  setGlobalTraceContext,
} from "../../observability/index.js";
import { parseCliArgs } from "../../entrypoints/cliArgs.js";
import { applyTheme } from "../../presentation/theme/theme.js";
import type { CliOptions } from "../options/cliOptions.js";
import { printCliDoctor } from "../../entrypoints/cliDoctor.js";
import {
  createCliApprovalModeState,
} from "../approval/cliApprovalModeState.js";
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
import type { EscalationPrompt } from "../../sandbox/index.js";
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
  // The configured theme has to be applied to the shared palette before any
  // surface renders, or the first frame is drawn in the default and never
  // redrawn.
  // The workspace root is passed so a theme the project ships is found, not only
  // the user's and the built-in ones.
  const configuredTheme = runtimeContext.runtimeConfig.theme;
  if (configuredTheme && configuredTheme !== "auto") {
    applyTheme(configuredTheme, runtimeContext.projectRoot ?? runtimeContext.cwd);
  }
  const resolvedCredential =
    providerRuntimeBridge.resolveCredentialSnapshot();
  const mcpGateway = bootstrapRuntime.mcpGateway;

  const stdinPromptCapture = await captureCliStdinPrompts({
    options,
    stdin: input.stdin,
  });
  projectAndRenderCliStartupSurface({
    options,
    stdin: input.stdin,
    stdout: input.process.stdout,
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
  let interactiveApprovalPrompt:
    | ((prompt: EscalationPrompt) => Promise<InteractiveApprovalResult>)
    | undefined;

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
    // Reported as present only once the interactive surface has actually
    // installed a handler. Handing over a fallback closure here would make the
    // approval bridge treat every run as interactive and skip the
    // non-interactive policy path entirely. The getter is read at prompt time
    // because the interactive surface installs its handler after this runtime
    // is built.
    getPromptInteractiveApproval: () => interactiveApprovalPrompt,
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
    stdout: input.process.stdout,
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
    setInteractiveApprovalPrompt: (handler) => {
      interactiveApprovalPrompt = handler;
    },
    setActiveNonInteractiveApprovalMode: (mode) => {
      approvalModeState.set(mode);
    },
    exit: (code?: number) => input.exit(code ?? 0),
  });
}
