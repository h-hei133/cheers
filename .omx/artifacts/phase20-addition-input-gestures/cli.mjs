import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { StringDecoder } from 'node:string_decoder';
import assert from 'node:assert/strict';
import { checkBuild } from '../../../scripts/start-lib.mjs';
import { createQaPtyEnvironment } from '../../../scripts/qa-pty-env.mjs';

const root = process.cwd(), archive = path.join(root, '.omx/artifacts/phase20-addition-input-gestures');
const base = path.join(root, '.tmp/input-gestures');
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
const paste = text => '\x1b[200~' + text + '\x1b[201~';
async function key(input, predicate, label) { child.stdin.write(input); await wait(() => predicate(observe().snapshot), label); }
async function clear() { await key('\x03', s => s?.text === '', 'clear'); await pause(650); }
const mouse = (point, kind = 'press') => `\x1b[<${kind === 'drag' ? 32 : 0};${point.column + 1};${point.row + 1}${kind === 'release' ? 'm' : 'M'}`;
try {
  await wait(() => output.includes('Ask anything, or / for commands'), 'startup');
  const long = 'long text\n'.repeat(8);
  // One transport write proves the repeat gesture even on a loaded CI host.
  await key(paste(long) + paste('different clipboard'), s => s?.text === long && s.cursor === long.length, 'immediate-repeat');
  receipt.checks.immediateRepeat = true;
  await key('\x1a', s => /^\[#1 pasted /.test(s?.text ?? ''), 'undo-expansion');
  const token = observe().snapshot.text;
  await key(paste('next'), s => s.text === token + 'next', 'undo-invalidates');
  receipt.checks.undoInvalidates = true; await clear();
  await key(paste(long), s => /^\[#2 pasted /.test(s.text), 'hold-expired');
  const expired = observe().snapshot.text; await pause(1300);
  await key(paste('later'), s => s.text === expired + 'later', 'expired');
  receipt.checks.expiredKeepsClipboard = true; await clear();
  await key(paste(long), s => /^\[#3 pasted /.test(s.text), 'hold-edit');
  const edited = observe().snapshot.text;
  await key('!', s => s.text === edited + '!', 'edit');
  await key('\x7f', s => s.text === edited, 'delete-edit');
  await key(paste('next'), s => s.text === edited + 'next', 'edited');
  receipt.checks.editInvalidates = true; await clear();
  const source = 'abc 中😀e\u0301 long text '.repeat(3) + '\nnext row';
  await key(paste(source), s => s.text === source, 'small-draft');
  for (const width of [40, 80, 120]) {
    const previous = observe().renders;
    fs.writeFileSync(geometryFile, JSON.stringify({ width, height: 32 })); child.kill('SIGUSR1');
    await wait(() => observe().renders > previous && observe().snapshot.width === width, 'resize-' + width);
    const geometry = observe().snapshot.geometry, offset = source.indexOf('中');
    const row = geometry?.layout.rows.find(row => row.kind === 'content' && row.cells.some(cell => cell.sourceStart === offset));
    const cell = row?.cells.find(cell => cell.sourceStart === offset);
    const point = mode === 'regular' ? { row: 30, column: 5 }
      : { row: geometry.top + row.screenRow, column: cell.columnStart + 1 };
    const events = observe().pointers.length, cursor = observe().snapshot.cursor;
    child.stdin.write(mouse(point) + mouse(point, 'release'));
    if (mode === 'fullscreen') await wait(() => observe().pointers.length >= events + 2 && observe().snapshot.cursor === offset, 'click-' + width);
    else { await pause(120); assert.equal(observe().snapshot.cursor, cursor); assert.equal(observe().pointers.length, events); }
    if (mode === 'fullscreen') {
      const start = observe().pointers.length;
      child.stdin.write(mouse(point) + mouse({ ...point, column: point.column + 2 }, 'drag') + mouse(point, 'release'));
      await wait(() => observe().pointers.length >= start + 3, 'drag-' + width);
      assert(observe().pointers.slice(start).every(event => event.offset === undefined), 'drag never positions caret');
      await key(paste('!'), s => s.text === source.slice(0, offset) + '!' + source.slice(offset), 'click-edit-' + width);
      await key('\x1a', s => s.text === source, 'undo-click-edit-' + width);
      await pause(550); // End the multi-click run before testing another single click.
    }
    receipt.widths.push({ width, mappedWideCell: mode === 'fullscreen', nativeMouseRetained: mode === 'regular', drag: mode === 'fullscreen' });
  }
  if (mode === 'fullscreen') {
    const geometry = observe().snapshot.geometry, row = geometry.layout.rows.find(row => row.kind === 'content');
    const point = { row: geometry.top + row.screenRow, column: row.contentColumn };
    const events = observe().pointers.length, cursor = observe().snapshot.cursor;
    child.stdin.write(mouse(point)); await wait(() => observe().pointers.length > events, 'stale-press');
    fs.writeFileSync(geometryFile, JSON.stringify({ width: 40, height: 32 })); child.kill('SIGUSR1');
    await wait(() => observe().snapshot.width === 40, 'stale-resize');
    child.stdin.write(mouse(point, 'release')); await wait(() => observe().pointers.length > events + 1, 'stale-release');
    assert.equal(observe().pointers.at(-1).offset, undefined); assert.equal(observe().snapshot.cursor, cursor);
    receipt.checks.staleResizeRejected = true;
  }
  await clear();
  const stopped = Date.now(); child.stdin.write('\x04');
  receipt.shutdown = await Promise.race([close, pause(6000).then(() => undefined)]); receipt.exitMs = Date.now() - stopped;
  assert.deepEqual(receipt.shutdown, { code: 0, signal: null });
  receipt.checks.cookedInputRestored = JSON.parse(fs.readFileSync(env.CHEERS_PROBE_DEVICE)).cookedFlagsRestored;
  receipt.checks.zeroRequests = observe().requests === 0;
  receipt.checks.filesUnchanged = [config, projectConfig, models].every((file, index) => fs.readFileSync(file).equals(before[index]));
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
const { observation, ...summary } = receipt;
process.stdout.write(JSON.stringify(summary) + '\n'); process.exitCode = receipt.status === 'passed' ? 0 : 1;
