export interface MetricEvent {
  readonly name: string
  readonly value: number
  readonly unit: 'count' | 'ms'
  readonly tags: Record<string, string>
}

let metricSink: ((event: MetricEvent) => void) | null = null

export function setMetricSink(sink: ((event: MetricEvent) => void) | null): void {
  metricSink = sink
}

export function recordCount(name: string, value: number, tags: Record<string, string> = {}): void {
  metricSink?.({ name, value, unit: 'count', tags })
}

export function recordTiming(name: string, value: number, tags: Record<string, string> = {}): void {
  metricSink?.({ name, value, unit: 'ms', tags })
}
