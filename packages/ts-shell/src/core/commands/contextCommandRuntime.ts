import { contextReport } from './context/report.js';
import { reportText } from './report/projection.js';
import { parseSyntax } from './syntax/parse.js';
import { contextSyntax } from '../../context/attachment/syntax.js';
import type { CommandContext, LocalCommandResult } from "./types.js";
import { getRuntimeConfig } from "../../config/runtimeConfig.js";
import { loadCatalog } from "../models/catalogStore.js";
import { resolveContextWindow, resolveTokenBudget } from "../models/window.js";
import { resolveProviderCredential } from "../shell/providerCredentials.js";
import { getSessionUsage, measuredPromptContext, totalTokens } from "../../observability/usageTelemetry.js";
import { CHARS_PER_TOKEN, DEFAULT_RESERVE_TOKENS } from "../../session/context.js";
import { toolSchemas } from "../../turn/tools.js";
import { createCoreToolRegistry } from "../tools/registry.js";
import { textSize } from '../../context/request/measure.js';

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
  const parsed = parseSyntax(contextSyntax, args);
  if (!parsed.ok) return { kind: 'local', output: `Invalid /context arguments: ${parsed.reason}` };
  if (parsed.action.name !== 'status') {
    return context.ruleControlsCommand ? context.ruleControlsCommand('context', args, context) as Promise<LocalCommandResult>
      : { kind: 'local', output: 'Extra context requires a bound source-read permission owner.' };
  }
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
    baseUrl: active.baseUrl,
    configured: runtimeConfig.contextWindow,
  });
  const reserve = resolveTokenBudget(runtimeConfig.modelTokenBudgets, active.provider, active.model, "reserveTokens", runtimeConfig.reserveTokens, DEFAULT_RESERVE_TOKENS);
  const registry = context.getToolPool ? await context.getToolPool() : createCoreToolRegistry();
  const blocked = context.admission?.();
  if (blocked) return { kind: "local", output: blocked };
  const schemaSize = textSize(JSON.stringify(toolSchemas(registry)));
  const schemaTokens = Math.round(schemaSize.codeUnits / CHARS_PER_TOKEN);

  const measured = sessionId && active.model
    ? measuredPromptContext(sessionId, { provider: active.provider, model: active.model })
    : undefined;
  const measurement = measured ? 'measured' as const
    : telemetry?.lastPromptTokens !== undefined ? 'stale' as const : 'unknown' as const;
  const report = contextReport({ resolution, used: measured?.tokens, measurement, reserve,
    schemaTokens, schemaSize, request: telemetry?.requestContext, toolCount: registry.size, totalTokens: telemetry ? totalTokens(telemetry) : 0,
    turns: telemetry?.turnsCount ?? 0 });
  return { kind: "local", output: reportText(report), report };
}
