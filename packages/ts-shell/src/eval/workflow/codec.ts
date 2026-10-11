import path from 'node:path';
import { sameValue } from '../../config/values.js';
import { isRecord } from '../../core/values/record.js';
import type { BoundSessionScope } from '../../session/store/contract.js';
import { decodeEvaluationSpec, evaluationPath } from './manifest.js';
import { compareEvaluation, completeMeasurements } from './scoring.js';
import type { Evaluation, EvaluationState } from './model.js';

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const hash = /^[a-f0-9]{64}$/;
function text(value: unknown, limit: number): value is string { return typeof value === 'string' && !!value && Buffer.byteLength(value) <= limit; }
function asset(value: unknown): boolean {
  return isRecord(value) && evaluationPath(value.path) && value.state === 'exists' && hash.test(String(value.hash))
    && text(value.identity, 256) && Number.isInteger(value.mode) && Number(value.mode) >= 0 && Number(value.mode) <= 511
    && Object.keys(value).every(key => ['path', 'state', 'hash', 'mode', 'identity'].includes(key));
}
export function decodeEvaluations(value: unknown, scope: BoundSessionScope, directory: string): EvaluationState {
  if (value === undefined) return { version: 1, revision: 0, runs: [] };
  if (!isRecord(value) || value.version !== 1 || !Number.isSafeInteger(value.revision) || Number(value.revision) < 0
    || !Array.isArray(value.runs) || value.runs.length > 8 || Buffer.byteLength(JSON.stringify(value)) > 16 * 1024 * 1024
    || Object.keys(value).some(key => !['version', 'revision', 'runs'].includes(key))) throw new Error('Evaluation state is invalid or exceeds retention bounds.');
  const ids = new Set<string>(); let active = 0;
  for (const raw of value.runs) {
    if (!isRecord(raw) || !uuid.test(String(raw.id)) || ids.has(String(raw.id)) || !sameValue(raw.scope, scope)
      || !['creating', 'active', 'retained', 'published', 'unknown'].includes(String(raw.phase)) || !isRecord(raw.frozen)
      || Object.keys(raw).some(key => !['id', 'scope', 'frozen', 'directory', 'phase', 'rounds', 'operationId'].includes(key))) throw new Error('Evaluation binding or lifecycle is invalid.');
    const frozen = raw.frozen; const spec = decodeEvaluationSpec(frozen.spec);
    if (!asset(frozen.manifest) || !Array.isArray(frozen.sources) || frozen.sources.length !== spec.evaluator.length + spec.editable.length + spec.context.length
      || !frozen.sources.every(asset) || !sameValue(frozen.sources.map(file => file.path), [...spec.evaluator, ...spec.editable, ...spec.context])
      || !isRecord(frozen.executable) || !text(frozen.executable.path, 4096) || !path.isAbsolute(frozen.executable.path)
      || !text(frozen.executable.version, 512) || Object.keys(frozen).some(key => !['spec', 'manifest', 'sources', 'executable'].includes(key))) throw new Error('Frozen evaluation inputs are invalid.');
    if (raw.directory !== undefined && (!isRecord(raw.directory) || raw.directory.path !== path.join(directory, 'evaluations', String(raw.id))
      || !text(raw.directory.identity, 65536)) || raw.phase === 'active' && raw.directory === undefined
      || raw.operationId !== undefined && !/^op-[a-f0-9-]{36}$/.test(String(raw.operationId))
      || raw.phase === 'published' && raw.operationId === undefined || !Array.isArray(raw.rounds) || raw.rounds.length > spec.maxRounds)
      throw new Error('Evaluation artifact or publication binding is invalid.');
    const rounds = raw.rounds as unknown as Evaluation['rounds']; const runIds = new Set<string>();
    const metricNames = [spec.target, ...spec.guardrails].map(metric => metric.name);
    for (const round of rounds) {
      if (!isRecord(round) || !uuid.test(String(round.id)) || runIds.has(round.id) || !hash.test(String(round.digest))
        || !['baseline', 'candidate', 'final'].includes(String(round.kind)) || !['running', 'completed', 'failed', 'cancelled', 'unknown'].includes(String(round.status))
        || !Number.isSafeInteger(round.startedAt) || !Array.isArray(round.measurements) || round.measurements.length > spec.samples.length * spec.repetitions)
        throw new Error('Evaluation round is invalid.');
      for (const measure of round.measurements) {
        if (!isRecord(measure) || !spec.samples.some(sample => sample.id === measure.sample) || !Number.isInteger(measure.repetition)
          || Number(measure.repetition) < 0 || Number(measure.repetition) >= spec.repetitions || !text(measure.receiptId, 180) || !text(measure.candidateReceiptId, 180)
          || !isRecord(measure.metrics) || !sameValue(Object.keys(measure.metrics).sort(), [...metricNames].sort())
          || Object.values(measure.metrics).some(value => typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > 1e12))
          throw new Error('Evaluation measurement is invalid.');
      }
      if (round.status === 'completed') {
        if (!completeMeasurements(spec, round.measurements) || (round.kind === 'baseline' ? round.verdict !== 'baseline'
          : !rounds[0] || round.verdict !== compareEvaluation(spec, rounds[0], round.measurements))) throw new Error('Evaluation verdict has no comparable measurement proof.');
      } else if (round.verdict !== undefined) throw new Error('Unsettled or failed evaluations cannot have an improvement verdict.');
      runIds.add(round.id);
    }
    if (rounds.some((round, i) => i === 0 ? round.kind !== 'baseline' : round.kind === 'baseline')
      || raw.phase === 'published' && (rounds.at(-1)?.kind !== 'final' || rounds.at(-1)?.verdict !== 'improved')) throw new Error('Evaluation baseline or final publication proof is invalid.');
    ids.add(String(raw.id)); if (['creating', 'active', 'unknown'].includes(String(raw.phase))) active++;
  }
  if (active > 1) throw new Error('Only one unresolved evaluation may belong to a session.');
  return structuredClone(value) as unknown as EvaluationState;
}
