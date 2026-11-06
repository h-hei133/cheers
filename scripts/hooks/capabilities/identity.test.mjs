import assert from 'node:assert/strict';
import { test } from 'node:test';
import { boundStatus } from './identity.mjs';

test('each identity dimension invalidates an observed cell independently', () => {
  const identity = { sourceSnapshot: { commit: 'source', sha256: 'bytes' }, profile: { id: 'profile', sha256: 'rules' }, bundleDigest: 'bundle', artifactSha256: 'artifact' };
  assert.equal(boundStatus({ status: 'observed', identity }, identity), 'observed');
  assert.equal(boundStatus({ status: 'unavailable', identity }, identity), 'unavailable');
  for (const key of Object.keys(identity)) {
    assert.equal(boundStatus({ status: 'observed', identity: { ...identity, [key]: 'other' } }, identity), 'stale');
    assert.equal(boundStatus({ status: 'observed', identity: { ...identity, [key]: undefined } }, identity), 'unknown');
  }
});
