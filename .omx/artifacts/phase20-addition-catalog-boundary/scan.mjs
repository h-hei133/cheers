import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { checkBuild } from '../../../scripts/start-lib.mjs';

const root = process.cwd(), archive = path.join(root, '.omx/artifacts/phase20-addition-catalog-boundary');
const phase = process.argv[2];
assert(['before', 'after'].includes(phase));
const manifest = JSON.parse(fs.readFileSync('packages/ts-shell/dist/build-manifest.json', 'utf8'));
const built = path.dirname(path.dirname(path.join(root, 'packages/ts-shell/dist', manifest.entry)));
if (phase === 'after') assert(checkBuild({ root, dist: path.join(root, 'packages/ts-shell/dist'),
  version: manifest.version, executablePolicy: 'ignore' }).ok, 'current build');
const load = file => import(pathToFileURL(path.join(built, file)));
const { createProfileContext } = await load('core/paths/profile/context.js');
const { createSessionStoreLayout, projectSessionFileLayout } = await load('session/store/sessionFileLayout.js');
const { createMessageTranscriptEvent, createTranscriptHeader } = await load('session/sessionEventCodec.js');
const { projectSessionMetadata } = await load('session/schema/sessionMetadataCodec.js');
const { buildSessionStateSnapshot } = await load('session/schema/sessionStateSnapshot.js');
const { SessionCatalog } = await load('session/store/catalog/index.js');
const scratch = path.join(root, '.tmp/catalog-boundary/scan-home');
fs.mkdirSync(scratch, { recursive: true });
const profile = createProfileContext({ name: 'scan', homeDir: scratch, env: {} });
const store = createSessionStoreLayout(scratch, profile), count = 256;
if (!fs.existsSync(path.join(store.sessionsDir, 'current'))) {
  for (let index = 0; index < count; index++) {
    const timestamp = new Date(Date.parse('2026-10-30T00:00:00.000Z') - index * 1000).toISOString();
    const id = index === 0 ? 'current' : `saved-${String(index).padStart(3, '0')}`;
    const session = { id, projectRoot: '/workspace', title: `Catalogue ${index}`, createdAt: timestamp,
      updatedAt: timestamp, status: 'completed', turns: [{ id: `message-${index}`, role: 'user',
        content: 'Synthetic catalogue record ' + 'x'.repeat(400), timestamp }] };
    const files = projectSessionFileLayout({ sessionsDir: store.sessionsDir, sessionId: id });
    fs.mkdirSync(files.sessionDir, { recursive: true });
    fs.writeFileSync(files.metadataPath, JSON.stringify(projectSessionMetadata(session)));
    fs.writeFileSync(files.statePath, JSON.stringify(buildSessionStateSnapshot(session, undefined)));
    fs.writeFileSync(files.transcriptPath, [createTranscriptHeader({ sessionId: id, timestamp, cwd: '/workspace' }),
      createMessageTranscriptEvent(session.turns[0])].map(event => JSON.stringify(event)).join('\n') + '\n');
  }
}
function digest() {
  const hash = createHash('sha256');
  for (const id of fs.readdirSync(store.sessionsDir).sort()) {
    for (const name of ['metadata.json', 'state.json', 'transcript.jsonl']) {
      hash.update(id + '/' + name); hash.update(fs.readFileSync(path.join(store.sessionsDir, id, name)));
    }
  }
  return hash.digest('hex');
}
const fixtureDigest = digest(), counts = { lstat: 0, stat: 0, realpath: 0 };
const originals = { lstatSync: fs.lstatSync, statSync: fs.statSync, realpathSync: fs.realpathSync };
for (const [method, key] of [['lstatSync', 'lstat'], ['statSync', 'stat'], ['realpathSync', 'realpath']]) {
  fs[method] = function(...args) { counts[key]++; return originals[method].apply(this, args); };
}
const receipt = { phase, fixtureCount: count, messagesPerFixture: 1, fixtureDigest,
  buildId: manifest.buildId, inputsDigest: manifest.inputsDigest,
  baselineBuildIsRetainedSnapshot: phase === 'before' };
const context = { sessionId: 'current', projectRoot: '/workspace', busy: false };
let catalog, browse;
try {
  const started = performance.now();
  catalog = new SessionCatalog(store); browse = catalog.beginBrowse(context);
  let final, snapshots = 0;
  for await (const page of catalog.list(context, undefined, 40, undefined, undefined, { browse, needle: '' })) {
    final = page; snapshots++;
  }
  receipt.elapsedMs = Math.round(performance.now() - started);
  receipt.snapshots = snapshots; receipt.syncFileCalls = { ...counts };
  receipt.catalog = { scanned: final.scanned, total: final.total, status: final.status,
    unreadable: final.unreadable, sourceLimited: final.sourceLimited === true };
  assert.deepEqual(receipt.catalog, { scanned: count, total: count, status: 'complete', unreadable: 0, sourceLimited: false });
  receipt.firstPageIds = final.sessions.map(summary => summary.id);
} finally {
  catalog?.retireBrowse(browse);
  Object.assign(fs, originals);
}
receipt.fixtureUnchanged = digest() === fixtureDigest;
assert(receipt.fixtureUnchanged);
if (phase === 'after') {
  const before = JSON.parse(fs.readFileSync(path.join(archive, 'scan-before.json'), 'utf8'));
  assert.equal(before.fixtureDigest, fixtureDigest, 'same fixture');
  assert.deepEqual(before.firstPageIds, receipt.firstPageIds, 'same offered identities');
  const sum = values => Object.values(values).reduce((total, value) => total + value, 0);
  receipt.syncCallReduction = 1 - sum(receipt.syncFileCalls) / sum(before.syncFileCalls);
  assert(receipt.syncCallReduction > 0.6, 'shared boundary removes most repeated synchronous checks');
  fs.rmSync(scratch, { recursive: true });
  receipt.scratchRemoved = !fs.existsSync(scratch);
}
fs.writeFileSync(path.join(archive, `scan-${phase}.json`), JSON.stringify(receipt, null, 2) + '\n');
process.stdout.write(JSON.stringify(receipt) + '\n');
