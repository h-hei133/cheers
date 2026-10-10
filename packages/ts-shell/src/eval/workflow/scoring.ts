import { isRecord } from '../../core/values/record.js';
import type { EvaluationRound, EvaluationSpec, Measurement, Metric } from './model.js';

export function decodeMetrics(text: string, spec: EvaluationSpec): Readonly<Record<string, number>> {
  const value: unknown = JSON.parse(text);
  const names = [spec.target, ...spec.guardrails].map(metric => metric.name);
  if (!isRecord(value) || Object.keys(value).length !== 1 || !isRecord(value.metrics)
    || Object.keys(value.metrics).length !== names.length || names.some(name => !Object.hasOwn(value.metrics as object, name)
      || typeof (value.metrics as Record<string, unknown>)[name] !== 'number' || !Number.isFinite((value.metrics as Record<string, number>)[name])
      || Math.abs((value.metrics as Record<string, number>)[name]!) > 1e12)) throw new Error('Evaluator must return exactly the declared finite metrics.');
  return value.metrics as Record<string, number>;
}
export function completeMeasurements(spec: EvaluationSpec, rows: readonly Measurement[]): boolean {
  return rows.length === spec.samples.length * spec.repetitions && spec.samples.every(sample =>
    Array.from({ length: spec.repetitions }, (_, repetition) => rows.filter(row => row.sample === sample.id && row.repetition === repetition).length === 1).every(Boolean));
}
function delta(spec: EvaluationSpec, baseline: EvaluationRound, rows: readonly Measurement[], metric: Metric, split: 'train' | 'holdout'): number {
  const samples = new Set(spec.samples.filter(sample => sample.split === split).map(sample => sample.id));
  const selected = rows.filter(row => samples.has(row.sample));
  const total = selected.reduce((sum, row) => sum + row.metrics[metric.name]!
    - baseline.measurements.find(before => before.sample === row.sample && before.repetition === row.repetition)!.metrics[metric.name]!, 0);
  return total / selected.length * (metric.direction === 'higher' ? 1 : -1);
}
export function compareEvaluation(spec: EvaluationSpec, baseline: EvaluationRound, rows: readonly Measurement[]): 'improved' | 'rejected' {
  if (baseline.status !== 'completed' || baseline.verdict !== 'baseline' || !completeMeasurements(spec, baseline.measurements)
    || !completeMeasurements(spec, rows)) throw new Error('Incomplete or failed evaluations cannot be compared.');
  return (['train', 'holdout'] as const).every(split => delta(spec, baseline, rows, spec.target, split) >= spec.target.threshold
    && spec.guardrails.every(metric => delta(spec, baseline, rows, metric, split) >= -metric.threshold)) ? 'improved' : 'rejected';
}
export function summarizeMeasurements(spec: EvaluationSpec, rows: readonly Measurement[]) {
  return Object.fromEntries((['train', 'holdout'] as const).map(split => {
    const ids = new Set(spec.samples.filter(sample => sample.split === split).map(sample => sample.id));
    const selected = rows.filter(row => ids.has(row.sample));
    return [split, { measured: selected.length, metrics: Object.fromEntries([spec.target, ...spec.guardrails].map(metric =>
      [metric.name, selected.length ? selected.reduce((sum, row) => sum + row.metrics[metric.name]!, 0) / selected.length : null])) }];
  }));
}
