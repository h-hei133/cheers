import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { StringDecoder } from 'node:string_decoder';
import assert from 'node:assert/strict';
import { checkBuild } from '../../../scripts/start-lib.mjs';
import { createQaPtyEnvironment } from '../../../scripts/qa-pty-env.mjs';

const root = process.cwd(), archive = path.join(root, process.argv[3] ?? '.omx/artifacts/phase20-addition-tab-hover');
const base = path.join(root, '.tmp/tab-hover');
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
delete env.NO_COLOR;
env.FORCE_COLOR = '1';
assert.equal(spawnSync('git', ['init', '-q'], { cwd: project, env, stdio: 'ignore' }).status, 0);
const profile = createProfileContext({ name: 'probe', homeDir: home, env });
const config = path.join(profile.root, 'config.json');
fs.writeFileSync(config, JSON.stringify({ tuiMode: mode, allowedTools: [], enableMcpTools: false, offline: true,
  cacheWarming: 'off', provider: 'openai-compatible', providerCredentials: { 'openai-compatible': {
    apiKey: 'synthetic-fixture', baseUrl: 'https://fixture.invalid/v1', model: 'fixture' } } }));
const fixtureIds = withProfile(profile, () => {
  const manager = new SessionManager(), ids = [];
  for (let index = 0; index < 1; index++) {
    const session = manager.createNew(project);
    manager.addTurn(session.id, { id: 'fixture-message', role: 'user', content: 'Small saved fixture ' + index });
    manager.saveCompleted(session.id); manager.renameSession(session.id, 'removal-fixture-' + index); ids.push(session.id);
  }
  return ids;
});
const projectConfig = path.join(project, '.cheers/config.json');
fs.mkdirSync(path.dirname(projectConfig), { recursive: true }); fs.writeFileSync(projectConfig, '{}');
const beforeProjectConfig = fs.readFileSync(projectConfig);
const models = path.join(profile.root, 'models.json');
fs.writeFileSync(models, '{}');
const beforeConfig = fs.readFileSync(config);
const geometryFile = path.join(scratch, 'geometry.json');
fs.writeFileSync(geometryFile, JSON.stringify({ width: 120, height: 60 }));
env.CHEERS_PROBE_GEOMETRY = geometryFile;
let output = '', bytes = 0, closed = false;
const child = spawn('python3', [path.join(archive, '../phase20-addition-settings-navigation/relay.py'), '--', process.execPath,
  '--import', path.join(archive, 'observe.mjs'), path.join(root, 'scripts/start.mjs'), '--project', project, '--profile', 'probe',
  '--session-id', fixtureIds[0], '--no-context-files', '--no-skills', '--offline'], { cwd: project, env, detached: true });
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
  const until = Date.now() + 10000;
  while (Date.now() < until) {
    assert(bytes <= 2 * 1024 * 1024, 'output cap'); if (predicate()) return;
    assert(!closed, 'closed-' + label); await pause(25);
  }
  throw Error('timeout-' + label);
}
const ready = title => { const s = observe().snapshot;
  return s?.title === title && !s.loading && !s.searching && !s.pending && !s.failed; };
