import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { checkBuild } from '../../../scripts/start-lib.mjs';
import { createQaPtyEnvironment } from '../../../scripts/qa-pty-env.mjs';
const root = process.cwd(), archive = path.join(root, '.omx/artifacts/phase20-addition-draft-shortcuts');
const base = path.join(root, '.tmp/draft-shortcuts'); fs.mkdirSync(base, { recursive: true });
const mode = process.argv[2] ?? 'regular'; assert(['regular', 'fullscreen'].includes(mode));
const build = checkBuild({ root, dist: root + '/packages/ts-shell/dist', version: JSON.parse(fs.readFileSync('packages/ts-shell/package.json')).version, executablePolicy: 'ignore' });
assert(build.ok); const built = path.dirname(path.dirname(build.entry));
const load = file => import(pathToFileURL(path.join(built, file)));
const { createProfileContext, withProfile } = await load('core/paths/profile/context.js');
const { SessionManager } = await load('session/SessionManager.js');
(await load('observability/structuredLogger.js')).setFilePersistenceEnabled(false);
const scratch = fs.mkdtempSync(path.join(base, 'run-')), home = path.join(scratch, 'home'), project = path.join(scratch, 'project');
fs.mkdirSync(home); fs.mkdirSync(project);
const observation = path.join(scratch, 'observe.json'), device = path.join(scratch, 'device.json'), editor = path.join(scratch, 'editor.mjs');
fs.writeFileSync(editor, "import fs from 'node:fs'; fs.writeFileSync(process.argv[2], 'rewritten draft\\n');");
const env = { ...createQaPtyEnvironment(home, project), CHEERS_PROVIDER_MODE: 'real', NODE_OPTIONS: '--max-old-space-size=768',
  CHEERS_PROBE_BUILD: built, CHEERS_PROBE_RECEIPT: observation, CHEERS_PROBE_DEVICE: device, CHEERS_EDITOR: `"${process.execPath}" "${editor}"` };
assert.equal(spawnSync('rtk', ['git', 'init', '-q'], { cwd: project, env, stdio: 'ignore' }).status, 0);
let requests = 0; const sockets = new Set();
const server = http.createServer((request, response) => { requests++; request.resume(); response.writeHead(503, { 'content-type': 'application/json' }); response.end('{}'); });
server.on('connection', socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const profile = createProfileContext({ name: 'probe', homeDir: home, env });
const bindingsFile = path.join(profile.root, 'keybindings.json');
const bindings = { 'tui.input.stash': ['alt+j', 'alt+k'], 'tui.editor.undo': ['alt+j', 'alt+z'], 'app.retry': ['alt+j'] };
fs.writeFileSync(bindingsFile, JSON.stringify(bindings));
fs.writeFileSync(path.join(profile.root, 'config.json'), JSON.stringify({ tuiMode: mode, enableMcpTools: false, offline: true, cacheWarming: 'off', provider: 'openai-compatible',
  hooks: {}, providerCredentials: { 'openai-compatible': { apiKey: 'synthetic-fixture', baseUrl: `http://127.0.0.1:${server.address().port}/v1`, model: 'fixture' } } }));
const sessionId = withProfile(profile, () => { const manager = new SessionManager(), session = manager.createNew(project);
  manager.addTurn(session.id, { id: 'fixture-message', role: 'user', content: 'Public fixture saved history' }); manager.saveCompleted(session.id); return session.id; });
const configBefore = fs.readFileSync(path.join(profile.root, 'config.json'));
const observe = () => { try { return JSON.parse(fs.readFileSync(observation)); } catch { return {}; } };
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const receipt = { mode, buildId: build.manifest.buildId, inputsDigest: build.manifest.inputsDigest, savedMessages: 1, status: 'not-run', stages: [],
  limits: { heapMiB: 768, wallSeconds: 45, outputBytes: 2097152 } };
let output = '', bytes = 0, closed = false, overflow = false, timedOut = false;
const child = spawn('python3', [path.join(root, '.omx/artifacts/phase20-addition-live-cli/relay.py'), '--', process.execPath,
  '--import', path.join(archive, 'observe.mjs'), path.join(root, 'scripts/start.mjs'), '--project', project, '--profile', 'probe', '--session-id', sessionId,
  '--no-context-files', '--no-skills', '--offline'], { cwd: project, env, detached: true });
const close = new Promise(resolve => child.once('close', (code, signal) => { closed = true; resolve({ code, signal }); }));
for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => { bytes += chunk.length; if (bytes <= 2 * 1024 * 1024) output += chunk.toString('utf8'); else { overflow = true; child.kill('SIGTERM'); } });
const deadline = setTimeout(() => { timedOut = true; child.kill('SIGTERM'); }, 45000);
async function wait(predicate, label) { const until = Date.now() + 10000; while (Date.now() < until) {
  if (predicate()) return; assert(!closed, 'closed-' + label); assert(!overflow); await pause(25); } throw Error('timeout-' + label); }
