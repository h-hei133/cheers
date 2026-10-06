import { LOG_TAIL_BYTES, orderedLogFiles, tailLines } from '../logs/files.js';
import { METRIC_TAGS, type MetricSample } from './model.js';

export interface MetricRead {
  readonly samples: readonly MetricSample[];
  readonly status: 'reported' | 'partial' | 'unavailable';
  readonly filesInspected: number;
  readonly unreadableFiles: number;
  readonly limit: number;
}

/** Latest matching samples from bounded file tails, including prior processes and rotations. */
export function readMetrics(directory: string, currentPath: string, limit: number): MetricRead {
  let enumerationFailed = false; let unreadableFiles = 0;
  const files = orderedLogFiles(directory, currentPath, { onUnavailable: target => {
    if (target === 'directory') enumerationFailed = true; else unreadableFiles++;
  } });
  if (enumerationFailed) return { samples: [], status: 'unavailable', filesInspected: 0, unreadableFiles: 0, limit };
  const samples: MetricSample[] = [];
  let filesInspected = unreadableFiles;
  for (const file of files.reverse()) {
    filesInspected++;
    let lines: string[];
    try { lines = tailLines(file, LOG_TAIL_BYTES, { strict: true }); }
    catch { unreadableFiles++; continue; }
    for (let index = lines.length - 1; index >= 0 && samples.length < limit; index--) {
      const sample = parseMetric(lines[index]!);
      if (sample) samples.push(sample);
    }
    if (samples.length === limit) break;
  }
  return { samples: samples.reverse(), filesInspected, unreadableFiles, limit,
    status: unreadableFiles ? unreadableFiles === filesInspected ? 'unavailable' : 'partial' : 'reported' };
}

function parseMetric(line: string): MetricSample | undefined {
  let parsed: unknown;
  try { parsed = JSON.parse(line); } catch { return undefined; }
  if (!object(parsed) || parsed.component !== 'metric' || typeof parsed.message !== 'string' || !parsed.message) return undefined;
  const fields = parsed.fields;
  if (!object(fields) || (fields.metric !== 'ms' && fields.metric !== 'count')) return undefined;
  const legacy = finite(fields.value) ? fields.value : undefined;
  const total = legacy ?? fields.total;
  const count = legacy !== undefined ? 1 : fields.count;
  const max = legacy ?? fields.max;
  if (!finite(total) || !finite(count) || !finite(max) || count < 0 || !Number.isInteger(count)) return undefined;
  const tags: Record<string, string> = {};
  for (const key of METRIC_TAGS) if (typeof fields[key] === 'string') tags[key] = fields[key];
  return { name: parsed.message, unit: fields.metric, total, count, max, tags };
}

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}
