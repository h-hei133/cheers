import { expect, it } from 'vitest';
import { projectBranchMessages, projectTranscriptMessages } from '../transcript/sessionTranscript.js';
import { compactionPublicationDigest } from './publication.js';
import type { CompactionTranscriptEntry, TranscriptEvent } from '../sessionEventCodec.js';

it('requires exact later proof before applying prepared material after restart', () => {
  const turn: TranscriptEvent = { type: 'message', id: 'turn', role: 'user', content: 'original history', timestamp: '2026-10-19' };
  const compaction: CompactionTranscriptEntry = { type: 'compaction', id: 'compact', publication: 'prepared', summary: 'summary', keptMessages: 0, timestamp: '2026-10-19' };
  const proof: TranscriptEvent = { type: 'compaction-commit', id: 'proof', compactionId: 'compact', digest: compactionPublicationDigest(compaction), timestamp: '2026-10-19' };
  expect(projectTranscriptMessages([turn, compaction])[0]!.content).toBe('original history');
  expect(projectTranscriptMessages([turn, compaction, { ...proof, digest: '0'.repeat(64) }])[0]!.content).toBe('original history');
  expect(projectTranscriptMessages([turn, proof, compaction])[0]!.content).toBe('original history');
  expect(projectTranscriptMessages([turn, compaction, proof])[0]!.content).toBe('[Context Checkpoint]\nsummary');
  expect(projectTranscriptMessages([turn, { ...compaction, publication: undefined }])[0]!.content).toBe('[Context Checkpoint]\nsummary');
});

it('refuses duplicate identities and invalid proof order even around a valid exact receipt', () => {
  const turn: TranscriptEvent = { type: 'message', id: 'turn', role: 'user', content: 'original history', timestamp: '2026-10-19' };
  const compaction: CompactionTranscriptEntry = { type: 'compaction', id: 'compact', publication: 'prepared',
    sourceActivePath: ['root', 'turn'], summary: 'verified material', keptMessages: 0, timestamp: '2026-10-19' };
  const proof: TranscriptEvent = { type: 'compaction-commit', id: 'proof', compactionId: 'compact', digest: compactionPublicationDigest(compaction), timestamp: '2026-10-19' };
  const badProof: TranscriptEvent = { ...proof, id: 'bad-proof', digest: '0'.repeat(64) };
  const changed: CompactionTranscriptEntry = { ...compaction, summary: 'unverified changed material', sourceActivePath: ['root', 'sibling'] };
  for (const events of [
    [turn, compaction, proof, changed], [turn, compaction, changed, proof],
    [turn, compaction, proof, { ...compaction }], [turn, compaction, proof, { ...proof }],
    [turn, compaction, badProof, proof], [turn, compaction, proof, badProof],
    [turn, proof, compaction, { ...proof, id: 'later-proof' }],
    [turn, compaction, proof, { ...turn, id: 'proof' }],
  ]) expect(projectTranscriptMessages(events).every(message => !String(message.content).includes('Context Checkpoint'))).toBe(true);
  // Ambiguity is checked before branch filtering can hide the duplicate record.
  expect(projectBranchMessages([turn, compaction, proof, changed], ['root', 'turn'], ['root', 'turn', 'sibling'])[0]!.content).toBe('original history');
  expect(projectBranchMessages([turn, compaction, proof], undefined)[0]!.content).toBe('original history');
  expect(projectBranchMessages([turn, compaction, proof], ['different-root', 'unrelated'])[0]!.content).toBe('original history');
  for (const field of [
    { keptMessages: 1 }, { tokensBefore: 12 }, { timestamp: 'later' },
    { firstKeptEntryId: 'turn' }, { sourceActivePath: ['different', 'turn'] },
  ]) expect(projectTranscriptMessages([turn, { ...compaction, ...field }, proof])[0]!.content).toBe('original history');
});
