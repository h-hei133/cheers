import path from "node:path";
import type { PermissionScope } from "../cli/approval/permissionScope.js";
import type { CliOptions } from "../cli/options/cliOptions.js";
import { resolveCliCredential } from "../cli/provider/cliProviderRuntimeBridge.js";
import { closeCollaborationFor } from "../cli/runtime/collaboration.js";
import { closeDirectorFor } from "../cli/runtime/director.js";
import { bindExtensionUiFor, closeExtensionsFor, extensionHostFor, waitForExtensionsFor } from "../cli/runtime/extensions.js";
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
import { runExtensionInvocation } from "../extensions/runtime/context.js";
import { StreamingRenderer } from "../presentation/terminal/streaming.js";
import type { Session } from "../session/schema/sessionRecord.js";
import { SessionManager } from "../session/SessionManager.js";
import type { ToolDefinition } from "../tools/types.js";
import { getWorkflowGitContext } from "../workflow/gitContext.js";
import { DefaultResourceLoader, type LoadExtensionsResult, type ResourceLoader } from "./resourceLoader.js";
import { snapshotCustomMessage } from '../core/agent/custom.js';
import { snapshotData } from '../core/values/data.js';

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

function resolveSdkToolPolicy(
  options: CreateAgentSessionOptions,
  extensionsResult: LoadExtensionsResult,
): { readonly allowedTools?: readonly string[]; readonly disabledTools?: readonly string[] } {
  const extraNames = [
    ...(options.customTools ?? []).map((t) => t.name),
    ...extensionsResult.extensions.flatMap((entry) => entry.extension.tools.map((t) => t.name)),
  ];
  const excluded = new Set(options.excludeTools ?? []);

  if (options.noTools === "all") return { allowedTools: [] };
  if (options.noTools === "builtin") {
    return { allowedTools: extraNames.filter((name) => !excluded.has(name)) };
  }
  if (options.tools) {
    return { allowedTools: options.tools.filter((name) => !excluded.has(name)) };
  }
  if (excluded.size > 0) {
    return { disabledTools: [...excluded] };
  }
  return {};
}

function registerSdkContributions(
  root: string,
  sessionId: string,
  extensionsResult: LoadExtensionsResult,
  customTools: readonly ToolDefinition[] | undefined,
  ui: () => ExtensionUiHost | undefined,
): Array<() => void> {
  const cleanups: Array<() => void> = [];
  try {
    if (customTools?.length) {
      cleanups.push(
        registerCatalogContribution({
          root,
          sessionId,
          commands: [],
          tools: customTools,
          skills: () => [],
        }),
      );
    }
    for (const loaded of extensionsResult.extensions) {
      const ext = loaded.extension;
      const onEvent = ext.handlers.size > 0
        ? async (event: string, payload: unknown, aliases?: readonly string[], signal?: AbortSignal) => runExtensionInvocation(ui(), signal, async () => {
            let current = payload;
            let matched = false;
            for (const name of [event, ...(aliases ?? [])]) {
              for (const handler of ext.handlers.get(name) ?? []) {
                matched = true;
                const next = await handler(current);
                if (next !== undefined) current = next;
              }
            }
            return matched ? current : undefined;
          })
        : undefined;
      cleanups.push(
        registerCatalogContribution({
          root,
          sessionId,
          commands: ext.commands,
          tools: ext.tools,
          skills: () => [],
          ...(onEvent ? { onEvent } : {}),
        }),
      );
    }
    return cleanups;
  } catch (error) {
    cleanups.splice(0).forEach((unregister) => unregister());
    throw error;
  }
}

export class AgentSession {
  private disposed = false;

  constructor(
    readonly runtimeContext: ShellRuntimeContext,
    readonly sessionRuntime: ShellSessionRuntime,
    readonly sessionManager: SessionManager,
    readonly resourceLoader: ResourceLoader,
    private readonly mcpGateway: CoreMcpGateway | undefined,
    private readonly ownsMcpGateway: boolean,
    private readonly contributionCleanups: readonly (() => void)[],
  ) {}

  bindUi(host: ExtensionUiHost): () => void {
    if (this.disposed) throw new Error('Agent session is disposed.');
    return bindExtensionUiFor(this.runtimeContext, host);
  }

  get sessionId(): string {
    return this.runtimeContext.session.id;
  }

  get workspaceRoot(): string {
    return this.runtimeContext.projectRoot;
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
  }

  async compact(instructions?: string): Promise<CompactionOutcome> {
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

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    closeExtensionHost(this.runtimeContext);
    await this.sessionRuntime.cancelAndWait();
    for (const unregister of this.contributionCleanups) unregister();
    await Promise.allSettled([
      closeMediaFor(this.runtimeContext),
      closeDirectorFor(this.runtimeContext),
      closeJobsFor(this.runtimeContext, false),
      closeSshFor(this.runtimeContext),
      closeCollaborationFor(this.runtimeContext),
      closeExtensionsFor(this.runtimeContext),
      Promise.resolve().then(() => this.runtimeContext.freshState?.clearCache?.()),
      ...(this.ownsMcpGateway ? [Promise.resolve().then(() => this.mcpGateway?.close())] : []),
    ]);
    this.sessionRuntime.terminate(this.sessionId);
  }
}

