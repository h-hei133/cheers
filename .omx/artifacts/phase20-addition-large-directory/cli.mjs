import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { StringDecoder } from 'node:string_decoder';
import assert from 'node:assert/strict';
import { checkBuild } from '../../../scripts/start-lib.mjs';
import { createQaPtyEnvironment } from '../../../scripts/qa-pty-env.mjs';

const root = process.cwd(), archive = path.join(root, '.omx/artifacts/phase20-addition-large-directory');
const base = path.join(root, '.tmp/catalog-large-directory');
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
assert(['regular', 'fullscreen'].includes(mode), 'run one terminal mode per process');
const fixtureCount = 2307, scratch = fs.mkdtempSync(path.join(base, 'run-'));
const home = path.join(scratch, 'home'), project = path.join(scratch, 'project');
fs.mkdirSync(home); fs.mkdirSync(project);
const env = { ...createQaPtyEnvironment(home, project), NODE_OPTIONS: '--max-old-space-size=768',
  CHEERS_PROBE_BUILD: built, CHEERS_PROBE_RECEIPT: path.join(scratch, 'observe.json'),
  CHEERS_PROBE_DEVICE: path.join(scratch, 'device.json') };
assert.equal(spawnSync('git', ['init', '-q'], { cwd: project, env, stdio: 'ignore' }).status, 0);
const profile = createProfileContext({ name: 'probe', homeDir: home, env });
const config = path.join(profile.root, 'config.json');
fs.writeFileSync(config, JSON.stringify({ tuiMode: mode, allowedTools: [], enableMcpTools: false, offline: true,
  cacheWarming: 'off', provider: 'openai-compatible' }));
const fixtureIds = [], fixtureSetupStarted = Date.now();
let fixtureSourceBytes = 0;
withProfile(profile, () => {
  const manager = new SessionManager();
  const current = manager.createNew(project, { title: 'large-directory-0000' });
  manager.addTurn(current.id, { id: 'fixture-message', role: 'user',
    content: 'synthetic large directory history 0000 ' + 'x'.repeat(1400) });
  manager.saveCompleted(current.id); fixtureIds.push(current.id);
  const source = manager.getSessionDirPath(current.id);
  const metadataTemplate = JSON.parse(fs.readFileSync(path.join(source, 'metadata.json'), 'utf8'));
  const stateTemplate = JSON.parse(fs.readFileSync(path.join(source, 'state.json'), 'utf8'));
  const transcriptTemplate = fs.readFileSync(path.join(source, 'transcript.jsonl'), 'utf8').split('\n');
  const sessionRoot = path.dirname(source);
  for (let index = 1; index < fixtureCount; index++) {
    const id = 'sess_probe_' + String(index).padStart(4, '0');
    const title = index === 1 ? 'large-directory-unique-target' : 'large-directory-' + String(index).padStart(4, '0');
    const timestamp = new Date(Date.now() - index * 1000).toISOString();
    const directory = path.join(sessionRoot, id);
    fs.mkdirSync(directory);
    const metadata = { ...metadataTemplate, id, title, createdAt: timestamp, updatedAt: timestamp };
    const header = JSON.parse(transcriptTemplate[0]);
    header.id = id; header.timestamp = timestamp; header.cwd = project;
    const transcript = [JSON.stringify(header), ...transcriptTemplate.slice(1)]
      .join('\n').replaceAll(current.id, id);
    for (const [name, contents] of [['metadata.json', JSON.stringify(metadata) + '\n'],
      ['state.json', JSON.stringify(stateTemplate) + '\n'], ['transcript.jsonl', transcript]]) {
      fs.writeFileSync(path.join(directory, name), contents);
      fixtureSourceBytes += Buffer.byteLength(contents);
    }
    fixtureIds.push(id);
  }
  for (const name of ['metadata.json', 'state.json', 'transcript.jsonl']) {
    fixtureSourceBytes += fs.statSync(path.join(source, name)).size;
  }
});
const fixtureSetupMs = Date.now() - fixtureSetupStarted;
const sessionDirectory = id => withProfile(profile, () => new SessionManager().getSessionDirPath(id));
const current = () => withProfile(profile, () => new SessionManager().getCurrentSessionForProject(project)?.id);
const beforeConfig = fs.readFileSync(config);
let output = '', bytes = 0, closed = false;
const child = spawn('python3', [path.join(root, '.omx/artifacts/phase20-addition-live-cli/relay.py'), '--', process.execPath,
  '--import', path.join(archive, 'observe.mjs'), path.join(root, 'scripts/start.mjs'), '--project', project,
  '--profile', 'probe', '--session-id', fixtureIds[0], '--no-context-files', '--no-skills', '--offline'],
  { cwd: project, env, detached: true });
