import type { ToolDefinition } from '../../../tools/types.js';
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
  readonly full: SurfaceCost;
  readonly initial: SurfaceCost;
  readonly afterLoad: SurfaceCost | null;
  readonly discovery: { readonly calls: number; readonly bytes: number; readonly characters: number; readonly estimatedTokens: number };
  readonly delta: { readonly bytes: number; readonly characters: number; readonly estimatedTokens: number };
  readonly method: 'characters-per-token';
  readonly divisor: number;
  readonly quality:
    | { readonly status: 'not-measured'; readonly changed: readonly [] }
    | { readonly status: 'preserved'; readonly changed: readonly [] }
    | { readonly status: 'changed'; readonly changed: readonly string[] };
}

export interface SurfaceCost {
  readonly tools: number;
  readonly bytes: number;
  readonly characters: number;
  readonly estimatedTokens: number;
}

export interface SurfaceSerializer {
  (tools: readonly ToolDefinition[]): { readonly text: string; readonly bytes: number; readonly characters: number };
}

/** The default Chat Completions declaration, used when no protocol is supplied. */
export function wireSchema(tool: ToolDefinition): string {
  return JSON.stringify({ type: 'function', function: { name: tool.name, description: tool.description, parameters: tool.argsSchema } });
}

function defaultSerializer(tools: readonly ToolDefinition[]): { text: string; bytes: number; characters: number } {
  const text = `[${tools.map(wireSchema).join(',')}]`;
  return { text, bytes: Buffer.byteLength(text, 'utf8'), characters: text.length };
}

function surface(tools: Iterable<ToolDefinition>, serialize: SurfaceSerializer): SurfaceCost {
  const values = [...tools];
  const measured = serialize(values);
  return { tools: values.length, bytes: measured.bytes, characters: measured.characters,
    estimatedTokens: Math.round((measured.characters / CHARS_PER_TOKEN) * 10) / 10 };
}

export function compareDiscoveryCost(input: {
  readonly catalog: ReadonlyMap<string, ToolDefinition>;
  readonly searches?: readonly string[];
  readonly load?: readonly string[];
  readonly serialize?: SurfaceSerializer;
}): DiscoveryCostReport {
  const serialize = input.serialize ?? defaultSerializer;
  const original = new Map([...input.catalog.entries()].map(([name, tool]) => [name, serialize([tool]).text]));
  const discovery = createToolDiscovery({ catalog: input.catalog });
  discovery.attachMeta(discoveryTools(discovery));
  const full = surface(input.catalog.values(), serialize);
  const initial = surface(discovery.snapshot().values(), serialize);
  let calls = 0; let discoveryBytes = 0; let discoveryCharacters = 0;
  for (const query of input.searches ?? []) {
    const result = JSON.stringify({ query, matches: discovery.search(query) });
    calls += 1; discoveryBytes += Buffer.byteLength(result, 'utf8'); discoveryCharacters += result.length;
  }
  const changed: string[] = [];
  let measuredLoads = 0;
  for (const name of input.load ?? []) {
    const result = discovery.load([name]);
    const serialized = JSON.stringify(result);
    calls += 1; discoveryBytes += Buffer.byteLength(serialized, 'utf8'); discoveryCharacters += serialized.length;
    const loaded = discovery.snapshot().get(name);
    if (result.loaded.includes(name)) measuredLoads += 1;
    if (loaded && original.get(name) !== serialize([loaded]).text) changed.push(name);
  }
  const requestedLoads = input.load?.length ?? 0;
  const afterLoad = measuredLoads > 0 ? surface(discovery.snapshot().values(), serialize) : null;
  const quality = requestedLoads === 0 || measuredLoads === 0
    ? { status: 'not-measured' as const, changed: [] as const }
    : changed.length > 0
      ? { status: 'changed' as const, changed }
      : { status: 'preserved' as const, changed: [] as const };
  const afterBytes = afterLoad?.bytes ?? initial.bytes;
  const afterCharacters = afterLoad?.characters ?? initial.characters;
  return {
    full, initial, afterLoad,
    discovery: { calls, bytes: discoveryBytes, characters: discoveryCharacters,
      estimatedTokens: Math.round((discoveryCharacters / CHARS_PER_TOKEN) * 10) / 10 },
    delta: { bytes: full.bytes - afterBytes - discoveryBytes,
      characters: full.characters - afterCharacters - discoveryCharacters,
      estimatedTokens: Math.round(((full.characters - afterCharacters - discoveryCharacters) / CHARS_PER_TOKEN) * 10) / 10 },
    method: 'characters-per-token', divisor: CHARS_PER_TOKEN,
    quality,
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
  readonly bias?: number;
  readonly medianAbsoluteError?: number;
  readonly p95AbsoluteError?: number;
  readonly ratioInterval?: { readonly low: number; readonly high: number };
  readonly unknown: boolean;
  readonly note: string;
} {
  const usable = samples.filter(sample => Number.isFinite(sample.estimated) && Number.isFinite(sample.measured)
    && sample.estimated >= 0 && sample.measured > 0);
  if (usable.length === 0) return { samples: 0, unknown: true,
    note: 'No paired estimate and provider measurement; the estimate is not calibrated for this model.' };
  const ratios = usable.map(sample => sample.estimated / sample.measured);
  const absolute = usable.map(sample => Math.abs(sample.estimated - sample.measured) / sample.measured).sort((a, b) => a - b);
  return { samples: usable.length, ratio: ratios.reduce((total, value) => total + value, 0) / ratios.length,
    min: Math.min(...ratios), max: Math.max(...ratios),
    bias: usable.reduce((total, sample) => total + (sample.estimated - sample.measured) / sample.measured, 0) / usable.length,
    medianAbsoluteError: percentile(absolute, 50), p95AbsoluteError: percentile(absolute, 95),
    ratioInterval: bootstrapInterval(ratios), unknown: false,
    note: 'Ratio of character estimate to provider measurement; it is an observed error, not a token ceiling.' };
}

function percentile(sorted: readonly number[], value: number): number {
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil((value / 100) * sorted.length) - 1))]!;
}

function bootstrapInterval(values: readonly number[]): { low: number; high: number } {
  let seed = 0x9e3779b9;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 0x1_0000_0000;
  };
  const estimates: number[] = [];
  for (let iteration = 0; iteration < 1000; iteration += 1) {
    const resampled = Array.from({ length: values.length }, () => values[Math.floor(random() * values.length)]!)
      .sort((a, b) => a - b);
    estimates.push(resampled.reduce((total, value) => total + value, 0) / resampled.length);
  }
  estimates.sort((a, b) => a - b);
  return { low: percentile(estimates, 2.5), high: percentile(estimates, 97.5) };
}

export { DISCOVERY_LOAD_TOOL, DISCOVERY_SEARCH_TOOL };
