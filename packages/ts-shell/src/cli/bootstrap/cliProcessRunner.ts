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
import { readDiagramMode } from "../interactive/tuiSettings.js";
import { setDiagramMode } from "../../presentation/tui/transcript/mermaid.js";
import { listThemes, themeNamesFromPaths } from "../../presentation/themes/index.js";
import type { CliOptions } from "../options/cliOptions.js";
import type { StreamingRenderer } from "../../presentation/terminal/streaming.js";
import { printCliDoctor } from "../../entrypoints/cliDoctor.js";
import { versionLabel } from "../../core/version/current.js";
import { checkForUpdate, formatUpdateNotice } from "../../core/update/check.js";
import { time } from "../../observability/startupTiming.js";
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
import type { EscalationPrompt } from "../../core/shell/approval/contract.js";
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
    input.writeOutput(versionLabel());
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

  time("arguments parsed");
  const bootstrapRuntime = createCliBootstrapRuntimeContext({
    launchCwd: input.launchCwd,
    options,
    rootContext,
    writeError: input.writeError,
    exit: input.exit,
  });
  time("runtime bootstrapped");
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
  applyStartupTheme({
    options,
    workspaceRoot: runtimeContext.projectRoot ?? runtimeContext.cwd,
    configured: runtimeContext.runtimeConfig.theme,
    renderer,
  });
  // Chosen once here for the same reason the theme is: it decides how every
  // frame is built, so reading it later would let the display change between two
  // frames of the same answer.
  setDiagramMode(readDiagramMode(runtimeContext.projectRoot ?? runtimeContext.cwd));
  const resolvedCredential =
    providerRuntimeBridge.resolveCredentialSnapshot();
  const mcpGateway = bootstrapRuntime.mcpGateway;

  const stdinPromptCapture = await captureCliStdinPrompts({
    options,
    stdin: input.stdin,
  });
  time("stdin captured");
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
  time("startup surface rendered");
  logCliBootstrapSessionInitialized({ logger, bootstrapRuntime });
  // Started and not waited on, so the first frame is never behind a network
  // call. Only for an interactive session: a scripted run has nobody to read a
  // notice, and asking on its behalf would be traffic with no reader.
  if (!options.printMode) {
    void checkForUpdate({
      env: process.env,
      configuredOffline: runtimeContext.runtimeConfig.offline === true,
    }).then((result) => {
      const notice = formatUpdateNotice(result);
      if (notice) renderer.renderLine(`\n${notice}\n`);
    });
  }

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
  if (bootstrapRuntime.writeJsonEvent) {
    sessionRuntime.observeEvents(bootstrapRuntime.writeJsonEvent);
  }

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
    approvalTrustPolicy,
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
    ...(options.themePaths ? { themePaths: options.themePaths } : {}),
    exit: (code?: number) => input.exit(code ?? 0),
  });
}

/**
 * The theme this run renders with, applied before the first frame.
 *
 * Precedence is the user's explicit statement over the saved one: `--use-theme`
 * names the theme for this run, `--theme` adds the files it may be found in, and
 * the configured value applies only when neither was given. Applying after the
 * first frame would be invisible, which is why this runs before any surface
 * exists.
 *
 * Nothing here is fatal. A theme that will not load leaves the default palette
 * in place and says so: a mistyped path must not cost the user their session,
 * and it must not pass in silence either, or the flag looks ignored.
 */
function applyStartupTheme(input: {
  readonly options: CliOptions;
  readonly workspaceRoot: string;
  readonly configured: string | undefined;
  readonly renderer: StreamingRenderer;
}): void {
  const extraPaths = input.options.themePaths ?? [];
  const requested = input.options.useTheme ?? (input.configured === "auto" ? undefined : input.configured);
  if (!requested) return;

  // A named path that contributed nothing is reported before the theme is
  // applied, because the two failures look identical from outside: a mistyped
  // path and a file whose theme name is already taken both end in "the theme I
  // asked for is not what I see".
  for (const entry of extraPaths) {
    if (themeNamesFromPaths([entry]).length === 0) {
      input.renderer.renderLine(
        `Theme path \`${entry}\` holds no readable theme, so nothing was loaded from it.`,
      );
    }
  }

  try {
    applyTheme(requested, input.workspaceRoot, extraPaths);
  } catch (error) {
    input.renderer.renderLine(
      `Could not load theme \`${requested}\`: ${error instanceof Error ? error.message : String(error)}. Using the default. Available: ${listThemes(input.workspaceRoot, extraPaths).join(", ")}.`,
    );
  }
}
