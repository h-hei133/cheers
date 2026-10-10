import { Ajv } from 'ajv';
import { sameValue } from '../../config/values.js';
import type { Session } from '../../session/schema/sessionRecord.js';
import { readBoundSessionState, publishBoundSessionState, type BoundSessionHost } from '../../session/store/bound.js';
import { recordOptionsSchema } from './codec.js';
import { recordLimits, type RecordingState, type RecordingRow } from './model.js';
const valid = new Ajv().compile<RecordingState>({ type: 'object', additionalProperties: false, required: ['version', 'revision', 'runs'],
  properties: { version: { const: 1 }, revision: { type: 'integer', minimum: 0 }, runs: { type: 'array', maxItems: 32, items: {
    type: 'object', additionalProperties: false, required: ['id', 'scope', 'file', 'options', 'phase', 'bytes'], properties: {
      id: { type: 'string', minLength: 1, maxLength: 256 }, scope: { type: 'object' }, file: { type: 'string', minLength: 1, maxLength: 4096 },
      options: recordOptionsSchema, phase: { enum: ['recording', 'stopped', 'cancelled', 'truncated', 'failed', 'unknown', 'discarded'] },
      bytes: { type: 'integer', minimum: 0, maximum: recordLimits.fileBytes }, reason: { type: 'string', maxLength: 256 } } } } } });
export class RecordingStore {
  constructor(readonly manager: BoundSessionHost, readonly session: Session) {}
  read(): RecordingState {
    const bound = readBoundSessionState(this.manager, this.session); const value = bound.state.recordings;
    if (value === undefined) return { version: 1, revision: 0, runs: [] };
    if (!valid(value) || new Set(value.runs.map(row => row.id)).size !== value.runs.length || value.runs.some(row => !sameValue(row.scope, bound.scope)))
      throw new Error('Recording journal is unavailable.'); return value;
  }
  save(row: RecordingRow, expected?: RecordingRow): void {
    const bound = readBoundSessionState(this.manager, this.session); const state = this.read();
    if (!sameValue(state.runs.find(value => value.id === row.id), expected) || !sameValue(row.scope, bound.scope)
      || expected && (expected.phase !== 'recording' || row.file !== expected.file || !sameValue(row.options, expected.options))) throw new Error('Recording journal changed.');
    const next: RecordingState = { version: 1, revision: state.revision + 1, runs: expected
      ? state.runs.map(value => value.id === row.id ? row : value) : [...state.runs, row] };
    if (!valid(next)) throw new Error('Recording retention is full or invalid.');
    publishBoundSessionState(this.manager, this.session, bound, (current, baseline) => sameValue(current.recordings, baseline.recordings),
      current => ({ ...current, recordings: next }));
  }
}
