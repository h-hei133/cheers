import type { CoreMcpGateway } from "../../core/mcp/gateway.js";
import { configurationAdmission, initialConfiguration } from '../../core/shell/configuration.js';
import { getRuntimeConfig, type RuntimeConfigOverrides } from "../../config/runtimeConfig.js";
import { createConfigInputs } from '../../config/inputs/selection.js';
import type { ConfigInputs } from '../../config/inputs/model.js';
import type {
  ShellBootstrapResult,
} from "../../core/shell/bootstrap.js";
import {
  bootstrapShellRuntime,
  prepareShellStartup,
} from "../../core/shell/bootstrap.js";
import type { ShellRuntimeContext } from "../../core/shell/runtimeContext.js";
import { StreamingRenderer } from "../../presentation/terminal/streaming.js";
import { createJsonEventWriter } from "../../presentation/terminal/jsonEvents.js";
import { takeOverStdout, type StdoutGuard } from "../../core/shell/outputGuard.js";
import type { StructuredLogger } from "../../observability/index.js";
import { SessionManager } from "../../session/SessionManager.js";
import { sessionWorkspaceAdmission } from '../../session/continuation/workspace.js';
import { currentProfile } from '../../core/paths/profile/context.js';
import { assertSourceAccess } from '../../core/query/sourcePolicy.js';
import { createCoreToolRegistry } from '../../core/tools/registry.js';
import { filterVisibleToolNames } from '../../core/tools/prefilter.js';
import { createCommandRegistry } from '../../core/commands/registry.js';
import { sameValue } from '../../config/values.js';
import type { CliExtensionArguments } from '../options/extensions.js';
import { prepareExtensionFiles, type PreparedExtensionFiles } from '../runtime/extensions/files.js';
import { getWorkflowGitContext } from "../../core/workspace/git.js";
import type { CliOptions } from "../options/cliOptions.js";
import { resolveCliCredential } from '../provider/cliProviderRuntimeBridge.js';
import {
  createCliMcpGateway,
} from "../../entrypoints/cliMcpModule.js";
import {
  resolveTargetProjectRoot,
} from "../../entrypoints/cliWorkspaceModule.js";
import {
  handleCliBootstrapError,
} from "../errors/cliBootstrapErrorBoundary.js";

export interface CliRootContext {
  readonly runtimeBaseDir: string;
  readonly gitContext: ReturnType<typeof getWorkflowGitContext>;
  readonly workspaceRoot: string;
  readonly runtimeConfig: ReturnType<typeof getRuntimeConfig>;
}

export interface CliBootstrapRuntimeContext extends CliRootContext {
  readonly settleModel: () => void;
  readonly sessionManager: SessionManager;
  readonly renderer: StreamingRenderer;
  readonly writeJsonEvent?: ReturnType<typeof createJsonEventWriter>;
  readonly recoveryCandidate: ReturnType<
    SessionManager["getSuggestedRecoverySession"]
  >;
  readonly recoveryCandidateSummary: ReturnType<
    SessionManager["describeSessionReentry"]
  > | null;
  readonly recoveryBlockedNotice: ReturnType<
    SessionManager["getRecoveryTrustBoundaryBlock"]
  >;
  readonly bootstrap: ShellBootstrapResult;
  readonly runtimeContext: ShellRuntimeContext;
  readonly mcpGateway: CoreMcpGateway;
}

export interface CreateCliRootContextInput {
  readonly launchCwd: string;
  readonly options: CliOptions;
  readonly configInputs?: ConfigInputs;
  readonly writeError: (message: string) => void;
  readonly exit: (code: number) => never;
}

export function createCliRootContext(
  input: CreateCliRootContextInput,
): CliRootContext {
  const runtimeBaseDir = resolveTargetProjectRoot(
    input.launchCwd,
    input.options.projectPath,
    input,
  );
  const gitContext = getWorkflowGitContext(runtimeBaseDir);
  const workspaceRoot = gitContext.root ?? runtimeBaseDir;
  const inputs = input.configInputs ?? (input.options.configPaths?.length
    ? createConfigInputs(input.options.configPaths.map(file => ({ path: file, source: 'user' })), input.launchCwd) : undefined);
  const runtimeConfig = getRuntimeConfig(workspaceRoot, configOverrides(input.options), inputs);
  return {
    runtimeBaseDir,
    gitContext,
    workspaceRoot,
    runtimeConfig,
  };
}

