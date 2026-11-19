import path from "node:path";
import type { PermissionScope } from "../cli/approval/permissionScope.js";
import type { CliOptions } from "../cli/options/cliOptions.js";
import { resolveCliCredential } from "../cli/provider/cliProviderRuntimeBridge.js";
import { closeCollaborationFor } from "../cli/runtime/collaboration.js";
import { closeDirectorFor } from "../cli/runtime/director.js";
import { captureExtensionRuntimeFor, closeExtensionsFor, extensionHostFor, shutdownExtensionsFor, startExtensionsFor, waitForExtensionsFor } from "../cli/runtime/extensions.js";
import { cancelExtensionUiFor, closeExtensionHost } from "../cli/runtime/extensions/host.js";
import { closeJobsFor } from "../cli/runtime/jobs.js";
import { closeMediaFor } from "../cli/runtime/media.js";
import { closeSshFor } from "../cli/runtime/ssh.js";
import { createCliSessionRuntime } from "../cli/runtime/cliSessionRuntimeFactory.js";
import { getRuntimeConfig, type RuntimeConfig, type RuntimeConfigOverrides, type RuntimeProvider } from "../config/runtimeConfig.js";
import { registerCatalogContribution } from "../core/catalog/contributions.js";
import type { CoreMcpGateway } from "../core/mcp/gateway.js";
import type { QueryEventObserver } from "../core/shell/sessionRuntime.js";
import { ApprovalTrustPolicy } from "../core/shell/approvalTrustPolicy.js";
import { bootstrapShellRuntime } from "../core/shell/bootstrap.js";
import type { CompactionOutcome } from "../core/shell/compaction.js";
import type { ShellRuntimeContext } from "../core/shell/runtimeContext.js";
import type { PromptAttachments, ShellSessionRuntime } from "../core/shell/sessionRuntime.js";
import { createCliMcpGateway } from "../entrypoints/cliMcpModule.js";
import type { ExtensionUiHost } from "../extensions/runtime/ui.js";
import { StreamingRenderer } from "../presentation/terminal/streaming.js";
import type { Session } from "../session/schema/sessionRecord.js";
import { SessionManager } from "../session/SessionManager.js";
import type { ToolDefinition } from "../tools/types.js";
import { getWorkflowGitContext } from "../workflow/gitContext.js";
import { DefaultResourceLoader, type LoadExtensionsResult, type ResourceLoader } from "./resourceLoader.js";
import { SessionUi } from './ui.js';
import { snapshotCustomMessage } from '../core/agent/custom.js';
import { snapshotData } from '../core/values/data.js';
import { sessionModelCatalog, sessionVirtualModels } from '../core/catalog/models.js';
import { parseModelSelection } from '../core/models/virtual/selection.js';
import { setVirtualModel } from '../core/commands/model/virtual.js';
import { readLogicalModel } from '../session/model/logical.js';
import { thinkingSyntax } from '../core/commands/thinking/syntax.js';
import { configurationAdmission } from '../core/shell/configuration.js';
import { setModel } from '../core/commands/model/selection.js';
import { registerSdkExtensions } from './resources/catalog.js';
import { captureSdkToolPolicy, boundedSdkToolPolicy } from './resources/policy.js';
import { SessionResources, type AgentSessionReloadResult } from './resources/reload.js';
import { attachSdkSubmissionQueue } from './resources/submission.js';
export type { AgentSessionReloadResult } from './resources/reload.js';

/**
 * Compose an embedded session from the existing runtime, session, and security owners.
 */