const close = new Promise(resolve => child.once('close', (code, signal) => { closed = true; resolve({ code, signal }); }));
const receipt = { mode, fixtureCount, messagesPerFixture: 1, syntheticContentPaddingChars: 1400,
  fixtureSourceBytes, fixtureSetupMs, buildId: build.manifest.buildId, inputsDigest: build.manifest.inputsDigest,
  providerMode: 'offline-no-credential', status: 'not-run', checks: {}, interactionMs: [], deletionMs: [] };
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const observe = () => { try { return JSON.parse(fs.readFileSync(env.CHEERS_PROBE_RECEIPT)); } catch { return {}; } };
for (const stream of [child.stdout, child.stderr]) {
  const decoder = new StringDecoder('utf8');
  stream.on('data', chunk => { bytes += chunk.length;
    if (bytes <= 2 * 1024 * 1024) output += decoder.write(chunk); else child.kill('SIGTERM'); });
}
const deadline = setTimeout(() => child.kill('SIGTERM'), 90000);
async function wait(predicate, label, timeoutMs = 20000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    assert(bytes <= 2 * 1024 * 1024, 'output cap'); if (predicate()) return;
    assert(!closed, 'closed-' + label); await pause(10);
  }
  throw Error('timeout-' + label);
}
const snapshot = () => observe().snapshot;
const complete = () => snapshot()?.title === 'Resume session'
  && observe().catalogSnapshots?.at(-1)?.status === 'complete' && !snapshot()?.loading && !snapshot()?.searching;
