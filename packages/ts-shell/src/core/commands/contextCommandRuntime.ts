import { contextReport } from './context/report.js';
import { reportText } from './report/projection.js';
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
  const reserve = resolveTokenBudget(runtimeConfig.modelTokenBudgets, active.provider, active.model, "reserveTokens", runtimeConfig.reserveTokens, DEFAULT_RESERVE_TOKENS);
  const registry = context.getToolPool ? await context.getToolPool() : createCoreToolRegistry();
  const blocked = context.admission?.();
  if (blocked) return { kind: "local", output: blocked };
  const schemaTokens = toolSchemaTokens(registry);

  const report = contextReport({ resolution, used: telemetry?.lastPromptTokens, reserve,
    schemaTokens, toolCount: registry.size, totalTokens: telemetry ? totalTokens(telemetry) : 0,
    turns: telemetry?.turnsCount ?? 0 });
  return { kind: "local", output: reportText(report), report };
}

/** Character-based estimate for the current tool definitions. */
function toolSchemaTokens(registry: Parameters<typeof toolSchemas>[0]): number {
  const serialised = JSON.stringify(toolSchemas(registry));
  return Math.round(serialised.length / CHARS_PER_TOKEN);
}
