import { createCliShutdown } from "../runtime/shutdown.js";
import { cancelGoalRunForShutdown } from '../runtime/goalScheduling.js';
import { closeCollaborationFor } from '../runtime/collaboration.js';
import { closeSshFor } from '../runtime/ssh.js';
import { installMediaSurface, closeMediaFor } from '../runtime/media.js';
import { closeJobsFor } from '../runtime/jobs.js';
import { closeDirectorFor } from '../runtime/director.js';
import { closeExtensionsFor } from '../runtime/extensions.js';
import { closeTraceDashboard } from '../../observability/traceDashboard.js';
import { runCollaborationServiceMode } from '../collaboration/service.js';
import type { Interface as ReadlineInterface } from "node:readline";

import { ApprovalTrustPolicy } from "../../core/shell/approvalTrustPolicy.js";
import type { InteractiveApprovalResult } from "../interactive/picker/approval.js";
import {
  createComponentLogger,
  createTraceContext,
  setGlobalTraceContext,
} from "../../observability/index.js";
import { parseCliArgs } from "../../entrypoints/cliArgs.js";
import { selectTheme, selectedTheme } from "../../presentation/theme/selection.js";
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
import type { RestartOutcome, RestartPort, RestartRequest } from '../../core/commands/restart/contract.js';

import type { CliProcessRunnerInput } from './contract.js';
import { createProfileContext, currentProfile, withProfile } from '../../core/paths/profile/context.js';
import { configurationAdmission } from '../../core/shell/configuration.js';
import { profileSwitchPort } from './profile/port.js';
import { freshExecutable } from './profile/invocation.js';
import { claimSwitchChild, admitSwitchChild } from './profile/admission.js';
import { drainProfileSwitch } from './profile/handoff.js';
import { runProfileSwitch } from './profile/process.js';
import type { SwitchReceipt, SwitchTicket } from './profile/model.js';
export type { CliProcessRunnerInput } from './contract.js';

export async function runCliProcess(
  input: CliProcessRunnerInput,
): Promise<void> {
  // Explicit service mode has its own authenticated state owner and protocol.
  if (input.args[0] === 'serve') { await runCliCycle(input); return; }
  const parsed = parseCliArgs(input.args, { cwd: input.launchCwd });
  if (!parsed.ok) { input.writeError(parsed.error.message); input.exit(parsed.error.exitCode); }
  if (parsed.args.versionRequested) { input.writeOutput(versionLabel()); return; }
  const handoff = input.process.env?.CHEERS_PROFILE_HANDOFF;
  const profile = createProfileContext({ name: parsed.args.options.profile, ...(handoff !== undefined ? { mode: 'existing' } : {}) });
  const child = claimSwitchChild(profile, input.args, handoff);
  if (child) delete input.process.env.CHEERS_PROFILE_HANDOFF;
  const switchDepth = child?.plan.depth ?? 0;
  input.profileSelected?.(profile);
  return withProfile(profile, async () => {
    let recovery: RestartRequest | undefined;
    for (;;) {
      const request = await runCliCycle({ ...input, args: recovery?.argv ?? input.args,
        launchCwd: recovery?.workingDirectory ?? input.launchCwd }, recovery, recovery ? undefined : child, switchDepth);
      if (!request) return;
      if ('kind' in request) { await runProfileSwitch(request, input); return; }
      recovery = request;
    }
  });
}