try {
  await wait(() => output.includes('Ask anything, or / for commands'), 'startup');
  child.stdin.write('/resume\r'); const openedAt = Date.now();
  await wait(() => snapshot()?.title === 'Resume session' && !snapshot()?.loading, 'first-frame');
  receipt.firstFrameMs = Date.now() - openedAt;
  receipt.firstProgress = observe().catalogSnapshots?.[0];
  receipt.checks.firstFramePrecedesCompleteScan = receipt.firstProgress?.status === 'scanning'
    && receipt.firstProgress.scanned < fixtureCount;
  assert(receipt.checks.firstFramePrecedesCompleteScan, 'first frame must precede complete catalogue scan');
  await wait(() => snapshot()?.ids.length > 1
    && observe().catalogSnapshots?.at(-1)?.status === 'scanning', 'scan-progress');
  const beforeInteraction = snapshot()?.current, responsiveStart = Date.now(); child.stdin.write('\x1b[B');
  await wait(() => snapshot()?.current !== beforeInteraction
    && observe().catalogSnapshots?.at(-1)?.status === 'scanning', 'interaction', 15000);
  receipt.interactionMs.push(Date.now() - responsiveStart);
  await wait(complete, 'scan-complete', 30000);
  receipt.scanFromOpenMs = Date.now() - openedAt;
  receipt.scanAfterFirstFrameMs = receipt.scanFromOpenMs - receipt.firstFrameMs;
  const snapshots = observe().catalogSnapshots ?? [];
  receipt.catalogFinal = snapshots.at(-1);
  receipt.catalogSnapshotCount = snapshots.length;
  receipt.checks.completeCatalog = receipt.catalogFinal?.status === 'complete'
    && receipt.catalogFinal.scanned === fixtureCount && receipt.catalogFinal.total === fixtureCount;
  receipt.checks.interactionDuringScan = receipt.interactionMs.length === 1;
  assert(receipt.checks.completeCatalog, 'complete catalog count');
  assert(receipt.checks.interactionDuringScan, 'interaction during catalog scan');

  const query = 'large-directory-unique-target';
  const searchStarted = Date.now(); child.stdin.write(query);
  await wait(() => snapshot()?.filter === query && !snapshot()?.searching
    && snapshot()?.ids.length === 1 && snapshot()?.ids[0] === fixtureIds[1], 'search');
  receipt.searchMs = Date.now() - searchStarted;
  receipt.checks.uniqueSearchResult = snapshot()?.ids.length === 1 && snapshot()?.ids[0] === fixtureIds[1];
  const beforeBegins = observe().begins, deleteStarted = Date.now();
  child.stdin.write('\x1b[3~'); await wait(() => snapshot()?.subMode === 'confirm-delete', 'delete-confirmation');
  child.stdin.write('\r');
  await wait(() => !fs.existsSync(sessionDirectory(fixtureIds[1])) && snapshot()?.filter === query
    && !snapshot()?.ids.includes(fixtureIds[1]) && observe().removals === 1, 'delete');
  receipt.deletionMs.push(Date.now() - deleteStarted);
  receipt.checks.sameBrowseAfterDelete = observe().begins === beforeBegins && observe().retires === 0;
  receipt.checks.targetDeleted = !fs.existsSync(sessionDirectory(fixtureIds[1]));
  receipt.checks.configUnchanged = fs.readFileSync(config).equals(beforeConfig);
  child.stdin.write('\x1b'); await wait(() => !snapshot()?.title, 'escape');
  const cancelledIndex = observe().catalogSnapshots?.length ?? 0;
  const cancelledBefore = observe().cancelledBrowses ?? 0;
  child.stdin.write('/resume\r');
  await wait(() => snapshot()?.title === 'Resume session' && !snapshot()?.loading, 'reopen-for-cancel');
  await wait(() => {
    const recent = observe().catalogSnapshots?.slice(cancelledIndex) ?? [];
    const last = recent.at(-1);
    return recent.length > 0 && last?.status === 'scanning' && last.scanned >= 16 && last.scanned < fixtureCount;
  }, 'active-cancel-scan');
  const pagesBeforeCancel = observe().catalogSnapshots.length;
  child.stdin.write('\x1b'); await wait(() => !snapshot()?.title, 'cancel-close');
  receipt.checks.catalogBrowseAbortedOnClose = (observe().cancelledBrowses ?? 0) === cancelledBefore + 1;
  await pause(200);
  receipt.checks.noCatalogPagesAfterCancel = observe().catalogSnapshots.length === pagesBeforeCancel;
  const stopped = Date.now(); child.stdin.write('\x04');
  receipt.shutdown = await Promise.race([close, pause(6000).then(() => undefined)]); receipt.exitMs = Date.now() - stopped;
  assert.deepEqual(receipt.shutdown, { code: 0, signal: null });
  receipt.checks.cookedInputRestored = JSON.parse(fs.readFileSync(env.CHEERS_PROBE_DEVICE)).cookedFlagsRestored;
  receipt.checks.zeroRequests = observe().requests === 0;
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
  fs.rmSync(scratch, { recursive: true, force: true });
  receipt.scratchRemoved = !fs.existsSync(scratch);
  receipt.checks.scratchRemoved = receipt.scratchRemoved;
}
fs.writeFileSync(path.join(archive, mode + '.json'), JSON.stringify(receipt, null, 2) + '\n');
process.stdout.write(JSON.stringify(receipt) + '\n'); process.exitCode = receipt.status === 'passed' ? 0 : 1;
