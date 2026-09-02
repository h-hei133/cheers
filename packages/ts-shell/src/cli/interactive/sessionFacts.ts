import path from "node:path";
import os from "node:os";
import type { ShellRuntimeContext } from "../../core/shell/runtimeContext.js";
import type { StatusFacts } from "../../presentation/tui/chrome/items.js";
import { estimateUsageCost, getSessionUsage } from "../../observability/usageTelemetry.js";
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

/** Model identifier configured for the active provider. */
export function activeModelName(context: ShellRuntimeContext): string {
  const config = context.runtimeConfig;
  return config.providerCredentials?.[config.provider]?.model ?? config.provider;
}

/**
 * Facts the status band can draw from.
 *
 * `agentMode` comes from the caller rather than the resolved configuration: the
 * configuration does not carry it, and the live value is the one Shift+Tab
 * changes.
 */
export function readStatusFacts(context: ShellRuntimeContext, agentMode?: string): StatusFacts {
  const usage = getSessionUsage(context.session.id);
  const cost = estimateUsageCost(usage);
  return {
    model: activeModelName(context),
    provider: context.runtimeConfig.provider,
    branch: context.gitContext.branch ?? undefined,
    directory: shortenPath(context.projectRoot || path.resolve(".")),
    sessionId: context.session.id,
    agentMode: agentMode ?? context.runtimeConfig.agentMode ?? "build",
    openTodos: getSessionTodos().filter((todo) => todo.status !== "done").length,
    // Absent until a real request has been accounted for: a zeroed gauge is a
    // fabricated fact, not a neutral one.
    ...(usage.lastPromptTokens > 0
      ? { contextUsed: usage.lastPromptTokens, contextWindow: context.runtimeConfig.contextWindow ?? 64_000 }
      : {}),
    ...(usage.totalTokens > 0 ? { sessionTokens: usage.totalTokens } : {}),
    ...(usage.turnsCount > 0 ? { turns: usage.turnsCount } : {}),
    ...(cost > 0 ? { costUsd: cost } : {}),
  };
}
