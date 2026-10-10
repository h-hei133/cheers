import { liveLimits, type TranscriptFragment } from './model.js';

export type LiveEvent = { type: 'started'; id: string } | { type: 'audio'; data: Buffer }
  | { type: 'fragment'; fragment: TranscriptFragment } | { type: 'usage'; seconds: number }
  | { type: 'closed'; seconds: number; reason: string } | { type: 'delegation'; id: string } | { type: 'ignored' };
function identifier(value: unknown): value is string { return typeof value === 'string' && /^[A-Za-z0-9_.:-]{1,256}$/.test(value); }
function number(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER; }
function object(value: unknown): Record<string, unknown> { return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
/** Reject raw provider errors without retaining their messages or bodies. */
export function decodeLiveEvent(data: Buffer | string): LiveEvent {
  if (Buffer.byteLength(data) > liveLimits.messageBytes) throw new Error('Voice protocol message limit exceeded.');
  const event = object(JSON.parse(data.toString()));
  if (!event || typeof event !== 'object' || Array.isArray(event) || typeof event.type !== 'string') throw new Error('Invalid voice protocol event.');
  if (event.type === 'error') throw new Error('Voice provider rejected an event; inspect provider access and supported protocol.');
  if (event.type === 'session.started') {
    const id = object(event.session).id;
    if (!identifier(id)) throw new Error('Invalid voice session identity.'); return { type: 'started', id };
  }
  if (event.type === 'session.output_audio.delta') {
    if (typeof event.delta !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(event.delta)) throw new Error('Invalid voice audio encoding.');
    const audio = Buffer.from(event.delta, 'base64');
    if (!audio.length || audio.length % 2 || audio.length > liveLimits.audioBytes) throw new Error('Invalid or oversized PCM audio.');
    return { type: 'audio', data: audio };
  }
  if (event.type === 'session.input_transcript.delta' || event.type === 'session.output_transcript.delta') {
    if (!identifier(event.event_id) || typeof event.delta !== 'string' || !number(event.start_ms) || !number(event.end_ms)
      || event.start_ms > event.end_ms || Buffer.byteLength(event.delta) > liveLimits.transcriptBytes) throw new Error('Invalid voice transcript fragment.');
    return { type: 'fragment', fragment: { eventId: event.event_id, speaker: event.type === 'session.input_transcript.delta' ? 'user' : 'assistant',
      text: event.delta, startMs: event.start_ms, endMs: event.end_ms } };
  }
  if (event.type === 'session.usage.updated' || event.type === 'session.closed') {
    const seconds = object(event.usage).seconds;
    if (!number(seconds)) throw new Error('Invalid voice duration usage.');
    if (event.type === 'session.closed') {
      if (typeof event.reason !== 'string' || !['close_requested', 'expired', 'content', 'remote_hangup', 'connection_lost'].includes(event.reason)) throw new Error('Invalid voice close reason.');
      return { type: 'closed', seconds, reason: event.reason };
    }
    return { type: 'usage', seconds };
  }
  if (event.type === 'session.delegation.created') {
    const delegation = object(event.delegation);
    if (!identifier(delegation.id) || delegation.target !== 'client') throw new Error('Unsupported voice delegation protocol.');
    return { type: 'delegation', id: delegation.id };
  }
  if (event.type.startsWith('response.') || event.type.startsWith('input_audio_buffer.')) throw new Error('Unsupported voice protocol.');
  return { type: 'ignored' };
}
