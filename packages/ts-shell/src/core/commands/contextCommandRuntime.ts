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
import { createCoreToolRegistry } from "../tools/registry.js";
import { providerCredentialBaseUrl, providerCredentialEndpoint } from '../auth/account/target.js';
import { DEFAULT_ENDPOINT_KIND } from '../../provider/endpoints/index.js';
import { catalogModel } from '../models/catalog.js';
import { configuredOutputLimit } from '../../provider/request/output.js';
import { endpointShape } from '../../provider/endpoints/index.js';
import { captureUsageAttribution } from '../../observability/usage/identity.js';

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
 * Discoverable tool definitions are an estimate from the inspection pool, while prompt
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
  return context.runCancellable
    ? context.runCancellable(signal => inspectContext({ ...context,
      signal: context.signal ? AbortSignal.any([context.signal, signal]) : signal }))
    : inspectContext(context);
}

async function inspectContext(context: CommandContext): Promise<LocalCommandResult> {
  context.signal?.throwIfAborted();
  const refused = context.admission?.();
  context.signal?.throwIfAborted();
  if (refused) return { kind: 'local', output: refused };
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
  const catalog = publication?.catalog ?? loadCatalog();
  let activeBaseUrl = active.baseUrl;
  let activeEndpoint: string | undefined;
  let outputTokens: number | undefined;
  try {
    activeBaseUrl = providerCredentialBaseUrl(catalog, active);
    activeEndpoint = providerCredentialEndpoint(catalog, active, activeBaseUrl) ?? DEFAULT_ENDPOINT_KIND;
    outputTokens = endpointShape(activeEndpoint).outputControl === 'provider' ? undefined
      : configuredOutputLimit(runtimeConfig, activeEndpoint)
        ?? catalogModel(catalog, active.provider, active.model, activeBaseUrl)?.maxTokens;
  } catch {
    // The report can still describe the configured model when account routing
    // is unverifiable; it must not turn that uncertainty into a live measurement.
    activeEndpoint = undefined;
  }
  const resolution = resolveContextWindow({
    catalog,
    provider: active.provider,
    model: active.model,
    baseUrl: activeBaseUrl,
    configured: runtimeConfig.contextWindow,
  });
  const reserve = resolveTokenBudget(runtimeConfig.modelTokenBudgets, active.provider, active.model, "reserveTokens", runtimeConfig.reserveTokens, DEFAULT_RESERVE_TOKENS);
  context.signal?.throwIfAborted();
  const registry = context.getToolPool ? await context.getToolPool(context.signal) : createCoreToolRegistry();
  context.signal?.throwIfAborted();
  const blocked = context.admission?.();
  context.signal?.throwIfAborted();
  if (blocked) return { kind: "local", output: blocked };
  const schemaSize = measureToolSchemas(registry);
  const schemaTokens = Math.round(schemaSize.codeUnits / CHARS_PER_TOKEN);
  // The last request's identity is the only trustworthy source for dynamic
  // discovery snapshots and for a cwd that differs from the project root. A
  // command-side reconstruction from the full inspection pool would describe a
  // different request, not the one whose tokens are being reported.
  const recorded = sessionId ? getSessionUsage(sessionId).lastPromptIdentity : undefined;
  const expectedSchemaDigest = context.promptIdentity?.schemaDigest;
  const expectedSystemDigest = context.promptIdentity?.systemDigest;
  const expectedHistoryDigest = context.promptIdentity?.historyDigest;
  const expectedEndpointId = active.model === undefined || activeBaseUrl === undefined ? undefined
    : captureUsageAttribution({ provider: active.provider, model: active.model, baseUrl: activeBaseUrl }).endpointId;
  const expectedIdentity = active.model === undefined ? undefined : {
    provider: active.provider,
    model: active.model,
    ...(activeEndpoint !== undefined ? { endpoint: activeEndpoint } : {}),
    ...(expectedEndpointId !== undefined ? { endpointId: expectedEndpointId } : {}),
    ...(expectedSchemaDigest !== undefined ? { schemaDigest: expectedSchemaDigest } : {}),
    ...(expectedSystemDigest !== undefined ? { systemDigest: expectedSystemDigest } : {}),
    ...(expectedHistoryDigest !== undefined ? { historyDigest: expectedHistoryDigest } : {}),
  };
  const hasExpectedIdentity = expectedIdentity?.schemaDigest !== undefined && expectedIdentity.systemDigest !== undefined;
  // A complete stored identity is not evidence that it still describes the
  // current runtime. Only the live request identity can authorize it; otherwise
  // a reload that cleared the live identity would validate the record against
  // itself. Identity-free records remain the legacy compatibility path.
  const legacyMeasurement = recorded === undefined && context.promptIdentity === undefined;

  const measured = sessionId && expectedIdentity && activeEndpoint && (hasExpectedIdentity || legacyMeasurement)
    ? measuredPromptContext(sessionId, expectedIdentity,
      { requireExpectedIdentity: hasExpectedIdentity })
    : undefined;
  const measurement = measured ? 'measured' as const
    : telemetry?.lastPromptTokens !== undefined ? 'stale' as const : 'unknown' as const;
  const report = contextReport({ resolution, used: measured?.tokens, measurement, reserve, outputTokens,
    inputLimit: catalogModel(catalog, active.provider, active.model, activeBaseUrl)?.inputLimit,
    protocol: activeEndpoint,
    schemaTokens, schemaSize, request: telemetry?.requestContext, toolCount: registry.size, totalTokens: telemetry ? totalTokens(telemetry) : 0,
    turns: telemetry?.turnsCount ?? 0 }, context.cwd);
  return { kind: "local", output: reportText(report), report };
}

/** Measure the exact JSON array without materializing every schema in one string. */
function measureToolSchemas(registry: ReadonlyMap<string, import('../../tools/types.js').ToolDefinition>) {
  let bytes = 2;
  let codeUnits = 2;
  let count = 0;
  for (const tool of registry.values()) {
    const serialized = JSON.stringify({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.argsSchema ?? { type: 'object', properties: {} },
      },
    });
    if (count > 0) {
      bytes += 1;
      codeUnits += 1;
    }
    bytes += Buffer.byteLength(serialized, 'utf8');
    codeUnits += serialized.length;
    count += 1;
  }
  return { bytes, codeUnits };
}