export interface CreateCliBootstrapRuntimeContextInput {
  readonly output?: StdoutGuard;
  readonly freshSessionId?: string;
  readonly launchCwd: string;
  readonly options: CliOptions;
  readonly rootContext: CliRootContext;
  readonly writeError: (message: string) => void;
  readonly exit: (code: number) => never;
}

export function createCliBootstrapRuntimeContext(
  input: CreateCliBootstrapRuntimeContextInput,
): CliBootstrapRuntimeContext {
  const resources = bootstrapResources(input);
  try { return resources.finish(bootstrapShellRuntime(resources.shell)); }
  catch (error) { return resources.fail(error); }
}

export async function prepareCliBootstrapRuntimeContext(input: CreateCliBootstrapRuntimeContextInput, argumentsFor: CliExtensionArguments): Promise<{
  readonly runtime: CliBootstrapRuntimeContext; readonly extensions: PreparedExtensionFiles;
}> {
  const resources = bootstrapResources(input);
  let extensions: PreparedExtensionFiles | undefined;
  try {
    const startup = prepareShellStartup(resources.shell);
    const binding = startup.binding;
    const settings = { projectRoot: binding.projectRoot, cwd: binding.projectRoot,
      session: { id: binding.sessionId }, profile: currentProfile(),
      runtimeConfig: resources.shell.runtimeConfig, runtimeConfigOverrides: resources.shell.runtimeConfigOverrides,
      resolveConfigTarget: resources.shell.resolveConfigTarget, deferredModel: resources.shell.deferredModel };
    const configuration = initialConfiguration(settings);
    const admission = configurationAdmission({ ...settings, configuration });
    const check = () => { binding.assertCurrent(); const refused = admission(); if (refused) throw new Error(refused); };
    const denyRules = () => { check(); return configuration.current.config.denyRules; };
    const allTools = () => { check(); return [...createCoreToolRegistry().keys()]; };
    extensions = await prepareExtensionFiles({ paths: input.options.extensionPaths ?? [],
      root: binding.projectRoot, baseDir: input.launchCwd, cliArguments: argumentsFor,
      assertEntryAccess: absolute => assertSourceAccess(absolute, binding.projectRoot, binding.workspaceRoots, 'ask', denyRules()),
      denyRules, inspect: {
        getAllTools: allTools,
        getActiveTools: () => filterVisibleToolNames(allTools(), configuration.current.config),
        getCommands: () => { check(); return [...createCommandRegistry(binding.projectRoot, configuration.current.config).keys()]; },
      } });
    check();
    extensions.check();
    const runtime = resources.finish(startup.activate());
    if (runtime.runtimeContext.cwd !== binding.projectRoot || runtime.runtimeContext.session.id !== binding.sessionId
      || !sameValue(runtime.runtimeContext.session.workspaceRoots ?? [], binding.workspaceRoots ?? [])) {
      throw new Error('The startup workspace changed before extension publication.');
    }
    return { runtime, extensions };
  } catch (error) {
    extensions?.retire();
    return resources.fail(error);
  }
}

