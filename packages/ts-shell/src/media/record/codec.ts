import { Ajv } from 'ajv';
import { recordLimits, type Cast, type CastEvent, type CastHeader, type RecordOptions } from './model.js';
export const recordOptionsSchema = { type: 'object', additionalProperties: false, required: ['retention', 'maxBytes', 'seconds'], properties: {
  retention: { enum: ['keep', 'discard'] }, maxBytes: { type: 'integer', minimum: 1024, maximum: recordLimits.fileBytes },
  seconds: { type: 'integer', minimum: 1, maximum: recordLimits.seconds } } };
const ajv = new Ajv({ allErrors: false });
const optionsValid = ajv.compile<RecordOptions>(recordOptionsSchema);
const headerValid = ajv.compile<CastHeader>({ type: 'object', additionalProperties: false,
  required: ['version', 'width', 'height', 'timestamp', 'cheers'], properties: { version: { const: 2 },
    width: { type: 'integer', minimum: 1, maximum: 10000 }, height: { type: 'integer', minimum: 1, maximum: 10000 },
    timestamp: { type: 'integer', minimum: 0 }, cheers: { type: 'object', additionalProperties: false,
      required: ['version', 'id', 'sessionId', 'input', 'options'], properties: { version: { const: 1 }, id: { type: 'string', minLength: 1, maxLength: 256 },
        sessionId: { type: 'string', minLength: 1, maxLength: 256 }, input: { const: 'excluded' }, options: recordOptionsSchema } } } });
export function recordingOptions(retention: unknown, maxBytes: unknown, seconds: unknown): RecordOptions {
  const options = { retention, maxBytes: Number(maxBytes), seconds: Number(seconds) };
  if (!optionsValid(options)) throw new Error('Recording requires keep/discard retention, 1024–16777216 bytes and 1–3600 seconds.');
  return options;
}
/** A trailing partial line is retained as incomplete, never silently called stopped. */
export function decodeCast(text: string): Cast {
  if (Buffer.byteLength(text) > recordLimits.fileBytes || text.includes('\u0000')) throw new Error('Recording is oversized or invalid.');
  const lines = text.split('\n'); const tail = lines.pop()!; const header: unknown = JSON.parse(lines.shift() ?? 'null');
  if (!headerValid(header) || lines.length > recordLimits.events) throw new Error('Recording schema or event limit is invalid.');
  const events: CastEvent[] = []; let previous = 0;
  for (const line of lines) {
    if (!line || Buffer.byteLength(line) > recordLimits.eventBytes * 6) throw new Error('Invalid recording event.');
    const value: unknown = JSON.parse(line);
    if (!Array.isArray(value) || value.length !== 3 || typeof value[0] !== 'number' || !Number.isFinite(value[0]) || value[0] < previous
      || value[0] > recordLimits.seconds + 10 || !['o', 'e', 'r', 'm'].includes(value[1]) || typeof value[2] !== 'string'
      || Buffer.byteLength(value[2]) > recordLimits.eventBytes || value[1] === 'r' && !/^[1-9]\d{0,3}x[1-9]\d{0,3}$/.test(value[2])) throw new Error('Invalid recording event or timing.');
    events.push(value as unknown as CastEvent); previous = value[0];
  }
  const finalized = events.at(-1)?.[1] === 'm' && /^recording:(stopped|cancelled|truncated|failed)$/.test(events.at(-1)![2]);
  return { header, events, incomplete: Boolean(tail) || !finalized };
}
