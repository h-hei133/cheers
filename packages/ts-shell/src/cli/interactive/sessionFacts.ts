import { resolveContextWindow, resolveModelCost } from "../../core/models/window.js";
import { resolveProviderCredential } from "../../core/shell/providerCredentials.js";
import path from "node:path";
import os from "node:os";
import type { ShellRuntimeContext } from "../../core/shell/runtimeContext.js";
import type { StatusFacts } from "../../presentation/tui/chrome/items.js";
import type { WelcomeState } from "../../presentation/tui/chrome/welcome.js";
import { estimateSessionCost, getSessionUsage, totalTokens } from "../../observability/usageTelemetry.js";
import { getSessionTodos } from "../../core/commands/todoCommandRuntime.js";

/**
 * Session facts for the status band.
 *
 * The band must never invent a value: every field either reflects real runtime
 * state or is omitted. Token usage comes from recorded provider usage, so the
 * used amount stays unknown until a provider measurement is available. The
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
  const config = context.configuration.current.config;
  const active = context.resolveConfigTarget?.(config) ?? resolveProviderCredential({ runtimeConfig: config });
  return active.model ?? active.provider;
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
}

export function readStatusFacts(
  context: ShellRuntimeContext,
  live: LiveStatusFacts = {},
): StatusFacts {
  const { config, catalog } = context.configuration.current;
  const active = context.resolveConfigTarget?.(config) ?? resolveProviderCredential({ runtimeConfig: config });
  const usage = getSessionUsage(context.session.id);
  // Summed across the models that answered, each at the rate published for the
  // provider that served it. A session that switched models — or providers — spent
  // tokens at more than one price, and the status band must not show the newest
  // rate applied to all of them. Resolving against the active provider would do
  // exactly that.
  const { cost, everyRatePublished, zeroCostSupported } = estimateSessionCost(usage, (provider, model) =>
    resolveModelCost(catalog, provider, model),
  );
  const window = resolveContextWindow({ catalog, provider: active.provider, model: active.model, configured: config.contextWindow });
  return {
    model: active.model ?? active.provider,
    provider: active.provider,
    branch: context.gitContext.branch ?? undefined,
    directory: shortenPath(context.projectRoot || path.resolve(".")),
    sessionId: context.session.id,
    agentMode: live.agentMode ?? config.agentMode ?? "build",
    permissionScope: live.permissionScope ?? "ask",
    worktreeDirty: context.gitContext.isClean === null ? undefined : !context.gitContext.isClean,
    queued: live.queued,
    peers: live.peers,
    openTodos: getSessionTodos(context.session.id).filter((todo) => todo.status !== "done").length,
    // The denominator is the same resolution compaction uses, even when its
    // numerator is unknown after startup, restoration, or context replacement.
    contextWindow: window.window,
    contextWindowSource: window.source,
    contextWarning: window.warning,
    ...(usage.lastPromptTokens !== undefined ? { contextUsed: usage.lastPromptTokens } : {}),
    ...(totalTokens(usage) > 0 ? { sessionTokens: totalTokens(usage) } : {}),
    ...(usage.turnsCount > 0 ? { turns: usage.turnsCount } : {}),
    ...(cost > 0 || zeroCostSupported
      ? { costUsd: cost, costRates: everyRatePublished ? 'catalog' : 'assumed' } as const : {}),
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
