import { Ajv } from 'ajv';
import { sameValue } from '../../config/values.js';
import type { Session } from '../../session/schema/sessionRecord.js';
import { readBoundSessionState, publishBoundSessionState, type BoundSessionHost, type BoundSessionScope } from '../../session/store/bound.js';
import { liveLimits, type LiveRun, type LiveState } from './model.js';

const text = { type: 'string', minLength: 1, maxLength: 256 };
const time = { type: 'number', minimum: 0, maximum: Number.MAX_SAFE_INTEGER };
const validate = new Ajv({ allErrors: false }).compile({ type: 'object', additionalProperties: false,
  required: ['version', 'revision', 'runs'], properties: { version: { const: 1 }, revision: { type: 'integer', minimum: 0 },
    runs: { type: 'array', maxItems: 16, items: { type: 'object', additionalProperties: false,
      required: ['id', 'scope', 'options', 'createdAt', 'phase', 'finalUsage', 'cleanup', 'fragments'], properties: {
        id: text, scope: { type: 'object' }, options: { type: 'object', additionalProperties: false,
          required: ['model', 'voice', 'seconds', 'captureDevice', 'playbackDevice'], properties: {
            model: { const: 'gpt-live-1' }, voice: { const: 'marin' }, seconds: { type: 'integer', minimum: 1, maximum: 1800 },
            captureDevice: text, playbackDevice: text } }, createdAt: time,
        phase: { enum: ['starting', 'active', 'closing', 'closed', 'failed', 'unknown'] }, remoteId: text, attemptId: text,
        seconds: time, finalUsage: { type: 'boolean' }, cleanup: { enum: ['pending', 'confirmed', 'unknown'] }, reason: text,
        fragments: { type: 'array', maxItems: liveLimits.fragments, items: { type: 'object', additionalProperties: false,
          required: ['eventId', 'speaker', 'text', 'startMs', 'endMs'], properties: { eventId: text, speaker: { enum: ['user', 'assistant'] },
            text: { type: 'string', maxLength: liveLimits.transcriptBytes }, startMs: time, endMs: time } } } } } } } });
function decode(value: unknown, scope: BoundSessionScope): LiveState {
  if (value === undefined) return { version: 1, revision: 0, runs: [] };
  if (!validate(value)) throw new Error('Voice journal is unavailable.');
  const state = value as LiveState;
  if (new Set(state.runs.map(row => row.id)).size !== state.runs.length || state.runs.some(row => !sameValue(row.scope, scope)
    || row.finalUsage && row.seconds === undefined || row.phase === 'closed' && (!row.finalUsage || row.cleanup !== 'confirmed')
    || new Set(row.fragments.map(fragment => fragment.eventId)).size !== row.fragments.length
    || row.fragments.some(fragment => fragment.startMs > fragment.endMs)
    || row.fragments.reduce((sum, fragment) => sum + Buffer.byteLength(fragment.text), 0) > liveLimits.transcriptBytes))
    throw new Error('Voice journal binding or evidence is invalid.');
  return state;
}
export class LiveStore {
  constructor(readonly manager: BoundSessionHost, readonly session: Session) {}
  read(): LiveState { const bound = readBoundSessionState(this.manager, this.session); return decode(bound.state.live, bound.scope); }
  save(row: LiveRun, expected?: LiveRun): void {
    const bound = readBoundSessionState(this.manager, this.session); const state = decode(bound.state.live, bound.scope);
    if (!sameValue(state.runs.find(value => value.id === row.id), expected) || !sameValue(row.scope, bound.scope)
      || expected && (!sameValue(row.options, expected.options) || row.createdAt !== expected.createdAt
        || !sameValue(row.fragments.slice(0, expected.fragments.length), expected.fragments)
        || ['closed', 'failed', 'unknown'].includes(expected.phase))) throw new Error('Voice journal changed; authority cannot be adopted.');
    const next: LiveState = { ...state, revision: state.revision + 1, runs: expected
      ? state.runs.map(value => value.id === row.id ? row : value) : [...state.runs, row] };
    decode(next, bound.scope);
    publishBoundSessionState(this.manager, this.session, bound, (current, baseline) => sameValue(current.live, baseline.live),
      current => ({ ...current, live: next }));
  }
}
