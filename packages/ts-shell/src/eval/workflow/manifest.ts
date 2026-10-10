import { isRecord } from '../../core/values/record.js';
import type { EvaluationSpec, Metric } from './model.js';

const name = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;
function keys(value: Record<string, unknown>, allowed: string[]): void {
  if (Object.keys(value).some(key => !allowed.includes(key))) throw new Error('Evaluation manifest contains unsupported fields.');
}
function integer(value: unknown, minimum: number, maximum: number): value is number {
  return Number.isSafeInteger(value) && Number(value) >= minimum && Number(value) <= maximum;
}
export function evaluationPath(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 1024 && !/[\\\x00-\x1f\x7f-\x9f]/.test(value)
    && !value.startsWith('/') && value.split('/').every(part => Boolean(part) && !['.', '..', '.git', '.agents'].includes(part))
    && value.split('/').length <= 16;
}
function paths(value: unknown, required: boolean): value is string[] {
  return Array.isArray(value) && value.length >= (required ? 1 : 0) && value.length <= 32 && value.every(evaluationPath);
}
function metric(value: unknown, target: boolean): value is Metric {
  if (!isRecord(value)) return false;
  keys(value, ['name', 'direction', 'threshold']);
  return typeof value.name === 'string' && name.test(value.name) && ['higher', 'lower'].includes(String(value.direction))
    && typeof value.threshold === 'number' && Number.isFinite(value.threshold) && value.threshold >= (target ? Number.MIN_VALUE : 0)
    && value.threshold <= 1e12;
}
export function decodeEvaluationSpec(value: unknown): EvaluationSpec {
  if (!isRecord(value) || Buffer.byteLength(JSON.stringify(value)) > 65536) throw new Error('Evaluation manifest must be an object of at most 64 KiB.');
  keys(value, ['version', 'entry', 'candidateEntry', 'evaluator', 'editable', 'context', 'runtime', 'target', 'guardrails', 'samples', 'repetitions', 'maxRounds', 'timeoutMs']);
  if (value.version !== 1 || !evaluationPath(value.entry) || !paths(value.evaluator, true) || !value.evaluator.includes(value.entry)
    || !paths(value.editable, true) || !paths(value.context, false) || !evaluationPath(value.candidateEntry)
    || ![...value.editable, ...value.context].includes(value.candidateEntry) || !['node', 'bun'].includes(String(value.runtime))
    || !metric(value.target, true) || !Array.isArray(value.guardrails) || value.guardrails.length > 8 || !value.guardrails.every(row => metric(row, false))
    || !Array.isArray(value.samples) || value.samples.length > 32 || !integer(value.repetitions, 1, 3)
    || !integer(value.maxRounds, 3, 16) || !integer(value.timeoutMs, 100, 10000)) throw new Error('Evaluation manifest fields or bounds are invalid.');
  const all = [...value.evaluator, ...value.editable, ...value.context].map(file => file.normalize('NFC').toLowerCase());
  if (all.some((file, index) => all.some((other, j) => index !== j && (file === other || file.startsWith(other + '/'))))) throw new Error('Evaluation paths must be distinct and disjoint.');
  const metrics = [value.target, ...value.guardrails].map(row => (row as Metric).name);
  if (new Set(metrics).size !== metrics.length) throw new Error('Evaluation metric names must be distinct.');
  const ids = new Set<string>();
  for (const sample of value.samples) {
    if (!isRecord(sample)) throw new Error('Evaluation samples are invalid.');
    keys(sample, ['id', 'split', 'input', 'expected']);
    if (typeof sample.id !== 'string' || !name.test(sample.id) || ids.has(sample.id) || !['train', 'holdout'].includes(String(sample.split))
      || !Object.hasOwn(sample, 'input') || !Object.hasOwn(sample, 'expected')) throw new Error('Evaluation samples require unique IDs, a fixed split, JSON input and expected outcome.');
    ids.add(sample.id);
  }
  if (['train', 'holdout'].some(split => (value.samples as Array<{ split: string }>).filter(sample => sample.split === split).length < 2))
    throw new Error('Evaluation requires at least two training and two holdout samples.');
  return structuredClone(value) as unknown as EvaluationSpec;
}