export async function createAgentSession(
  options: CreateAgentSessionOptions = {},
): Promise<CreateAgentSessionResult> {
  const convertToLlm = options.convertToLlm;
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const sessionManager = options.sessionManager ?? new SessionManager();
  const renderer = options.renderer ?? createSilentRenderer();
  const resourceLoader = options.resourceLoader ?? new DefaultResourceLoader({ cwd });

  let runtimeContextRef: ShellRuntimeContext | undefined;

  if (!options.resourceLoader) {
    await resourceLoader.reload();
  }

  const extensionsResult = resourceLoader.getExtensions();
  const toolPolicy = resolveSdkToolPolicy(options, extensionsResult);
  const overrides: RuntimeConfigOverrides = {
    ...options.runtimeConfigOverrides,
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

  resourceLoader.setDenyRules?.(() => runtimeContextRef?.runtimeConfig.denyRules ?? runtimeConfig.denyRules);

  const cliOptions: CliOptions = {
    provider: options.provider,
    model: options.model,
    scopedModels: options.scopedModels,
    thinking: options.thinkingLevel,
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

  const bootstrap = bootstrapShellRuntime({
    cwd,
    launchCwd: options.launchCwd ?? cwd,
    runtimeConfig,
    runtimeConfigOverrides: overrides,
    resolveConfigTarget: (cfg, sid) => resolveCliCredential(cfg, cliOptions, process.env, sid),
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
  });

  const runtimeContext = bootstrap.context;
  if (convertToLlm) Object.defineProperty(runtimeContext, 'convertToLlm', { value: convertToLlm, enumerable: true });
  runtimeContextRef = runtimeContext;
  if (options.scopedModels?.length) runtimeContext.scopedModels = options.scopedModels;
  const sysPrompt = resourceLoader.getSystemPrompt();
  if (sysPrompt !== undefined) runtimeContext.systemPrompt = sysPrompt;
  const appendPrompts = resourceLoader.getAppendSystemPrompt();
  if (appendPrompts.length > 0) runtimeContext.appendSystemPrompt = appendPrompts;
  const loadedSkills = resourceLoader.getSkills().skills;
  if (loadedSkills.length > 0 || options.resourceLoader) {
    runtimeContext.sdkSkills = new Map(loadedSkills.map((s) => [s.name, s]));
  }

  const ownsMcpGateway = options.mcpGateway === undefined;
  const mcpGateway = options.mcpGateway ?? createCliMcpGateway(() => runtimeContext.cwd);
  const cleanups = registerSdkContributions(
    runtimeContext.cwd,
    runtimeContext.session.id,
    extensionsResult,
    options.customTools,
    () => extensionHostFor(runtimeContext)?.ui,
  );

  let sessionRuntime: ShellSessionRuntime;
  const approvalTrustPolicy = options.approvalTrustPolicy ?? new ApprovalTrustPolicy();
  const providerRuntimeBridge = {
    resolveCredentialSnapshot: () => resolveCliCredential(runtimeContext.runtimeConfig, cliOptions, process.env, runtimeContext.session.id),
    providerModeEnv: () => process.env.CHEERS_PROVIDER_MODE,
    realProviderSmokeOptIn: () => process.env.CHEERS_REAL_PROVIDER_SMOKE?.trim() === "1",
  };
  try {
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
    await waitForExtensionsFor(runtimeContext);
    const host = extensionHostFor(runtimeContext);
    if (host) resourceLoader.setHost?.(host);
    if (options.ui) bindExtensionUiFor(runtimeContext, options.ui);
  } catch (error) {
    await closeExtensionsFor(runtimeContext).catch(() => {});
    cleanups.splice(0).forEach((unregister) => unregister());
    if (ownsMcpGateway) await mcpGateway.close().catch(() => {});
    throw error;
  }

  if (options.permissionScope) {
    sessionRuntime.setPermissionScope(options.permissionScope);
  }

  const credential = providerRuntimeBridge.resolveCredentialSnapshot();
  const modelFallbackMessage = credential.blocked
    ? `Provider credential status: ${credential.blocked}${credential.provider ? ` (${credential.provider})` : ""}`
    : undefined;

  const session = new AgentSession(
    runtimeContext,
    sessionRuntime,
    sessionManager,
    resourceLoader,
    mcpGateway,
    ownsMcpGateway,
    cleanups,
  );

  return {
    session,
    extensionsResult,
    ...(modelFallbackMessage ? { modelFallbackMessage } : {}),
  };
}