function bootstrapResources(input: CreateCliBootstrapRuntimeContextInput) {
  const output = input.output ?? (input.options.printMode || input.options.jsonEvents || input.options.rpcMode
    ? takeOverStdout() : undefined);
  try {
    const sessionManager = new SessionManager();
    const renderer = new StreamingRenderer();
    const writeJsonEvent = input.options.jsonEvents && output
      ? createJsonEventWriter(output.write)
      : undefined;
    if (writeJsonEvent && output) {
      renderer.setSink({
        line: (text, report) => writeJsonEvent({ type: "cli.output", text: `${text}\n`, ...(report ? { report } : {}) }),
        chunk: (text) => writeJsonEvent({ type: "cli.output", text }),
        flush: output.flush,
      });
    } else if (input.options.rpcMode && output) {
      renderer.setSink({
        line: (text, report) => output.write(`${JSON.stringify({ type: "cli.output", text: `${text}\n`, ...(report ? { report } : {}) })}\n`),
        chunk: (text) => output.write(`${JSON.stringify({ type: "cli.output", text })}\n`),
        flush: output.flush,
      });
    } else if (output) {
      renderer.setSink({
        line: text => output.write(`${text}\n`),
        chunk: output.write,
        flush: output.flush,
      }, { ownsTranscript: false });
    }
    // Recovery suggestions are discovered after the first frame. The interactive
    // and print paths retain their explicit on-demand resolution semantics.
    const recoveryCandidate = null;
    const recoveryCandidateSummary = null;
    const recoveryBlockedNotice = null;
    let pendingModel = Boolean(input.options.model);
    const shell: Parameters<typeof bootstrapShellRuntime>[0] = {
      cwd: input.rootContext.workspaceRoot,
      launchCwd: input.launchCwd,
      runtimeConfig: input.rootContext.runtimeConfig,
      runtimeConfigOverrides: configOverrides(input.options),
      resolveConfigTarget: (config, sessionId) => resolveCliCredential(config, input.options, process.env, sessionId),
      deferredModel: () => pendingModel,
      ...(input.options.skillPaths || input.options.noSkills ? {
        skillOptions: {
          ...(input.options.skillPaths ? { skillPaths: input.options.skillPaths } : {}),
          ...(input.options.noSkills ? { noSkills: true } : {}),
        },
      } : {}),
      ...(input.options.themePaths ? { themePaths: input.options.themePaths } : {}),
      gitContext: input.rootContext.gitContext,
      requestedWorkspaceRoot: input.rootContext.runtimeBaseDir,
      sessionManager,
      renderer,
      requestedSessionId: input.options.sessionId,
      freshSessionId: input.freshSessionId,
      allowSessionRootMigration: input.options.migrateSessionRoot === true,
      emitLifecycleMessages: false,
      adoptCurrentSession: input.options.printMode === true || input.options.continueSession === true,
      ...(input.options.forkSource ? { forkSource: input.options.forkSource } : {}),
    };
    const fail = (error: unknown): never => {
      try { return handleCliBootstrapError({ error, renderer, writeError: input.writeError, exit: input.exit }); }
      finally { if (!input.output) output?.restore(); }
    };
    const finish = (bootstrap: ShellBootstrapResult): CliBootstrapRuntimeContext => {
      const runtimeContext = bootstrap.context;
      if (input.options.scopedModels?.length) runtimeContext.scopedModels = input.options.scopedModels;
      if (input.options.extensionPaths?.length) runtimeContext.cliExtensionPaths = input.options.extensionPaths;
      runtimeContext.workspaceAdmission = () => sessionWorkspaceAdmission(sessionManager, runtimeContext.session);
      const mcpGateway = createCliMcpGateway(() => runtimeContext.cwd, () => configurationAdmission(runtimeContext));

      return {
        ...input.rootContext,
        sessionManager,
        renderer,
        ...(writeJsonEvent ? { writeJsonEvent } : {}),
        recoveryCandidate,
        recoveryCandidateSummary,
        recoveryBlockedNotice,
        bootstrap,
        runtimeContext,
        mcpGateway,
        settleModel: () => { pendingModel = false; },
      };
    };
    return { shell, finish, fail };
  } catch (error) {
    if (!input.output) output?.restore();
    throw error;
  }
}

export interface LogCliBootstrapSessionInitializedInput {
  readonly logger: StructuredLogger;
  readonly bootstrapRuntime: CliBootstrapRuntimeContext;
}

export function logCliBootstrapSessionInitialized(
  input: LogCliBootstrapSessionInitializedInput,
): void {
  input.logger.info("CLI session initialized", {
    sessionId: input.bootstrapRuntime.runtimeContext.session.id,
    phases: input.bootstrapRuntime.bootstrap.phases.join(" -> "),
  });
}

function configOverrides(options: CliOptions): RuntimeConfigOverrides {
  return {
    theme: options.useTheme,
    // Zero is the loader's opt-out, so the flag needs no separate path through
    // the prompt builder.
    instructionBudgetBytes: options.noContextFiles ? 0 : undefined,
    allowUntrustedHooks: options.dangerouslyBypassHookTrust === true ? true : undefined,
    // The flag wins over the file, and only when it was given: `undefined`
    // leaves the configured value in place.
    offline: options.offline === true ? true : undefined,
    // `--no-tools` explicitly passes an empty array to disable all built-in tools;
    // an absent flag keeps `undefined` so the default tool pool stays intact.
    allowedTools: options.noTools ? [] : options.allowedTools,
  };
}
