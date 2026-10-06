export const METRIC_TAGS = ['tool', 'outcome', 'reason', 'sessionId'] as const;

export interface MetricSample {
  readonly name: string;
  readonly unit: 'count' | 'ms';
  count: number;
  total: number;
  max: number;
  readonly tags: Readonly<Record<string, string>>;
}

/** Preserve unit and tag boundaries even when names or values contain separators. */
export function metricKey(name: string, unit: MetricSample['unit'], tags: Readonly<Record<string, string>>): string {
  return JSON.stringify([name, unit, Object.keys(tags).sort().map(key => [key, tags[key]])]);
}

export function aggregateMetrics(samples: readonly MetricSample[]): MetricSample[] {
  const groups = new Map<string, MetricSample>();
  for (const sample of samples) {
    const key = metricKey(sample.name, sample.unit, sample.tags);
    const entry = groups.get(key);
    if (entry) {
      entry.count += sample.count; entry.total += sample.total; entry.max = Math.max(entry.max, sample.max);
    } else groups.set(key, { ...sample });
  }
  return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name) || a.unit.localeCompare(b.unit));
}
