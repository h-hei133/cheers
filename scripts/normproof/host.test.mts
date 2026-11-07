import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { normalizeStopResult } from '../../packages/ts-shell/src/core/hooks/stop/result.js';

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const cases = ['compliant', 'violating', 'not-configured', 'reentry'];

test('R0a captured command envelopes reach the real Cheers parser without changing proof truth', () => {
  const expected = [
    { decision: 'allow', proofVerdict: 'proven', reasonCode: 'proven' },
    { decision: 'block', proofVerdict: 'failed', reasonCode: 'actionable_gap' },
    { decision: 'allow', proofVerdict: 'not_reported', reasonCode: 'not_configured', stopDisposition: 'completed_unproven' },
    { decision: 'allow', proofVerdict: 'not_reported', reasonCode: 'already_blocked_once', stopDisposition: 'completed_unproven' },
  ];
  for (const [index, name] of cases.entries()) {
    const raw = JSON.parse(fs.readFileSync(path.join(repository, `docs/architecture/hooks/evidence/capabilities/node20-stop-r0a-${name}.json`), 'utf8'));
    const envelope = JSON.parse(raw.stdout);
    assert.equal(envelope.contract.name, 'normproof.completion-gate.stop');
    assert.equal(envelope.contract.version, '0.1.0');
    const output = normalizeStopResult(envelope);
    for (const [key, value] of Object.entries(expected[index])) assert.equal(output[key], value, name);
    assert.deepEqual(output.evidenceIdentity, [...new Set(envelope.evidenceIdentity)].sort());
    console.log(JSON.stringify({ fixture: name, evidenceTier: 'captured-R0a-output-current-host-parser', output }));
  }
});

test('missing, malformed and incompatible Stop envelopes cannot synthesize proof', () => {
  const envelope = { contract: { name: 'normproof.completion-gate.stop', version: '0.1.0' },
    decision: 'allow', reasonCode: 'proven', proofVerdict: 'proven', evidenceIdentity: ['fixture'] };
  assert.equal(normalizeStopResult(null).reasonCode, 'empty_output');
  assert.equal(normalizeStopResult({ ...envelope, contract: { ...envelope.contract, version: '2' } }).reasonCode, 'incompatible_contract');
  assert.equal(normalizeStopResult({ ...envelope, proofVerdict: undefined }).reasonCode, 'invalid_output');
  assert.equal(normalizeStopResult({ ...envelope, proofVerdict: 'failed' }).reasonCode, 'conflicting_verdict');
});