async function focus(id) {
  for (let step = 0; step < 20 && observe().snapshot.current !== id; step++) {
    const previous = observe().snapshot.current; child.stdin.write('\x1b[B');
    await wait(() => observe().snapshot.current !== previous, 'focus');
  }
  assert.equal(observe().snapshot.current, id, 'keyboard focus');
}
async function closePanel() {
  for (let step = 0; step < 5 && observe().snapshot?.title; step++) {
    await pause(650);
    const before = observe().renders; child.stdin.write('\x1b');
    await wait(() => observe().renders > before, 'close-panel');
  }
  assert(!observe().snapshot?.title, 'closed panel');
  await pause(650);
}
try {
  await wait(() => output.includes('Ask anything, or / for commands'), 'startup');
  child.stdin.write('/settings\r');
  await wait(() => observe().snapshot?.title?.startsWith('Settings') && !observe().snapshot.loading, 'settings');
  assert(observe().snapshot.bandAvailable, 'hover color available');
  const key = async (bytes, predicate, label) => {
    child.stdin.write(bytes); await wait(() => predicate(observe().snapshot), label);
  };
  const mouse = async (kind, point, predicate, label) => {
    const before = observe().mouse.length, origin = observe().origin;
    assert(Number.isInteger(origin), 'painted overlay origin');
    const code = kind === 'move' ? 35 : 0;
    child.stdin.write(`\x1b[<${code};${point.from + 1};${origin + point.row + 1}${kind === 'release' ? 'm' : 'M'}`);
    await wait(() => observe().mouse.length > before && predicate(observe().snapshot), label);
  };
  const tab = id => {
    const found = observe().snapshot.chips.find(span => span.id === id);
    assert(found, 'painted tab ' + id); return found;
  };
  await key('\x1b[C', s => s.category === 'Appearance', 'appearance');
  for (const width of [40, 80, 120]) {
    const previous = observe().renders;
    fs.writeFileSync(geometryFile, JSON.stringify({ width, height: 60 })); child.kill('SIGUSR1');
    await wait(() => observe().renders > previous && observe().snapshot.width === width, 'resize-' + width);
    await focus('theme');
    const model = tab('Model'), before = observe().snapshot;
    const onModel = s => s.hovered?.chip && s.hovered.id === 'Model' && s.bandRows.includes(model.row) && s.rowHashes.every((hash, index) => index === model.row || hash === before.rowHashes[index])
      && s.rowHashes[model.row] !== before.rowHashes[model.row];
    await mouse('move', model, onModel, 'model-hover-' + width);
    assert.equal(observe().snapshot.category, before.category); assert.equal(observe().snapshot.current, 'theme');
    assert.equal(observe().snapshot.text, before.text);
    await mouse('move', model, onModel, 'same-cell-' + width);
    await mouse('move', { from: 0, row: 0 }, s => !s.hovered && s.rowHashes.every((hash, index) => hash === before.rowHashes[index]), 'leave-tab-' + width);
    await mouse('move', tab('Appearance'), s => s.hovered?.id === 'Appearance' && s.rowHashes.every((hash, index) => hash === before.rowHashes[index]), 'active-tab-' + width);
    await mouse('move', model, onModel, 'return-tab-' + width);
    await key('\r', s => s.title?.startsWith('Theme') && !s.loading, 'enter-original-field-' + width);
    await pause(650);
    await key('\x1b', s => s.category === 'Appearance' && s.current === 'theme' && !s.loading, 'field-back-' + width);
    assert(!observe().snapshot.hovered, 'old hover retired on return');
    await mouse('move', tab('Model'), onModel, 'hover-before-click-' + width);
    const click = tab('Model');
    await mouse('press', click, s => s.category === 'Model' && !s.hovered, 'click-model-' + width);
    await mouse('release', click, s => s.category === 'Model' && !s.hovered, 'release-model-' + width);
    await key('\x1b[D', s => s.category === 'Appearance' && s.current === 'theme', 'keyboard-return-' + width);
    receipt.widths.push({ width, hoverOnlyOnTab: true, unchangedTextAndField: true,
      sameCellMotionHandled: true, leaveClears: true, activeStyleWins: true, enterOriginalField: true, clickAndKeyboardReturn: true });
  }
  await closePanel(); child.stdin.write('/model\r'); await wait(() => ready('Model'), 'model-browser');
  const initial = observe().snapshot, sidebar = initial.chips.find(span => span.id !== initial.category);
  assert(sidebar, 'painted sidebar item');
  await mouse('move', sidebar, s => s.hovered?.sidebar && !s.hovered.chip && s.hovered.id === sidebar.id
    && s.bandRows.includes(sidebar.row), 'model-sidebar-hover');
  assert.equal(observe().snapshot.current, initial.current); assert.equal(observe().snapshot.category, initial.category);
  receipt.checks.modelSidebarHover = observe().snapshot.placement === 'side';
  await closePanel();
  receipt.checks.settingsWidths = receipt.widths.length === 3;
  const stopped = Date.now(); child.stdin.write('\x04');
  receipt.shutdown = await Promise.race([close, pause(6000).then(() => undefined)]); receipt.exitMs = Date.now() - stopped;
  assert.deepEqual(receipt.shutdown, { code: 0, signal: null });
  receipt.checks.cookedInputRestored = JSON.parse(fs.readFileSync(env.CHEERS_PROBE_DEVICE)).cookedFlagsRestored;
  receipt.checks.zeroRequests = observe().requests === 0;
  receipt.checks.configUnchanged = fs.readFileSync(config).equals(beforeConfig);
  receipt.checks.projectConfigUnchanged = fs.readFileSync(projectConfig).equals(beforeProjectConfig);
  receipt.checks.modelsUnchanged = fs.readFileSync(models, 'utf8') === '{}';
  assert(Object.values(receipt.checks).every(Boolean), 'checks'); receipt.status = 'passed';
} catch (error) {
  receipt.status = 'failed'; receipt.failure = /^(timeout-|closed-)[\w-]+$/.test(error.message) ? error.message : 'assertion';
  receipt.errorType = error.name;
  if (/^Cannot read properties of undefined/.test(error.message)) receipt.harnessFailure = error.message;
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
