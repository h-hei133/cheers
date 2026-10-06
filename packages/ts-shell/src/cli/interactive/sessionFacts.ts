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
 * context gauge stays absent until a real request has been accounted for rather
 * than showing a placeholder zero.
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
  const { cost } = estimateSessionCost(usage, (provider, model) =>
    resolveModelCost(catalog, provider, model),
  );
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
    // Absent until a real request has been accounted for: a zeroed gauge is a
    // fabricated fact, not a neutral one.
    ...(usage.lastPromptTokens > 0
      ? {
          contextUsed: usage.lastPromptTokens,
          // The gauge's denominator has to be the same window compaction uses,
          // or the percentage it shows describes a limit nothing enforces.
          contextWindow: resolveContextWindow({
            catalog,
            provider: active.provider,
            model: active.model,
            configured: config.contextWindow,
          }).window,
        }
      : {}),
    ...(totalTokens(usage) > 0 ? { sessionTokens: totalTokens(usage) } : {}),
    ...(usage.turnsCount > 0 ? { turns: usage.turnsCount } : {}),
    ...(cost > 0 ? { costUsd: cost } : {}),
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
