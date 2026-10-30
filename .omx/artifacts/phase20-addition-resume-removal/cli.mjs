import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { StringDecoder } from 'node:string_decoder';
import assert from 'node:assert/strict';
import { checkBuild } from '../../../scripts/start-lib.mjs';
import { createQaPtyEnvironment } from '../../../scripts/qa-pty-env.mjs';

const root = process.cwd(), archive = path.join(root, process.argv[3] ?? '.omx/artifacts/phase20-addition-resume-removal');
const base = path.join(root, '.tmp/resume-removal');
fs.mkdirSync(base, { recursive: true, mode: 0o700 });
const build = checkBuild({ root, dist: path.join(root, 'packages/ts-shell/dist'),
  version: JSON.parse(fs.readFileSync('packages/ts-shell/package.json')).version, executablePolicy: 'ignore' });
assert(build.ok, 'current build');
const built = path.dirname(path.dirname(build.entry));
const load = file => import(pathToFileURL(path.join(built, file)));
const { createProfileContext, withProfile } = await load('core/paths/profile/context.js');
const { SessionManager } = await load('session/SessionManager.js');
const { setFilePersistenceEnabled } = await load('observability/structuredLogger.js');
setFilePersistenceEnabled(false);
const mode = process.argv[2] ?? 'regular';
assert(['regular', 'fullscreen'].includes(mode), 'mode');
const scratch = fs.mkdtempSync(path.join(base, 'run-'));
const home = path.join(scratch, 'home'), project = path.join(scratch, 'project');
fs.mkdirSync(home); fs.mkdirSync(project);
const env = { ...createQaPtyEnvironment(home, project), NODE_OPTIONS: '--max-old-space-size=768',
  CHEERS_PROBE_BUILD: built, CHEERS_PROBE_RECEIPT: path.join(scratch, 'observe.json'),
  CHEERS_PROBE_DEVICE: path.join(scratch, 'device.json') };
assert.equal(spawnSync('git', ['init', '-q'], { cwd: project, env, stdio: 'ignore' }).status, 0);
const profile = createProfileContext({ name: 'probe', homeDir: home, env });
const config = path.join(profile.root, 'config.json');
fs.writeFileSync(config, JSON.stringify({ tuiMode: mode, allowedTools: [], enableMcpTools: false, offline: true,
  cacheWarming: 'off', provider: 'openai-compatible', providerCredentials: { 'openai-compatible': {
    apiKey: 'synthetic-fixture', baseUrl: 'https://fixture.invalid/v1', model: 'fixture' } } }));
const fixtureIds = withProfile(profile, () => {
  const manager = new SessionManager(), ids = [];
  for (let index = 0; index < 8; index++) {
    const session = manager.createNew(project);
    manager.addTurn(session.id, { id: 'fixture-message', role: 'user', content: 'Small saved fixture ' + index });
    manager.saveCompleted(session.id); manager.renameSession(session.id, 'removal-fixture-' + index); ids.push(session.id);
  }
  return ids;
});
const directory = id => withProfile(profile, () => new SessionManager().getSessionDirPath(id));
const current = () => withProfile(profile, () => new SessionManager().getCurrentSessionForProject(project)?.id);
const beforeConfig = fs.readFileSync(config);
const beforeFiles = new Map(fixtureIds.flatMap(id => ['metadata.json', 'state.json', 'transcript.jsonl'].map(name => {
  const target = path.join(directory(id), name); return [target, fs.readFileSync(target)];
})));
let output = '', bytes = 0, closed = false;
const child = spawn('python3', [path.join(root, '.omx/artifacts/phase20-addition-live-cli/relay.py'), '--', process.execPath,
  '--import', path.join(archive, 'observe.mjs'), path.join(root, 'scripts/start.mjs'), '--project', project, '--profile', 'probe',
  '--session-id', fixtureIds[0], '--no-context-files', '--no-skills', '--offline'], { cwd: project, env, detached: true });
const close = new Promise(resolve => child.once('close', (code, signal) => { closed = true; resolve({ code, signal }); }));
const receipt = { mode, buildId: build.manifest.buildId, inputsDigest: build.manifest.inputsDigest,
  fixtures: 8, messagesPerFixture: 1, providerMode: 'synthetic', status: 'not-run', checks: {}, deletionMs: [] };
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const observe = () => { try { return JSON.parse(fs.readFileSync(env.CHEERS_PROBE_RECEIPT)); } catch { return {}; } };
for (const stream of [child.stdout, child.stderr]) {
  const decoder = new StringDecoder('utf8');
  stream.on('data', chunk => { bytes += chunk.length;
    if (bytes <= 2 * 1024 * 1024) output += decoder.write(chunk); else child.kill('SIGTERM'); });
}
const deadline = setTimeout(() => child.kill('SIGTERM'), 45000);
async function wait(predicate, label) {
  const until = Date.now() + 10000;
  while (Date.now() < until) {
    assert(bytes <= 2 * 1024 * 1024, 'output cap'); if (predicate()) return;
    assert(!closed, 'closed-' + label); await pause(25);
  }
  throw Error('timeout-' + label);
}
const ready = query => { const s = observe().snapshot;
  return s?.title === 'Resume session' && s.filter === query && !s.loading && !s.searching && !s.pending && !s.failed; };
