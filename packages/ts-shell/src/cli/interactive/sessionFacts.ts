import path from "node:path";
import os from "node:os";
import type { ShellRuntimeContext } from "../../core/shell/runtimeContext.js";
import type { BandState } from "../../presentation/tui/chrome/band.js";
import { estimateUsageCost, getSessionUsage } from "../../observability/usageTelemetry.js";

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

/** Current band state derived from runtime configuration and recorded usage. */
export function readBandState(context: ShellRuntimeContext): BandState {
  const usage = getSessionUsage(context.session.id);
  const cost = estimateUsageCost(usage);
  const agentMode = context.runtimeConfig.agentMode;
  return {
    model: activeModelName(context),
    branch: context.gitContext.branch ?? undefined,
    directory: shortenPath(context.projectRoot || path.resolve(".")),
    ...(usage.lastPromptTokens > 0
      ? { usedTokens: usage.lastPromptTokens, contextWindow: context.runtimeConfig.contextWindow ?? 64_000 }
      : {}),
    ...(cost > 0 ? { costUsd: cost } : {}),
    ...(agentMode && agentMode !== "build" ? { mode: agentMode } : {}),
  };
}
