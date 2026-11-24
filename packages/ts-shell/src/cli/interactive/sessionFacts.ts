import { configuredContextWindow, resolveContextWindow, resolveModelCost } from "../../core/models/window.js";
import { resolveProviderCredential } from "../../core/shell/providerCredentials.js";
import { providerCredentialBaseUrl, providerCredentialEndpoint } from "../../core/auth/account/target.js";
import { DEFAULT_ENDPOINT_KIND } from "../../provider/endpoints/index.js";
import { captureUsageAttribution } from '../../observability/usage/identity.js';
import { summarizeCacheUsage } from '../../observability/cacheWaste.js';
import path from "node:path";
import os from "node:os";
import type { ShellRuntimeContext } from "../../core/shell/runtimeContext.js";
import type { StatusFacts } from "../../presentation/tui/chrome/items.js";
import type { WelcomeState } from "../../presentation/tui/chrome/welcome.js";
import { estimateSessionCost, getSessionUsage, measuredPromptContext, totalTokens } from "../../observability/usageTelemetry.js";
import { getSessionTodos } from "../../core/commands/todoCommandRuntime.js";
import { readLogicalModel } from '../../session/model/logical.js';

/**
 * Session facts for the status band.
 *
 * The band must never invent a value: every field either reflects real runtime
 * state or is omitted. Idle request estimates are explicitly distinguished from
 * recorded provider usage and unavailable or stale readings. The
 * window is resolved independently, with its configuration or catalog source.
 */

/** Home-relative path, so a long project root still fits the band. */
export function shortenPath(target: string): string {
  const home = os.homedir();
  if (home && target.startsWith(home)) return `~${target.slice(home.length)}`;
  return target;
}

/** Model identifier selected for requests by this host. */
export function activeModelName(context: ShellRuntimeContext): string {
  const selected = readModelStatus(context);
  return selected?.logical ? `${selected.logical.provider}/${selected.logical.model}`
    : selected?.active.model ?? selected?.active.provider ?? 'unknown';
}

/** Display cannot grant a request target when the strict session reader refuses it. */
function readModelStatus(context: ShellRuntimeContext) {
  try {
    const logical = readLogicalModel(context.session.id);
    const config = context.configuration.current.config;
    const active = context.resolveConfigTarget?.(config, context.session.id)
      ?? resolveProviderCredential({ runtimeConfig: config, pool: { sessionId: context.session.id } });
    return { logical, active };
  } catch { return undefined; }
}

/**
 * Facts the status band can draw from.
 *
 * The live `agentMode` changed by Shift+Tab takes precedence over the accepted
 * configuration's default.
 */
export interface LiveStatusFacts {
  readonly agentMode?: string;
  readonly permissionScope?: string;
  /** Submissions waiting behind the running turn. */
  readonly queued?: number;
  /** Other live sessions reachable for cross-session messaging. */
  readonly peers?: number;
  readonly promptContext?: import('./context/controller.js').ContextReading;
  readonly architecture?: StatusFacts['architecture'];
}

export function readStatusFacts(
  context: ShellRuntimeContext,
  live: LiveStatusFacts = {},
): StatusFacts {
  const { config, catalog } = context.configuration.current;
  const selected = readModelStatus(context);
  const logical = selected?.logical;
  const active = selected?.active;
  let activeBaseUrl = active?.baseUrl;
  let activeEndpoint: string | undefined;
  try {
    if (active) {
      activeBaseUrl = providerCredentialBaseUrl(catalog, active);
      activeEndpoint = providerCredentialEndpoint(catalog, active, activeBaseUrl) ?? DEFAULT_ENDPOINT_KIND;
    }
  } catch {
    activeEndpoint = undefined;
  }
  const usage = getSessionUsage(context.session.id);
  const { hitRate: cacheHitRate } = summarizeCacheUsage(usage.recentRequests);
  const measured = active?.model && activeEndpoint ? measuredPromptContext(context.session.id, {
    ...(context.promptIdentity ?? {}), provider: active.provider, model: active.model, endpoint: activeEndpoint,
    ...(activeBaseUrl ? { endpointId: captureUsageAttribution({ provider: active.provider,
      model: active.model, baseUrl: activeBaseUrl }).endpointId } : {}) },
    context.promptIdentity ? { requireExpectedIdentity: true } : {}) : undefined;
  // Summed across the models that answered, each at the rate published for the
  // provider that served it. A session that switched models — or providers — spent
  // tokens at more than one price, and the status band must not show the newest
  // rate applied to all of them. Resolving against the active provider would do
  // exactly that.
  const { cost, usesAssumedRates, partial, zeroCostSupported } = estimateSessionCost(usage, (provider, model) =>
    resolveModelCost(catalog, provider, model),
  );
  const window = active ? resolveContextWindow({ catalog, provider: active.provider, model: active.model, baseUrl: activeBaseUrl,
    configured: configuredContextWindow(config, active) }) : undefined;
  const preview = live.promptContext;
  // Keep the latest request footprint during busy work and refreshes; a stale
  // source remains explicit instead of reverting to an older measured prefix.
  const contextFact = !selected ? { contextSource: 'unknown' as const }
    : preview?.tokens !== undefined && preview.source !== 'unknown'
    ? { contextUsed: preview.tokens, contextSource: preview.source }
    : measured ? { contextUsed: measured.tokens, contextSource: 'measured' as const }
      : preview ? { contextSource: preview.source } : {};
  return {
    model: logical ? `${logical.provider}/${logical.model}` : active?.model ?? active?.provider ?? 'unknown',
    provider: logical?.provider ?? active?.provider ?? 'unknown',
    branch: context.gitContext.branch ?? undefined,
    directory: shortenPath(context.projectRoot || path.resolve(".")),
    sessionId: context.session.id,
    agentMode: live.agentMode ?? config.agentMode ?? "build",
    permissionScope: live.permissionScope ?? "ask",
    worktreeDirty: context.gitContext.isClean === null ? undefined : !context.gitContext.isClean,
    queued: live.queued,
    peers: live.peers,
    architecture: live.architecture,
    openTodos: getSessionTodos(context.session.id).filter((todo) => todo.status !== "done" && todo.status !== "dropped").length,
    // The denominator is the same resolution compaction uses, even when its
    // numerator is unknown after startup, restoration, or context replacement.
    ...(!logical && window ? { contextWindow: window.window, contextWindowSource: window.source, contextWarning: window.warning } : {}),
    ...(logical && !preview ? {} : contextFact),
    ...(cacheHitRate === undefined ? {} : { cacheHitRate }),
    ...(totalTokens(usage) > 0 ? { sessionTokens: totalTokens(usage) } : {}),
    ...(usage.turnsCount > 0 ? { turns: usage.turnsCount } : {}),
    ...(usage.usageHealth ? { usageIncomplete: true } : {}),
    ...(cost > 0 || zeroCostSupported
      ? { costUsd: cost, costRates: usesAssumedRates ? 'assumed' : 'catalog', costPartial: partial } as const : {}),
  };
}

/**
 * Intro facts, resolved at paint time so a mid-session change is reflected. The
 * resume hint appears only when there is actually a session to go back to.
 */
export function readWelcomeState(
  context: ShellRuntimeContext,
  agentMode: string | undefined,
  hasRecoverableSession: boolean,
): WelcomeState {
  const facts = readStatusFacts(context, { agentMode });
  return {
    model: facts.model,
    directory: facts.directory ?? context.projectRoot,
    branch: facts.branch,
    resumeHint: hasRecoverableSession ? "/resume to pick up where you left off" : undefined,
  };
}
