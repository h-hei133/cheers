import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const hash = value => createHash('sha256').update(value).digest('hex');

export function seedRestoreSnapshot(project) {
  const before = 'qa-restore-before\n';
  const current = 'qa-restore-current\n';
  const ledger = path.join(project, '.sisyphus', 'edit-snapshots', 'qa-restore');
  const blob = path.join(ledger, 'blobs', `${hash(before)}.content`);
  const record = path.join(ledger, 'records', 'qa-record.json');
  const file = path.join(project, 'qa-restore.txt');
  fs.mkdirSync(path.dirname(blob), { recursive: true });
  fs.mkdirSync(path.dirname(record), { recursive: true });
  fs.writeFileSync(blob, before);
  fs.writeFileSync(record, JSON.stringify({
    schemaVersion: 1, authorityId: 'qa-restore', recordId: 'qa-record',
    workspaceRelativePath: 'qa-restore.txt', operationKind: 'update', beforeState: 'exists',
    beforeContentHash: hash(before), beforeContentSizeBytes: Buffer.byteLength(before),
    beforeContentRef: `blobs/${hash(before)}.content`, expectedCurrentState: 'exists',
    expectedCurrentContentHash: hash(current), capturedAtPhase: 'pre-write',
    persistence: 'non-default', createdAt: '2026-10-21T01:00:00.000Z', evidence: [],
  }));
  fs.writeFileSync(file, current);
  const originals = [file, record, blob].map(file => [file, fs.readFileSync(file)]);
  return { originals };
}

export function assertRestoreUnchanged(fixture) {
  for (const [file, bytes] of fixture.originals) {
    if (!fs.readFileSync(file).equals(bytes)) throw new Error('Restore preview or cancellation changed fixture bytes.');
  }
}

export async function runRestorePreview(state, child, fixture, normalize, wait) {
  const readFrom = start => () => normalize(state.output.slice(start));
  let start = state.output.length;
  child.stdin.write('/restore\r');
  await wait(readFrom(start), value => value.includes('Restore a snapshot') && value.includes('qa-restore.txt'), 'restore chooser');
  start = state.output.length;
  child.stdin.write('\x1b');
  await new Promise(resolve => setTimeout(resolve, 250));
  assertRestoreUnchanged(fixture);

  start = state.output.length;
  child.stdin.write('/restore\r');
  await wait(readFrom(start), value => value.includes('Restore a snapshot') && value.includes('qa-restore.txt'), 'restore chooser reopen');
  child.stdin.write(' \r');
  await wait(readFrom(start), value => value.includes('/restore preview') && value.includes('--record=qa-record'), 'restore preview draft');
  assertRestoreUnchanged(fixture);
  start = state.output.length;
  child.stdin.write('\r');
  await wait(readFrom(start), value => value.includes('Would restore') && value.includes('qa-restore.txt') && value.includes('Nothing was written.'), 'restore submitted preview');
  assertRestoreUnchanged(fixture);
  start = state.output.length;
  child.stdin.write('\x1b');
  await new Promise(resolve => setTimeout(resolve, 250));
}