export interface CreateAgentSessionOptions {
  readonly convertToLlm?: import('../core/agent/messages.js').MessageConverter;
  readonly cwd?: string;
  readonly launchCwd?: string;
  readonly runtimeConfig?: RuntimeConfig;
  readonly runtimeConfigOverrides?: RuntimeConfigOverrides;
  readonly provider?: RuntimeProvider;
  readonly model?: string;
  readonly scopedModels?: readonly string[];
  readonly thinkingLevel?: string;
  readonly apiKey?: string;
  /** `"all"` disables all tools; `"builtin"` disables built-ins while keeping custom/extension tools. */
  readonly noTools?: "all" | "builtin";
  readonly tools?: readonly string[];
  readonly excludeTools?: readonly string[];
  readonly customTools?: readonly ToolDefinition[];
  readonly resourceLoader?: ResourceLoader;
  readonly sessionManager?: SessionManager;
  readonly sessionId?: string;
  readonly continueSession?: boolean;
  readonly forkSource?: string;
  readonly offline?: boolean;
  readonly allowUntrustedHooks?: boolean;
  readonly approvalTrustPolicy?: ApprovalTrustPolicy;
  readonly permissionScope?: PermissionScope;
  readonly nonInteractiveApproval?: "deny" | "allow-once" | "allow-always";
  readonly renderer?: StreamingRenderer;
  readonly mcpGateway?: CoreMcpGateway;
  readonly ui?: ExtensionUiHost;
}

export interface CreateAgentSessionResult {
  readonly session: AgentSession;
  readonly extensionsResult: LoadExtensionsResult;
  readonly modelFallbackMessage?: string;
}

function createSilentRenderer(): StreamingRenderer {
  const renderer = new StreamingRenderer();
  renderer.setSink({ line: () => {}, chunk: () => {} }, { ownsTranscript: false });
  return renderer;
}

export class AgentSession {
  private disposed = false;
  private disposal: Promise<void> | undefined;

  constructor(
    readonly runtimeContext: ShellRuntimeContext,
    readonly sessionRuntime: ShellSessionRuntime,
    readonly sessionManager: SessionManager,
    readonly resourceLoader: ResourceLoader,
    private readonly mcpGateway: CoreMcpGateway | undefined,
    private readonly ownsMcpGateway: boolean,
    private readonly contributionCleanups: readonly (() => void)[],
    private readonly retireResources?: () => void,
    private readonly ui: SessionUi = new SessionUi(runtimeContext, extensionHostFor(runtimeContext)),
    private readonly resources?: SessionResources,
    private readonly submissions?: ReturnType<typeof attachSdkSubmissionQueue>,
  ) {}

  bindUi(host: ExtensionUiHost): () => void {
    if (this.disposed) throw new Error('Agent session is disposed.');
    return this.ui.bind(host);
  }

  get sessionId(): string {
    return this.runtimeContext.session.id;
  }

  get workspaceRoot(): string {
    return this.runtimeContext.projectRoot;
  }

  /** Logical models have no credentials; their physical destination is resolved per request. */
  getModelCatalog(): ReturnType<typeof sessionModelCatalog> {
    if (this.disposed) throw new Error('Agent session is disposed.');
    return sessionModelCatalog(this.runtimeContext.cwd, this.sessionId, this.runtimeContext.configuration.current.catalog);
  }

  /** Append application context while idle, using the existing durable history owner. */
  appendCustomMessage(payload: import('../core/agent/custom.js').CustomMessageInput): void {
    if (this.disposed) throw new Error('Agent session is disposed.');
    if (this.sessionRuntime.isRunning()) throw new Error('Wait for the active turn before appending custom history.');
    const saved = snapshotData(payload, { bytes: 32 * 1024 * 1024, nodes: 100_000, depth: 32 });
    const message = snapshotCustomMessage({ ...(saved as object), role: 'custom' });
    this.sessionManager.addTurn(this.sessionId, message);
    const session = this.sessionManager.getSession(this.sessionId);
    if (session) this.runtimeContext.session = session;
  }

  async prompt(
    text: string,
    options?: {
      readonly attachments?: PromptAttachments;
      readonly promptMetadata?: Record<string, unknown>;
    },
  ): Promise<string> {
    if (this.disposed) throw new Error("AgentSession has been disposed.");
    return this.sessionRuntime.executePrompt(this.sessionId, text, {
      outputMode: "print",
      inputSource:'sdk',
      ...(options?.attachments ? { attachments: options.attachments } : {}),
      ...(options?.promptMetadata ? { promptMetadata: options.promptMetadata } : {}),
    });
  }

