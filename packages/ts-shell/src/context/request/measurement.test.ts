import { expect, it } from 'vitest';
import { decodePromptMeasurement } from './measurement.js';
import { createMessageTranscriptEvent, transcriptEventToSessionMessage } from '../../session/sessionEventCodec.js';

const measurement = { tokens: 3000, messageCount: 1, identity: {
  provider: 'fixture', model: 'model', endpoint: 'openai-compatible', endpointId: 'a'.repeat(64),
  schemaDigest: 'b'.repeat(64), systemDigest: 'c'.repeat(64), historyDigest: 'd'.repeat(64),
  wireHistoryDigest: 'e'.repeat(64), replayBinding: 'f'.repeat(64), wireMessageCount: 1, wireRewriteTokens: 0,
}, projection: { historyDigest: '1'.repeat(64), wireHistoryDigest: '2'.repeat(64), removedTokens: 20, wireRewriteTokens: 0 } };

it('roundtrips only whitelisted measurement fields on assistant messages', () => {
  const input = { ...measurement, secret: 'DO_NOT_RETAIN', identity: { ...measurement.identity, url: 'DO_NOT_RETAIN' } };
  const event = createMessageTranscriptEvent({ role: 'assistant', content: 'answer', timestamp: 'now', promptMeasurement: input });
  const restored = transcriptEventToSessionMessage(JSON.parse(JSON.stringify(event)))!;
  expect(restored.promptMeasurement).toEqual(measurement);
  expect(event.promptMeasurement).not.toBe(input);
  expect(JSON.stringify(restored)).not.toContain('DO_NOT_RETAIN');
  expect(transcriptEventToSessionMessage({ ...event, role: 'user' })?.promptMeasurement).toBeUndefined();
  expect(createMessageTranscriptEvent({ role: 'tool', content: 'result', timestamp: 'now', promptMeasurement: input }).promptMeasurement).toBeUndefined();
});

it.each([null, {}, { ...measurement, tokens: -1 }, { ...measurement, tokens: 0.5 },
  { ...measurement, messageCount: Number.MAX_SAFE_INTEGER + 1 },
  { ...measurement, identity: { ...measurement.identity, endpointId: 'bad' } },
  { ...measurement, identity: { ...measurement.identity, replayBinding: undefined } },
  { ...measurement, projection: { ...measurement.projection, removedTokens: 3000 } },
  { ...measurement, projection: { ...measurement.projection, removedTokens: Infinity } },
])('drops malformed optional measurement without dropping conversation text: %j', input => {
  expect(decodePromptMeasurement(input)).toBeUndefined();
  const event = { type: 'message', role: 'assistant', content: 'keep this', timestamp: 'now', promptMeasurement: input };
  const restored = transcriptEventToSessionMessage(event as never);
  expect(restored?.content).toBe('keep this');
  expect(restored?.promptMeasurement).toBeUndefined();
});

it('loads old transcripts with no measurement', () => {
  expect(transcriptEventToSessionMessage({ type: 'message', role: 'assistant', content: 'old', timestamp: 'now' }))
    .toMatchObject({ content: 'old' });
  expect(decodePromptMeasurement(undefined)).toBeUndefined();
});
