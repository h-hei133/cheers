import { expect, it } from 'vitest';
import { parseProposal } from './proposal.js';

const valid = { hypothesisId: 'p1', claim: ' Observed behavior. ', evidenceRefs: ['receipt'], falsifiers: [' An observed contradiction. '] };

it('retains independent falsifiers and only its own successful source identities', () => {
  expect(parseProposal(JSON.stringify(valid), 'p1', ['receipt'])).toEqual({ id: 'p1', claim: 'Observed behavior.',
    evidenceRefs: ['receipt'], falsifiers: ['An observed contradiction.'] });
  expect(() => parseProposal(JSON.stringify(valid), 'p1', [])).toThrow('not read by this proposer');
});

it.each([null, [], { ...valid, hypothesisId: 'p2' }, { ...valid, claim: ' ' }, { ...valid, falsifiers: [] },
  { ...valid, falsifiers: [' '] }, { ...valid, evidenceRefs: null }, { ...valid, evidenceRefs: [false] },
  { ...valid, evidenceRefs: ['receipt', 'borrowed'] }, { ...valid, undeclared: true },
  { ...valid, claim: '中'.repeat(1400) }, { ...valid, falsifiers: ['中'.repeat(350)] }])(
  'refuses malformed or unsupported proposal %j without interpreting it as a claim', value => {
    expect(() => parseProposal(JSON.stringify(value), 'p1', ['receipt'])).toThrow();
  });

it('rejects oversized or prose-wrapped responses without exposing model output in errors', () => {
  const secretLikeOutput = 'private-body-marker';
  for (const value of ['```json\n' + JSON.stringify(valid) + '\n```', secretLikeOutput, 'x'.repeat(17000)]) {
    try { parseProposal(value, 'p1', []); throw Error('accepted'); }
    catch (error) { expect(String(error)).not.toContain(secretLikeOutput); expect(String(error)).not.toContain('accepted'); }
  }
});