  steer(text: string): boolean {
    const handle = this.sessionRuntime.input();
    if (!handle) return false;
    handle.steer(text);
    return true;
  }

  followUp(text: string): boolean {
    const handle = this.sessionRuntime.input();
    if (!handle) return false;
    handle.followUp(text);
    return true;
  }

  subscribe(observer: QueryEventObserver, options: { readonly renders?: boolean } = { renders: false }): () => void {
    return this.sessionRuntime.observeEvents(observer, options);
  }

  async abort(): Promise<void> {
    cancelExtensionUiFor(this.runtimeContext);
    await this.sessionRuntime.cancelAndWait();
  }

  async waitForIdle(): Promise<void> {
    await this.sessionRuntime.waitForIdle();
    await this.submissions?.wait();
  }

  /** Reload resources with the current session and durable model selection preserved. */
  reload(options?: { readonly signal?: AbortSignal }): Promise<AgentSessionReloadResult> {
    return this.resources?.reload(options?.signal) ?? Promise.resolve({status:'refused', reason:'Resource reload is unavailable for this session.'});
  }

  async compact(instructions?: string): Promise<CompactionOutcome> {
    if (this.disposed) throw new Error('AgentSession has been disposed.');
    return this.sessionRuntime.compactHistory(this.sessionId, instructions);
  }

  setAgentMode(mode: "plan" | "build"): void {
    this.sessionRuntime.setAgentMode(mode);
  }

  setPermissionScope(scope: PermissionScope): void {
    this.sessionRuntime.setPermissionScope(scope);
  }

  getState(): Session {
    return this.sessionManager.getSession(this.sessionId) ?? this.runtimeContext.session;
  }

  dispose(): Promise<void> {
    if (this.disposal) return this.disposal;
    let settled!: { readonly resolve: () => void; readonly reject: (error: unknown) => void };
    this.disposal = new Promise<void>((resolve, reject) => { settled = { resolve, reject }; });
    void this.disposal.catch(() => {});
    this.disposed = true;
    const extensions = captureExtensionRuntimeFor(this.runtimeContext), host = extensionHostFor(this.runtimeContext);
    const reloading = this.resources?.close();
    this.submissions?.close();
    void (async () => {
      const errors: unknown[] = [];
      try { this.ui.dispose(); } catch (error) { errors.push(error); }
      let shutdown: Promise<void> | undefined;
      try { shutdown = extensions?.shutdown('quit') ?? this.sessionRuntime.cancelAndWait(); } catch (error) { errors.push(error); }
      try { await reloading; } catch (error) { errors.push(error); }
      try { await shutdown; } catch (error) { errors.push(error); }
      try { if (this.resources) this.resources.retire(); else this.retireResources?.(); } catch (error) { errors.push(error); }
      try { if (host) closeExtensionHost(this.runtimeContext, host); } catch (error) { errors.push(error); }
      for (const unregister of this.contributionCleanups) {
        try { unregister(); } catch (error) { errors.push(error); }
      }
      const cleanupResults = await Promise.allSettled([
        Promise.resolve().then(() => closeMediaFor(this.runtimeContext)),
        Promise.resolve().then(() => closeDirectorFor(this.runtimeContext)),
        Promise.resolve().then(() => closeJobsFor(this.runtimeContext, false)),
        Promise.resolve().then(() => closeSshFor(this.runtimeContext)),
        Promise.resolve().then(() => closeCollaborationFor(this.runtimeContext)),
        Promise.resolve().then(() => extensions?.close()),
        Promise.resolve().then(() => this.runtimeContext.freshState?.clearCache?.()),
        ...(this.ownsMcpGateway ? [Promise.resolve().then(() => this.mcpGateway?.close())] : []),
      ]);
      for (const result of cleanupResults) if (result.status === 'rejected') errors.push(result.reason);
      try { this.sessionRuntime.terminate(this.sessionId); } catch (error) { errors.push(error); }
      if (errors.length > 0) throw errors[0];
    })().then(settled.resolve, settled.reject);
    return this.disposal;
  }
}

