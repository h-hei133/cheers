import { rejectArguments } from "./syntax/empty.js";
import type { CommandContext, LocalCommandResult } from "./types.js";
import { getRuntimeConfig } from "../../config/runtimeConfig.js";
import { loadCatalog } from "../models/catalogStore.js";
import { resolveContextWindow, resolveTokenBudget } from "../models/window.js";
import { resolveProviderCredential } from "../shell/providerCredentials.js";
import { getSessionUsage, totalTokens } from "../../observability/usageTelemetry.js";
import { CHARS_PER_TOKEN, DEFAULT_RESERVE_TOKENS } from "../../session/context.js";
import { toolSchemas } from "../../turn/tools.js";
import { createCoreToolRegistry } from "../tools/registry.js";

/**
 * /context — how much of the window the last request used.
 *
 * Only measured quantities appear here. The previous version presented a
 * breakdown table headed "Measured Tokens" whose rows were mostly invented: the
 * footprint fell back to a literal 2,500 when no turn had run, the system prompt
 * was "35% of the footprint, capped at 1,500", the tool schemas were a flat 1,200
 * described as "11 core & web tool parameter definitions", and history was
 * whatever was left after subtracting the other two. Numbers like that cannot be
 * checked, and a context report exists to be checked.
 *
 * Current tool definitions are an estimate from the active pool, while prompt
 * usage belongs to the last request. They may describe different configurations,
 * so the current estimate is never subtracted to invent a historical breakdown.
 */

const BAR_WIDTH = 32;

export async function runContextCommand(
  args: string[],
  context: CommandContext,
): Promise<LocalCommandResult> {
  const invalid = rejectArguments("context", args);
  if (invalid) return invalid;
  const sessionId = context.sessionId ?? "";
  const telemetry = sessionId ? getSessionUsage(sessionId) : undefined;
  // The window and reserve the compaction engine actually works to. Read from
  // the same configuration the engine reads, rather than from an environment
  // variable nothing sets and a constant that happens to match today: a report
  // about a threshold is only useful if it names the threshold in force.
  const publication = context.readConfiguration?.();
  const runtimeConfig = publication?.config ?? context.runtimeConfig ?? getRuntimeConfig(context.projectRoot ?? context.cwd);
  // The same resolution the compaction engine performs, so the number reported
  // here is the number in force. Asking the credential resolver for the active
  // model is what makes this per-model rather than one global value.
  const active = context.resolveConfigTarget?.(runtimeConfig) ?? resolveProviderCredential({ runtimeConfig });
  const resolution = resolveContextWindow({
    catalog: publication?.catalog ?? loadCatalog(),
    provider: active.provider,
    model: active.model,
    configured: runtimeConfig.contextWindow,
  });
  const window = resolution.window;
  const windowDetails = [
    `- Window: ${window.toLocaleString()} tokens (${resolution.source === 'default' ? 'assumed default' : resolution.source})`,
    ...(resolution.warning ? [`- Warning: ${resolution.warning}`] : []),
  ];
  const reserve = resolveTokenBudget(runtimeConfig.modelTokenBudgets, active.provider, active.model, "reserveTokens", runtimeConfig.reserveTokens, DEFAULT_RESERVE_TOKENS);
  const registry = context.getToolPool ? await context.getToolPool() : createCoreToolRegistry();
  const blocked = context.admission?.();
  if (blocked) return { kind: "local", output: blocked };
  const schemaTokens = toolSchemaTokens(registry);

  if (!telemetry || telemetry.lastPromptTokens === undefined) {
    return {
      kind: "local",
      output: [
        "### Context window",
        "",
        ...windowDetails,
        `- Current tool schema estimate: ~${schemaTokens.toLocaleString()} tokens (${registry.size} tools)`,
        "",
        "Current prompt usage is unknown. No provider measurement is available for this context.",
      ].join("\n"),
    };
  }

  const used = telemetry.lastPromptTokens;
  const free = Math.max(0, window - used - reserve);
  // The threshold the loop actually applies: the reserve is headroom kept for
  // the reply, so compaction starts when a request would spend past the window
  // minus that reserve — not at some fixed share of the window.
  const compactAt = Math.max(0, window - reserve);

  return {
    kind: "local",
    output: [
      "### Context window",
      "",
      ...windowDetails,
      `- ${bar(used, reserve, window)}  ${percent(used, window)} used`,
      `- Last request carried ${used.toLocaleString()} of ${window.toLocaleString()} tokens; ${free.toLocaleString()} free before the ${reserve.toLocaleString()}-token reserve`,
      "",
      "| What | Tokens | How it is known |",
      "| :--- | ---: | :--- |",
      `| Current tool schemas | ~${schemaTokens.toLocaleString()} | ${registry.size} current definitions; character-based estimate |`,
      `| **Last request total** | **${used.toLocaleString()}** | reported by the provider |`,
      "",
      `Auto-compaction runs when a request would exceed about ${compactAt.toLocaleString()} tokens. \`/compact\` runs it now.`,
      totalTokens(telemetry) > 0
        ? `\nAcross the whole session: ${totalTokens(telemetry).toLocaleString()} tokens over ${telemetry.turnsCount} ${telemetry.turnsCount === 1 ? "turn" : "turns"}.`
        : "",
    ].join("\n").replace(/\n+$/, ""),
  };
}

/** Character-based estimate for the current tool definitions. */
function toolSchemaTokens(registry: Parameters<typeof toolSchemas>[0]): number {
  const serialised = JSON.stringify(toolSchemas(registry));
  return Math.round(serialised.length / CHARS_PER_TOKEN);
}

/** A bar showing used, reserved, and free, in that order. */
function bar(used: number, reserve: number, window: number): string {
  const usedCells = Math.min(BAR_WIDTH, Math.round((used / window) * BAR_WIDTH));
  const reserveCells = Math.min(BAR_WIDTH - usedCells, Math.round((reserve / window) * BAR_WIDTH));
  const freeCells = Math.max(0, BAR_WIDTH - usedCells - reserveCells);
  return `\`${"█".repeat(usedCells)}${"▒".repeat(reserveCells)}${"░".repeat(freeCells)}\``;
}

function percent(part: number, whole: number): string {
  return `${((part / whole) * 100).toFixed(1)}%`;
}