async function draft(text) { child.stdin.write((observe().draft ? '\x03' : '') + '\x1b[200~' + text + '\x1b[201~'); await wait(() => observe().draft === text, 'draft-' + text); }
async function key(sequence, text, toast) {
  const start = output.length, renders = observe().renders; child.stdin.write(sequence);
  await wait(() => observe().renders > renders && observe().draft === text && (!toast || observe().toast === toast), 'key-' + sequence.charCodeAt(0));
  if (toast) await wait(() => output.slice(start).includes(toast), 'painted-notice');
}
async function reload(config) {
  fs.writeFileSync(bindingsFile, JSON.stringify(config)); const before = observe();
  await draft('/reload'); child.stdin.write('\r');
  await wait(() => observe().reloads > before.reloads && observe().ends > before.ends && observe().draft === '', 'reload');
}
try {
  await wait(() => output.includes('Ask anything, or / for commands') && observe().sessionId, 'startup'); assert.equal(observe().sessionId, sessionId);
  assert.equal(observe().stashKey, 'alt+k'); assert.equal(observe().undoKey, 'alt+z');
  await draft('first original'); await key('\x1bk', '', 'Draft stashed · alt+k takes it back'); await key('\x1bk', 'first original');
  receipt.stages.push({ action: 'conflicted stash primary', advertised: 'alt+k', originalRestored: true, noticePainted: true });
  await key('\x07', 'rewritten draft', 'Draft rewritten · alt+k brings the original back'); await key('\x1bk', 'first original');
  receipt.stages.push({ action: 'external editor with empty slot', advertised: 'alt+k', originalRestored: true, noticePainted: true });
  await draft('second original'); await key('\x07', 'rewritten draft', 'Draft rewritten · the slot already held a draft, so this original is only reachable with alt+z');
  await key('\x1bz', 'second original'); await key('\x1bk', 'rewritten draft');
  await draft(''); await key('\x1bk', 'second original');
  receipt.stages.push({ action: 'external editor with occupied slot', advertised: 'alt+z', originalRestored: true, olderSlotRetained: true, noticePainted: true });
  await reload({ 'tui.input.stash': [], 'tui.editor.undo': [] });
  await draft('unbound original'); await key('\x07', 'rewritten draft', 'Draft rewritten · original stashed (shortcut unbound)');
  assert.equal(observe().stashKey, undefined); assert.equal(observe().undoKey, undefined);
  await reload(bindings); await key('\x1bk', 'unbound original');
  receipt.stages.push({ action: 'unbound stash then actual reload', originalRetainedAndRestored: true, noDefaultKeyAdvertised: true, noticePainted: true });
  await key('\x1bk', '', 'Draft stashed · alt+k takes it back');
  await reload({ 'tui.input.stash': ['alt+k'], 'tui.editor.undo': [] });
  await draft('unbound second'); await key('\x07', 'rewritten draft', 'Draft rewritten · the slot already held a draft; undo shortcut is unbound');
  await key('\x1bk', 'unbound original');
  receipt.stages.push({ action: 'unbound undo with occupied slot', olderSlotRetained: true, noDefaultKeyAdvertised: true, noticePainted: true });
  await draft(''); child.stdin.write('\x04'); receipt.shutdown = await Promise.race([close, pause(6000).then(() => undefined)]);
  assert.deepEqual(receipt.shutdown, { code: 0, signal: null }); receipt.device = JSON.parse(fs.readFileSync(device)); assert(receipt.device.cookedFlagsRestored);
  assert.equal(requests, 0); assert(fs.readFileSync(path.join(profile.root, 'config.json')).equals(configBefore));
  assert.deepEqual(fs.readdirSync(project), ['.git']); receipt.configurationUnchanged = true; receipt.projectUnchanged = true; receipt.reloads = observe().reloads; receipt.status = 'passed';
} catch (error) { receipt.status = 'failed'; receipt.failure = error.message.split('\n')[0]; receipt.observation = observe(); }
finally {
  clearTimeout(deadline); if (!closed) { child.kill('SIGTERM'); await Promise.race([close, pause(3000)]); if (!closed) { try { process.kill(-child.pid, 'SIGKILL'); } catch {} await close; } }
  for (const socket of sockets) socket.destroy(); await new Promise(resolve => server.close(resolve));
  receipt.requests = requests; receipt.outputBytes = bytes; receipt.outputLimitExceeded = overflow; receipt.deadlineExceeded = timedOut; output = '';
  fs.rmSync(scratch, { recursive: true, force: true }); receipt.scratchRemoved = !fs.existsSync(scratch);
  fs.writeFileSync(path.join(archive, mode + '-receipt.json'), JSON.stringify(receipt, null, 2) + '\n'); console.log(JSON.stringify(receipt));
}
if (receipt.status !== 'passed') process.exitCode = 1;
