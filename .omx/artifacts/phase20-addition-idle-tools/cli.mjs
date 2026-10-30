import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { StringDecoder } from 'node:string_decoder';
import assert from 'node:assert/strict';
import { checkBuild } from '../../../scripts/start-lib.mjs';
import { createQaPtyEnvironment } from '../../../scripts/qa-pty-env.mjs';

const root = process.cwd(), archive = path.join(root, '.omx/artifacts/phase20-addition-idle-tools');
const base = path.join(root, '.tmp/idle-tools');
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
const mode = process.argv[2] ?? 'regular', expected = process.argv[3] ?? 'fixed';
assert(['baseline', 'fixed'].includes(expected));
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
const sessionId = withProfile(profile, () => {
  const manager = new SessionManager(), session = manager.createNew(project);
  manager.addTurn(session.id, { id: 'fixture-message', role: 'user', content: 'Small saved fixture' });
  manager.saveCompleted(session.id); return session.id;
});
const projectConfig = path.join(project, '.cheers/config.json');
fs.mkdirSync(path.dirname(projectConfig), { recursive: true }); fs.writeFileSync(projectConfig, '{}');
const models = path.join(profile.root, 'models.json'); fs.writeFileSync(models, '{"providers":{}}');
const before = [config, projectConfig, models].map(file => fs.readFileSync(file));
const geometryFile = path.join(scratch, 'geometry.json');
fs.writeFileSync(geometryFile, JSON.stringify({ width: 80, height: 32 })); env.CHEERS_PROBE_GEOMETRY = geometryFile;
let output = '', bytes = 0, closed = false;
const child = spawn('python3', [path.join(archive, 'relay.py'), '--', process.execPath,
  '--import', path.join(archive, 'observe.mjs'), path.join(root, 'scripts/start.mjs'), '--project', project, '--profile', 'probe',
  '--session-id', sessionId, '--no-context-files', '--no-skills', '--offline'], { cwd: project, env, detached: true });
const close = new Promise(resolve => child.once('close', (code, signal) => { closed = true; resolve({ code, signal }); }));
const receipt = { mode, buildId: build.manifest.buildId, inputsDigest: build.manifest.inputsDigest,
  fixtures: 1, messagesPerFixture: 1, providerMode: 'synthetic', status: 'not-run', checks: {}, widths: [] };
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const observe = () => { try { return JSON.parse(fs.readFileSync(env.CHEERS_PROBE_RECEIPT)); } catch { return {}; } };
for (const stream of [child.stdout, child.stderr]) {
  const decoder = new StringDecoder('utf8');
  stream.on('data', chunk => { bytes += chunk.length;
    if (bytes <= 2 * 1024 * 1024) output += decoder.write(chunk); else child.kill('SIGTERM'); });
}
const deadline = setTimeout(() => child.kill('SIGTERM'), 45000);
async function wait(predicate, label) {
  const until = Date.now() + 8000;
  while (Date.now() < until) {
    assert(bytes <= 2 * 1024 * 1024, 'output cap'); if (predicate()) return;
    assert(!closed, 'closed-' + label); await pause(20);
  }
  throw Error('timeout-' + label);
}
try {
  await wait(() => output.includes('Ask anything, or / for commands'), 'startup');
  for (let index = 1; index <= 3; index++) {
    child.stdin.write('x');
    await wait(() => observe().snapshot?.text === 'x'.repeat(index), 'draft-' + index);
    await pause(750);
  }
  const observed = observe();
  assert(observed.toolCalls >= 3, 'actual tool roster calls');
  if (expected === 'baseline') assert(observed.toolTranscriptReads >= 3, 'baseline eager transcript reads');
  else assert.equal(observed.toolTranscriptReads, 0, 'idle tool projection transcript reads');
  receipt.checks.toolCalls = observed.toolCalls;
  receipt.checks.toolTranscriptReads = observed.toolTranscriptReads;
  receipt.checks.totalSyncTranscriptReads = observed.totalSyncTranscriptReads;
  child.stdin.write('\x03'); await wait(() => observe().snapshot?.text === '', 'clear');
  const stopped = Date.now(); child.stdin.write('\x04');
  receipt.shutdown = await Promise.race([close, pause(6000).then(() => undefined)]); receipt.exitMs = Date.now() - stopped;
  assert.deepEqual(receipt.shutdown, { code: 0, signal: null });
  receipt.checks.cookedInputRestored = JSON.parse(fs.readFileSync(env.CHEERS_PROBE_DEVICE)).cookedFlagsRestored;
  receipt.checks.zeroRequests = observe().requests === 0;
  receipt.checks.filesUnchanged = [config, projectConfig, models].every((file, index) => fs.readFileSync(file).equals(before[index]));
  assert(receipt.checks.cookedInputRestored && receipt.checks.zeroRequests && receipt.checks.filesUnchanged, 'checks'); receipt.status = 'passed';
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
receipt.expected = expected;
fs.writeFileSync(path.join(archive, mode + '-' + expected + '.json'), JSON.stringify(receipt, null, 2) + '\n');
const { observation, ...summary } = receipt;
process.stdout.write(JSON.stringify(summary) + '\n'); process.exitCode = receipt.status === 'passed' ? 0 : 1;
