import type { ToolDefinition } from '../../../tools/types.js';
import { textSize } from '../../../context/request/measure.js';
import { CHARS_PER_TOKEN } from '../../../session/context.js';
import { createToolDiscovery, DISCOVERY_LOAD_TOOL, DISCOVERY_SEARCH_TOOL } from './state.js';
import { discoveryTools } from './tools.js';

/**
 * Offline comparison of the two tool surfaces.
 *
 * It answers a cost question with measured byte counts and one declared token
 * estimate. It does not answer the quality question — whether the model still
 * picks the right tool and parameters — which needs real paired tasks and is
 * reported separately.
 */
export interface DiscoveryCostReport {
  readonly full: { readonly tools: number; readonly bytes: number; readonly estimatedTokens: number };
  readonly initial: { readonly tools: number; readonly bytes: number; readonly estimatedTokens: number };
  readonly afterLoad: { readonly tools: number; readonly bytes: number; readonly estimatedTokens: number };
  readonly discovery: { readonly calls: number; readonly bytes: number; readonly estimatedTokens: number };
  readonly delta: { readonly bytes: number; readonly estimatedTokens: number };
  readonly method: 'characters-per-token';
  readonly divisor: number;
  readonly quality: { readonly schemaPreserved: boolean; readonly changed: readonly string[] };
}

/** The declaration as a provider receives it, so sizes describe the wire. */
export function wireSchema(tool: ToolDefinition): string {
  return JSON.stringify({ type: 'function', function: { name: tool.name, description: tool.description, parameters: tool.argsSchema } });
}

function surface(tools: Iterable<ToolDefinition>): { tools: number; bytes: number; estimatedTokens: number } {
  let count = 0; let bytes = 0;
  for (const tool of tools) { count += 1; bytes += textSize(wireSchema(tool)).bytes; }
  return { tools: count, bytes, estimatedTokens: Math.round((bytes / CHARS_PER_TOKEN) * 10) / 10 };
}

export function compareDiscoveryCost(input: {
  readonly catalog: ReadonlyMap<string, ToolDefinition>;
  readonly searches?: readonly string[];
  readonly load?: readonly string[];
}): DiscoveryCostReport {
  const discovery = createToolDiscovery({ catalog: input.catalog });
  discovery.attachMeta(discoveryTools(discovery));
  const full = surface(input.catalog.values());
  const initial = surface(discovery.snapshot().values());
  let calls = 0; let discoveryBytes = 0;
  for (const query of input.searches ?? []) {
    const result = JSON.stringify({ query, matches: discovery.search(query) });
    calls += 1; discoveryBytes += textSize(result).bytes;
  }
  const changed: string[] = [];
  for (const name of input.load ?? []) {
    const result = discovery.load([name]);
    calls += 1; discoveryBytes += textSize(JSON.stringify(result)).bytes;
    const original = input.catalog.get(name);
    const loaded = discovery.snapshot().get(name);
    if (original && loaded && (JSON.stringify(original.argsSchema) !== JSON.stringify(loaded.argsSchema)
      || original.description !== loaded.description)) changed.push(name);
  }
  const afterLoad = surface(discovery.snapshot().values());
  return {
    full, initial, afterLoad,
    discovery: { calls, bytes: discoveryBytes, estimatedTokens: Math.round((discoveryBytes / CHARS_PER_TOKEN) * 10) / 10 },
    delta: { bytes: full.bytes - afterLoad.bytes - discoveryBytes,
      estimatedTokens: Math.round(((full.bytes - afterLoad.bytes - discoveryBytes) / CHARS_PER_TOKEN) * 10) / 10 },
    method: 'characters-per-token', divisor: CHARS_PER_TOKEN,
    quality: { schemaPreserved: changed.length === 0, changed },
  };
}

/**
 * How far the character estimate is from provider counts.
 *
 * Reported as a ratio per sample rather than a correction factor: a model with
 * few samples, or text in another script, is not corrected toward a number the
 * evidence does not support.
 */
export function tokenEstimateError(samples: readonly { readonly estimated: number; readonly measured: number }[]): {
  readonly samples: number;
  readonly ratio?: number;
  readonly min?: number;
  readonly max?: number;
  readonly unknown: boolean;
  readonly note: string;
} {
  const usable = samples.filter(sample => Number.isFinite(sample.estimated) && Number.isFinite(sample.measured)
    && sample.estimated > 0 && sample.measured > 0).map(sample => sample.estimated / sample.measured);
  if (usable.length === 0) return { samples: 0, unknown: true,
    note: 'No paired estimate and provider measurement; the estimate is not calibrated for this model.' };
  return { samples: usable.length, ratio: usable.reduce((total, value) => total + value, 0) / usable.length,
    min: Math.min(...usable), max: Math.max(...usable), unknown: false,
    note: 'Ratio of character estimate to provider measurement; it is an observed error, not a token ceiling.' };
}

export { DISCOVERY_LOAD_TOOL, DISCOVERY_SEARCH_TOOL };
