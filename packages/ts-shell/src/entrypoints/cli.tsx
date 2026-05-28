#!/usr/bin/env node
import process from "node:process";
import {
  createCliBootstrapRuntimeContext,
  createCliRootContext,
  logCliBootstrapSessionInitialized,
} from "../cli/bootstrap/cliBootstrapContext.js";
import {
  projectAndRenderCliStartupSurface,
} from "../cli/bootstrap/cliStartupSurface.js";
import {
  renderProjectedLines,
} from "../cli/output/projectedLineRenderer.js";
import {
  runCliPrintModeRouter,
} from "../cli/print/printModeRouter.js";
import {
  captureCliStdinPrompts,
} from "../cli/print/stdinPromptCapture.js";
import {
  createCliApprovalModeState,
} from "../cli/approval/cliApprovalModeState.js";
import {
  createCliProviderRuntimeBridge,
} from "../cli/provider/cliProviderRuntimeBridge.js";
import {
  createCliSessionRuntime,
} from "../cli/runtime/cliSessionRuntimeFactory.js";
import {
  runInteractiveLoop,
} from "../cli/interactive/interactiveLoop.js";
import { ApprovalTrustPolicy } from "../core/shell/approvalTrustPolicy.js";
import {
  createComponentLogger,
  createTraceContext,
  setGlobalTraceContext,
} from "../observability/index.js";
import { parseCliArgs, type CliOptions } from "./cliArgs.js";
import { printCliDoctor } from "./cliDoctor.js";

async function main(): Promise<void> {
  setGlobalTraceContext(createTraceContext());
  const logger = createComponentLogger("cli");
  const args = process.argv.slice(2);
  const launchCwd = process.cwd();
  const approvalTrustPolicy = new ApprovalTrustPolicy();
  const approvalModeState = createCliApprovalModeState();

  const parsedCliArgs = parseCliArgs(args, { cwd: launchCwd });
  if (parsedCliArgs.ok === false) {
    console.error(parsedCliArgs.error.message);
    process.exit(parsedCliArgs.error.exitCode);
  }
  if (parsedCliArgs.args.versionRequested) {
    console.log("0.1.0 (ts-shell MVP)");
    return;
  }

  const options: CliOptions = parsedCliArgs.args.options;

  const rootContext = createCliRootContext({ launchCwd, options });

  if (parsedCliArgs.args.doctorRequested) {
    printCliDoctor(rootContext.workspaceRoot, launchCwd);
    return;
  }

  const bootstrapRuntime = createCliBootstrapRuntimeContext({
    launchCwd,
    options,
    rootContext,
    writeError: console.error,
    exit: process.exit,
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
    stdin: process.stdin,
  });
  projectAndRenderCliStartupSurface({
    options,
    cliModePlan: stdinPromptCapture.cliModePlan,
    stdinTransportMode: stdinPromptCapture.stdinTransportMode,
    nonInteractivePromptCount:
      stdinPromptCapture.nonInteractivePrompts.length,
    launchCwd,
    bootstrapRuntime,
    providerCredentialResolution: resolvedCredential,
    providerModeEnv: providerRuntimeBridge.providerModeEnv(),
  });
  logCliBootstrapSessionInitialized({ logger, bootstrapRuntime });

  let rl: import("node:readline").Interface | null = null;

  const sessionRuntime = createCliSessionRuntime({
    sessionManager,
    renderer,
    runtimeContext,
    options,
    approvalTrustPolicy,
    approvalModeState,
    providerRuntimeBridge,
    getReadline: () => rl,
    isStdinTty: () => Boolean(process.stdin.isTTY),
  });

  const handledPrintMode = await runCliPrintModeRouter({
    cliModePlan: stdinPromptCapture.cliModePlan,
    options,
    nonInteractivePrompts: stdinPromptCapture.nonInteractivePrompts,
    pipedInput: stdinPromptCapture.pipedInput,
    bootstrapRuntime,
    sessionRuntime,
    logger,
    writeError: console.error,
    exit: process.exit,
    setActiveNonInteractiveApprovalMode: (mode) => {
      approvalModeState.set(mode);
    },
  });
  if (handledPrintMode) {
    return;
  }

  await runInteractiveLoop({
    sessionManager,
    renderer,
    runtimeContext,
    sessionRuntime,
    logger,
    approvalTrustPolicy,
    fallbackSessionId: recoveryCandidate?.id,
    initialMcpGateway: mcpGateway,
    setReadline: (readline) => {
      rl = readline;
    },
    setActiveNonInteractiveApprovalMode: (mode) => {
      approvalModeState.set(mode);
    },
  });
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