export async function createAgentSession(
  options: CreateAgentSessionOptions = {},
): Promise<CreateAgentSessionResult> {
  const convertToLlm = options.convertToLlm;
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const sessionManager = options.sessionManager ?? new SessionManager();
  const renderer = options.renderer ?? createSilentRenderer();
  const suppliedLoader = options.resourceLoader;
  const customTools = options.customTools ? [...options.customTools] : undefined;
  const policy = captureSdkToolPolicy({...options, customTools});
  const originalOverrides = {...options.runtimeConfigOverrides,
    ...(options.runtimeConfigOverrides?.allowedTools ? {allowedTools:[...options.runtimeConfigOverrides.allowedTools]} : {})};
  const suppliedTools = options.runtimeConfig?.allowedTools;
  const overrideTools = originalOverrides.allowedTools;
  const explicitTools = suppliedTools === undefined ? overrideTools : overrideTools === undefined ? suppliedTools
    : suppliedTools.filter(name => overrideTools.includes(name));
  const suppliedBudget = options.runtimeConfig?.instructionBudgetBytes;
  let callerOverrides = {...originalOverrides, ...(explicitTools !== undefined ? {allowedTools:[...explicitTools]} : {})};
  const ownsResources = suppliedLoader === undefined;
  const resourceLoader = suppliedLoader ?? new DefaultResourceLoader({ cwd });

  let runtimeContextRef: ShellRuntimeContext | undefined;

  if (ownsResources) {
    await resourceLoader.reload();
  }

  const extensionsResult = resourceLoader.getExtensions();
  const startupModel = parseModelSelection(options.model, extensionsResult.extensions.flatMap(entry => entry.extension.virtualModels ?? []), options.provider);
  let pendingLogical = startupModel.kind === 'virtual';
  const startupThinking = thinkingSyntax.actions.find(action => action.name === options.thinkingLevel
    || action.aliases?.includes(options.thinkingLevel ?? ''))?.effort;
  const bindResources = resourceLoader.captureBinding?.();
  const reloadLease = resourceLoader.captureReload?.();
  const retireUnboundResources = ownsResources ? resourceLoader.captureRetirement?.() : undefined;
  const outerConfig = getRuntimeConfig(cwd, callerOverrides, options.runtimeConfig?.configInputs);
  const configuredTools = outerConfig.allowedTools;
  const contextBudget = {value:originalOverrides.instructionBudgetBytes ?? suppliedBudget ?? outerConfig.instructionBudgetBytes,
    override:originalOverrides.instructionBudgetBytes, disabled:resourceLoader.getNoContextFiles()};
  if (configuredTools !== undefined) callerOverrides = {...callerOverrides,
    allowedTools:explicitTools === undefined ? [...configuredTools] : explicitTools.filter(name => configuredTools.includes(name))};
  const toolPolicy = boundedSdkToolPolicy(policy, extensionsResult, callerOverrides);
  const overrides: RuntimeConfigOverrides = {
    ...originalOverrides,
    ...(resourceLoader.getNoContextFiles() ? { instructionBudgetBytes: 0 } : {}),
    ...(options.offline !== undefined ? { offline: options.offline } : {}),
    ...(options.allowUntrustedHooks !== undefined ? { allowUntrustedHooks: options.allowUntrustedHooks } : {}),
    ...(toolPolicy.allowedTools !== undefined ? { allowedTools: toolPolicy.allowedTools } : {}),
  };

  const baseConfig = options.runtimeConfig
    ? {
        ...options.runtimeConfig,
        ...(overrides.instructionBudgetBytes !== undefined ? { instructionBudgetBytes: overrides.instructionBudgetBytes } : {}),
        ...(overrides.offline !== undefined ? { offline: overrides.offline } : {}),
        ...(overrides.allowUntrustedHooks !== undefined ? { allowUntrustedHooks: overrides.allowUntrustedHooks } : {}),
        ...(overrides.allowedTools !== undefined ? { allowedTools: overrides.allowedTools } : {}),
      }
    : getRuntimeConfig(cwd, overrides);

  const runtimeConfig: RuntimeConfig = toolPolicy.disabledTools?.length
    ? { ...baseConfig, disabledTools: [...new Set([...baseConfig.disabledTools, ...toolPolicy.disabledTools])] }
    : baseConfig;

  const cliOptions: CliOptions = {
    provider: options.provider,
    model: startupModel.kind === 'virtual' ? undefined : options.model,
    scopedModels: options.scopedModels,
    thinking: startupModel.kind === 'virtual' ? undefined : options.thinkingLevel,
    apiKey: options.apiKey,
    noContextFiles: resourceLoader.getNoContextFiles(),
    skillPaths: resourceLoader.getSkillPaths(),
    noSkills: resourceLoader.getNoSkills(),
    themePaths: resourceLoader.getThemePaths(),
    offline: options.offline,
    allowedTools: toolPolicy.allowedTools,
    noTools: options.noTools === "all",
    nonInteractiveApproval: options.nonInteractiveApproval ?? "deny",
    dangerouslyBypassHookTrust: options.allowUntrustedHooks,
  };
  const resolveSdkCredential = (config: RuntimeConfig, sessionId?: string) => resolveCliCredential(config,
    !options.model && readLogicalModel(sessionId) ? { ...cliOptions, thinking: undefined } : cliOptions, process.env, sessionId);

  let bootstrap: ReturnType<typeof bootstrapShellRuntime>;
  try { bootstrap = bootstrapShellRuntime({
    cwd,
    launchCwd: options.launchCwd ?? cwd,
    runtimeConfig,
    runtimeConfigOverrides: overrides,
    deferredModel: () => pendingLogical,
    resolveConfigTarget: resolveSdkCredential,
    skillOptions: {
      ...(resourceLoader.getSkillPaths().length ? { skillPaths: resourceLoader.getSkillPaths() } : {}),
      ...(resourceLoader.getNoSkills() ? { noSkills: true } : {}),
    },
    ...(resourceLoader.getThemePaths().length ? { themePaths: resourceLoader.getThemePaths() } : {}),
    gitContext: getWorkflowGitContext(cwd),
    sessionManager,
    renderer,
    ...(options.sessionId ? { requestedSessionId: options.sessionId } : {}),
    ...(options.forkSource ? { forkSource: options.forkSource } : {}),
    adoptCurrentSession: options.continueSession === true,
    emitLifecycleMessages: false,
  }); } catch (error) {
    try { retireUnboundResources?.(); } catch { /* Keep the bootstrap failure. */ }
    throw error;
  }

  const runtimeContext = bootstrap.context;
  if (convertToLlm) Object.defineProperty(runtimeContext, 'convertToLlm', { value: convertToLlm, enumerable: true });
  runtimeContextRef = runtimeContext;
  if (options.scopedModels?.length) runtimeContext.scopedModels = options.scopedModels;
  const sysPrompt = resourceLoader.getSystemPrompt();
  if (sysPrompt !== undefined) runtimeContext.systemPrompt = sysPrompt;
  const appendPrompts = resourceLoader.getAppendSystemPrompt();
  if (appendPrompts.length > 0) runtimeContext.appendSystemPrompt = appendPrompts;
  const loadedSkills = resourceLoader.getSkills().skills;
  if (loadedSkills.length > 0 || !ownsResources) {
    runtimeContext.sdkSkills = new Map(loadedSkills.map((s) => [s.name, s]));
  }

  const ownsMcpGateway = options.mcpGateway === undefined;
  const mcpGateway = options.mcpGateway ?? createCliMcpGateway(() => runtimeContext.cwd);
  const cleanups: Array<() => void> = [];

  let sessionRuntime: ShellSessionRuntime | undefined;
  let session: AgentSession | undefined;
  let retireResources: (() => void) | undefined;
  let sessionUi: SessionUi | undefined;
  let resources: SessionResources | undefined;
  let resourceCleanups: Array<() => void> = [];
  let submissions: ReturnType<typeof attachSdkSubmissionQueue> | undefined;
  const approvalTrustPolicy = options.approvalTrustPolicy ?? new ApprovalTrustPolicy();
  const providerRuntimeBridge = {
    resolveCredentialSnapshot: () => resolveSdkCredential(runtimeContext.runtimeConfig, runtimeContext.session.id),
    providerModeEnv: () => process.env.CHEERS_PROVIDER_MODE,
    realProviderSmokeOptIn: () => process.env.CHEERS_REAL_PROVIDER_SMOKE?.trim() === "1",
  };
  try {
    if (customTools?.length) cleanups.push(registerCatalogContribution({root:runtimeContext.cwd, sessionId:runtimeContext.session.id,
      commands:[], tools:customTools, skills:() => []}));
    resourceCleanups = registerSdkExtensions(runtimeContext.cwd, runtimeContext.session.id, extensionsResult,
      () => extensionHostFor(runtimeContext)?.ui, runtimeContext.configuration.current.catalog);
    const startupDefinition = startupModel.kind === 'virtual' ? sessionVirtualModels(runtimeContext.cwd, runtimeContext.session.id)
      .find(model => model.provider === startupModel.virtualModel.provider && model.id === startupModel.virtualModel.model) : undefined;
    sessionRuntime = createCliSessionRuntime({
      sessionManager,
      mcpGateway,
      renderer,
      runtimeContext,
      options: cliOptions,
      approvalTrustPolicy,
      providerRuntimeBridge,
      getReadline: () => null,
      isStdinTty: () => false,
    });
    runtimeContext.sessionChange = async () => ({ status: 'refused', reason: 'Create a new AgentSession to replace SDK-owned resources.' });
    await waitForExtensionsFor(runtimeContext);
    const host = extensionHostFor(runtimeContext);
    sessionUi = new SessionUi(runtimeContext, host);
    if (host) {
      const release = bindResources ? bindResources(host) : resourceLoader.setHost?.(host);
      retireResources = typeof release === 'function' ? release : resourceLoader.captureRetirement?.();
    }
    resourceLoader.setDenyRules?.(() => runtimeContextRef?.runtimeConfig.denyRules ?? runtimeConfig.denyRules);
    if (startupModel.kind === 'virtual') {
      if (!startupDefinition || !sessionVirtualModels(runtimeContext.cwd, runtimeContext.session.id).includes(startupDefinition)) {
        throw new Error('Virtual startup model registration changed during initialization.');
      }
      const selected = { ...startupModel.virtualModel, ...(startupThinking !== undefined ? { thinkingEffort: startupThinking } : {}) };
      const output = await setVirtualModel(selected, { cwd: runtimeContext.cwd, projectRoot: runtimeContext.projectRoot,
        sessionId: runtimeContext.session.id, runtimeConfig: runtimeContext.runtimeConfig,
        readConfiguration: () => runtimeContext.configuration.current, resolveConfigTarget: runtimeContext.resolveConfigTarget,
        admission: configurationAdmission(runtimeContext), logicalModelAdmission: configurationAdmission(runtimeContext, { deferredModel: true }) }, { definition: startupDefinition });
      if (!output.startsWith('Model switched to ') && !output.startsWith('Model preference saved for ')) throw new Error(output);
      pendingLogical = false;
    } else if (options.model && readLogicalModel(runtimeContext.session.id)) {
      const output = await setModel([startupModel.model ?? options.model], { cwd: runtimeContext.cwd, projectRoot: runtimeContext.projectRoot,
        sessionId: runtimeContext.session.id, runtimeConfig: runtimeContext.runtimeConfig,
        readConfiguration: () => runtimeContext.configuration.current, resolveConfigTarget: runtimeContext.resolveConfigTarget,
        admission: configurationAdmission(runtimeContext), logicalModelAdmission: configurationAdmission(runtimeContext, { deferredModel: true }) }, false, startupThinking ?? startupModel.thinkingEffort);
      if (!output.startsWith('Model switched to ') && !output.startsWith('Model preference saved for ')) throw new Error(output);
    } else if (!options.model && startupThinking !== undefined) {
      const logical = readLogicalModel(runtimeContext.session.id);
      if (logical) {
        const output = await setVirtualModel({ ...logical, thinkingEffort: startupThinking }, {
          cwd: runtimeContext.cwd, projectRoot: runtimeContext.projectRoot, sessionId: runtimeContext.session.id,
          runtimeConfig: runtimeContext.runtimeConfig, readConfiguration: () => runtimeContext.configuration.current,
          resolveConfigTarget: runtimeContext.resolveConfigTarget, admission: configurationAdmission(runtimeContext),
          logicalModelAdmission: configurationAdmission(runtimeContext, { deferredModel: true }),
        });
        if (!output.startsWith('Model switched to ') && !output.startsWith('Model preference saved for ')) throw new Error(output);
      }
    }
    if (options.ui) sessionUi.bind(options.ui);

    if (options.permissionScope) sessionRuntime.setPermissionScope(options.permissionScope);

    const credential = providerRuntimeBridge.resolveCredentialSnapshot();
    const modelFallbackMessage = !readLogicalModel(runtimeContext.session.id) && credential.blocked
      ? `Provider credential status: ${credential.blocked}${credential.provider ? ` (${credential.provider})` : ""}`
      : undefined;

    resources = new SessionResources({context:runtimeContext, runtime:sessionRuntime, loader:resourceLoader, cleanups:resourceCleanups,
      retirement:retireResources, lease:reloadLease, ui:sessionUi, policy, callerOverrides, contextBudget});
    submissions = attachSdkSubmissionQueue(runtimeContext, sessionRuntime);
    session = new AgentSession(
      runtimeContext,
      sessionRuntime,
      sessionManager,
      resourceLoader,
      mcpGateway,
      ownsMcpGateway,
      cleanups,
      retireResources,
      sessionUi,
      resources,
      submissions,
    );
    await startExtensionsFor(runtimeContext);

    return {
      session,
      extensionsResult,
      ...(modelFallbackMessage ? { modelFallbackMessage } : {}),
    };
  } catch (error) {
    if (session) {
      await session.dispose().catch(() => {});
      throw error;
    }
    try { sessionUi?.dispose(); } catch { /* Keep the initialization failure. */ }
    submissions?.close();
    try { await shutdownExtensionsFor(runtimeContext, 'quit', () => sessionRuntime?.cancelAndWait() ?? Promise.resolve()); }
    catch { /* Keep the initialization failure. */ }
    try { retireResources?.(); } catch { /* Keep the initialization failure. */ }
    if (!retireResources) {
      try { retireUnboundResources?.(); } catch { /* Keep the initialization failure. */ }
    }
    try { closeExtensionHost(runtimeContext); } catch { /* Keep the initialization failure. */ }
    await closeExtensionsFor(runtimeContext).catch(() => {});
    for (const unregister of cleanups.splice(0)) {
      try { unregister(); } catch { /* Keep cleaning up after the initialization failure. */ }
    }
    for (const unregister of resourceCleanups.splice(0)) {
      try { unregister(); } catch { /* Keep cleaning up after the initialization failure. */ }
    }
    if (ownsMcpGateway) await mcpGateway.close().catch(() => {});
    try { sessionRuntime?.terminate(runtimeContext.session.id); } catch { /* Keep the initialization failure. */ }
    throw error;
  }
}