async function focus(id) {
  for (let step = 0; step < 12 && observe().snapshot.current !== id; step++) {
    const previous = observe().snapshot.current; child.stdin.write('\x1b[B');
    await wait(() => observe().snapshot.current !== previous, 'focus');
  }
  assert.equal(observe().snapshot.current, id, 'keyboard focus');
  assert(observe().snapshot.painted.includes(id), 'focused row painted');
}
try {
  await wait(() => output.includes('Ask anything, or / for commands'), 'startup');
  child.stdin.write('/resume\r');
  await wait(() => ready('') && observe().snapshot.ids.length === 8
    && observe().snapshot.status?.includes('End of this session page range'), 'open');
  for (const index of [1, 2]) {
    const query = index === 1 ? '' : 'removal-fixture-2';
    if (query) { child.stdin.write(query); await wait(() => ready(query) && observe().snapshot.ids.length === 1, 'search'); }
    await focus(fixtureIds[index]);
    const beforeSync = observe().syncTranscriptReads;
    const started = Date.now(); child.stdin.write('\x1b[3~');
    await wait(() => observe().snapshot.subMode === 'confirm-delete', 'delete-confirmation');
    child.stdin.write('\r');
    await wait(() => !fs.existsSync(directory(fixtureIds[index])) && ready(query)
      && !observe().snapshot.ids.includes(fixtureIds[index]) && observe().removals === index, 'delete');
    receipt.deletionMs.push(Date.now() - started);
    if (beforeSync !== undefined) {
      const reads = observe().syncTranscriptReads - beforeSync;
      (receipt.syncTranscriptReadsPerDeletion ??= []).push(reads);
      assert.equal(reads, observe().expectedSyncTranscriptReadsPerDeletion ?? 1, 'synchronous conversation read count');
    }
    assert.equal(observe().begins, 1, 'same browse'); assert.equal(observe().retires, 0, 'not retired');
    assert.equal(current(), fixtureIds[0], 'deletion does not resume');
    if (query) { child.stdin.write('\x7f'.repeat(query.length));
      await wait(() => ready('') && observe().snapshot.ids.length === 6, 'clear'); }
  }
  receipt.checks.retainedSourceAcrossTwoDeletions = observe().begins === 1 && observe().removals === 2 && observe().retires === 0;
  receipt.checks.noRemovedRowsAfterSearchClear = [1, 2].every(index => !observe().snapshot.ids.includes(fixtureIds[index]));
  const survivorFiles = [...beforeFiles].filter(([target]) => [3, 4, 5, 6, 7].some(index => target.startsWith(directory(fixtureIds[index]) + path.sep)));
  receipt.checks.survivorsUnchanged = survivorFiles.every(([target, before]) => fs.readFileSync(target).equals(before));
  child.stdin.write('\x1b'); await wait(() => !observe().snapshot?.title, 'escape');
  receipt.checks.retiredOnClose = observe().retires === 1;
  const stopped = Date.now(); child.stdin.write('\x04');
  receipt.shutdown = await Promise.race([close, pause(6000).then(() => undefined)]); receipt.exitMs = Date.now() - stopped;
  assert.deepEqual(receipt.shutdown, { code: 0, signal: null });
  receipt.checks.cookedInputRestored = JSON.parse(fs.readFileSync(env.CHEERS_PROBE_DEVICE)).cookedFlagsRestored;
  receipt.checks.zeroRequests = observe().requests === 0;
  receipt.checks.configUnchanged = fs.readFileSync(config).equals(beforeConfig);
  assert(Object.values(receipt.checks).every(Boolean), 'checks'); receipt.status = 'passed';
} catch (error) {
  receipt.status = 'failed'; receipt.failure = /^(timeout-|closed-)[\w-]+$/.test(error.message) ? error.message : 'assertion';
  receipt.assertion = error.code === 'ERR_ASSERTION' ? String(error.message).split('\n')[0] : undefined;
  receipt.observation = observe();
} finally {
  clearTimeout(deadline);
  if (!closed) { child.kill('SIGTERM'); await Promise.race([close, pause(3000)]);
    if (!closed) { try { process.kill(-child.pid, 'SIGKILL'); } catch {} await close; } }
  receipt.outputBytes = bytes; output = '';
  fs.rmSync(scratch, { recursive: true, force: true }); receipt.scratchRemoved = !fs.existsSync(scratch);
}
fs.writeFileSync(path.join(archive, mode + '.json'), JSON.stringify(receipt, null, 2) + '\n');
process.stdout.write(JSON.stringify(receipt) + '\n'); process.exitCode = receipt.status === 'passed' ? 0 : 1;