async function runCliCycle(input: CliProcessRunnerInput, recovery?: RestartRequest, child?: SwitchReceipt, switchDepth = 0): Promise<RestartRequest | SwitchTicket | undefined> {
  if (await runCollaborationServiceMode(input)) return;
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

  const options: CliOptions = recovery ? { ...parsedCliArgs.args.options, sessionId: recovery.sessionId,
    projectPath: recovery.workspaceRoot, promptArg: undefined, replayFile: undefined, migrateSessionRoot: false }
    : parsedCliArgs.args.options;
  const rootContext = createCliRootContext({
    launchCwd: input.launchCwd,
    options,
  });
  if (child && rootContext.workspaceRoot !== child.plan.workspace.path) throw new Error('Profile handoff workspace changed before bootstrap.');

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
    freshSessionId: child?.targetSessionId,
  });
  time("runtime bootstrapped");
  const {
    sessionManager,
    renderer,
    recoveryCandidate,
    runtimeContext,
  } = bootstrapRuntime;
  if (child) admitSwitchChild(child, runtimeContext.session.id, sessionManager.captureReportWriter(runtimeContext.session.id));
  installMediaSurface(runtimeContext, input.process.stdout, input.process.stderr);
  const providerRuntimeBridge = createCliProviderRuntimeBridge({
    runtimeConfig: () => runtimeContext.runtimeConfig,
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
  runtimeContext.configuration.recordDisplay({ theme: selectedTheme() });
  // Chosen once here for the same reason the theme is: it decides how every
  // frame is built, so reading it later would let the display change between two
  // frames of the same answer.
  setDiagramMode(readDiagramMode(runtimeContext.projectRoot ?? runtimeContext.cwd, runtimeContext.runtimeConfig));
  const resolvedCredential =
    providerRuntimeBridge.resolveCredentialSnapshot();
  const mcpGateway = bootstrapRuntime.mcpGateway;
  let cancelRun: (() => Promise<void>) | undefined;
  let isBusy: (() => boolean) | undefined;
  let requested: RestartRequest | SwitchTicket | undefined;
  const stopSurface = new AbortController();
  const shutdown = createCliShutdown({
    close: async () => {
      const results = await Promise.allSettled([
        Promise.resolve().then(() => cancelRun?.()),
        closeMediaFor(runtimeContext), closeDirectorFor(runtimeContext), closeJobsFor(runtimeContext, Boolean(requested && 'kind' in requested)), closeSshFor(runtimeContext),
        closeCollaborationFor(runtimeContext), closeExtensionsFor(runtimeContext), closeTraceDashboard(), mcpGateway.close(),
        Promise.resolve().then(async () => { if (await runtimeContext.freshState?.clearCache?.() === 'unknown') throw new Error('Provider cache cleanup is unverified.'); }),
      ]);
      const failure = results.find(result => result.status === 'rejected');
      if (failure?.status === 'rejected') throw failure.reason;
    }, process: input.process, exit: input.exit, writeError: input.writeError,
    streams: [input.stdin, input.process.stdout, input.process.stderr],
    handleInterrupt: options.printMode === true || options.jsonEvents === true || !input.stdin.isTTY,
  });
  // These bridges are installed after bootstrap has the real resource owners.
  // Only bootstrap can retire this host and read back a new runtime generation.
  runtimeContext.startupArgs = [...input.args];
  const restart: RestartPort = {
    request: async (request): Promise<RestartOutcome> => {
      if (requested) return { status: 'unavailable', reason: 'A restart is already pending.' };
      if (isBusy?.()) return { status: 'unavailable', reason: 'Wait for the current provider turn before restarting.' };
      if (request.sessionId !== runtimeContext.session.id || !sessionManager.sessionExists(runtimeContext.session.id)
        || request.argv.length !== input.args.length || request.argv.some((arg, index) => arg !== input.args[index])) {
        return { status: 'unavailable', reason: 'Restart identity or startup arguments changed; recovery was not admitted.' };
      }
      const admitted = { ...request, workspaceRoot: runtimeContext.projectRoot, workingDirectory: runtimeContext.cwd };
      requested = admitted;
      // Let command publication finish before retiring the interactive surface.
      setImmediate(() => stopSurface.abort());
      return { status: 'requested', request: admitted };
    },
  };
  runtimeContext.restart = restart;
  const activeProfile = currentProfile();
  if (activeProfile) runtimeContext.profileSwitch = profileSwitchPort({ source: activeProfile,
    depth: switchDepth,
    interactive: Boolean(input.stdin.isTTY && input.process.stdout.isTTY && input.process.stderr.isTTY) && !options.printMode && !options.jsonEvents,
    current: () => ({ sessionId: runtimeContext.session.id,
      generation: JSON.stringify([runtimeContext.session.createdAt, runtimeContext.workspaceRevision, runtimeContext.configuration.current.revision,
        runtimeContext.configuration.current.binding.trustRevision]),
      workspace: runtimeContext.projectRoot, cwd: runtimeContext.cwd, offline: options.offline === true || runtimeContext.runtimeConfig.offline === true }),
    busy: () => isBusy?.() ?? false, pending: () => requested !== undefined,
    admission: () => runtimeContext.workspaceAdmission?.() ?? configurationAdmission(runtimeContext)(),
    executableAvailable: () => { freshExecutable(input.process.execPath, input.process.argv[1]); },
    retire: ticket => { requested = ticket; setImmediate(() => stopSurface.abort()); },
  });

  try {
    const stdinPromptCapture = recovery && (options.printMode || !input.stdin.isTTY) ? {
      stdinTransportMode: 'capture-batch' as const, pipedInput: null, nonInteractivePrompts: [], cliModePlan: { kind: 'stdin-batch' as const },
    } : await captureCliStdinPrompts({
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
    time("startup surface prepared");
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
      mcpGateway,
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
    cancelRun = () => cancelGoalRunForShutdown(sessionRuntime);
    isBusy = () => sessionRuntime.getCurrentRunController() !== null;
    if (bootstrapRuntime.writeJsonEvent) {
      sessionRuntime.observeEvents(bootstrapRuntime.writeJsonEvent);
    }
    if (recovery) {
      const saved = sessionManager.getSession(runtimeContext.session.id);
      if (!saved || saved.id !== recovery.sessionId || saved.projectRoot !== runtimeContext.projectRoot) throw new Error('Restart recovery could not verify the selected saved session.');
      input.writeOutput(`Restart recovery: runtime rebuilt and saved session ${saved.id} read back. Startup prompt and captured input were not replayed.`);
      if (options.printMode || !input.stdin.isTTY) return;
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
      stopRequested: () => requested !== undefined,
    });
    if (handledPrintMode) {
      return requested;
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
      exit: shutdown.exit,
      stopSignal: stopSurface.signal,
    });
    return requested;
  } finally {
    if (requested && 'kind' in requested) await drainProfileSwitch(requested, () => shutdown.close());
    else await shutdown.close();
  }
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
  const requested = input.options.useTheme ?? input.configured;
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
    selectTheme(requested, input.workspaceRoot, extraPaths);
  } catch (error) {
    input.renderer.renderLine(
      `Could not load theme \`${requested}\`: ${error instanceof Error ? error.message : String(error)}. Using the default. Available: ${listThemes(input.workspaceRoot, extraPaths).join(", ")}.`,
    );
  }
}
