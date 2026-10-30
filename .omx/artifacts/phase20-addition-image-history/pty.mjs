import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { checkBuild } from '../../../scripts/start-lib.mjs';
import { createQaPtyEnvironment } from '../../../scripts/qa-pty-env.mjs';
import { text, imageData } from '../phase20-addition-paste-retention/fixture.mjs';
const root = process.cwd(), archive = path.join(root, '.omx/artifacts/phase20-addition-image-history');
const base = path.join(root, '.tmp/image-history'); fs.mkdirSync(base, { recursive: true });
const mode = process.argv[2] ?? 'regular'; assert(['regular', 'fullscreen'].includes(mode));
const build = checkBuild({ root, dist: root + '/packages/ts-shell/dist', version: JSON.parse(fs.readFileSync('packages/ts-shell/package.json')).version, executablePolicy: 'ignore' });
assert(build.ok); const built = path.dirname(path.dirname(build.entry));
const load = file => import(pathToFileURL(path.join(built, file)));
const { createProfileContext, withProfile } = await load('core/paths/profile/context.js');
const { SessionManager } = await load('session/SessionManager.js');
(await load('observability/structuredLogger.js')).setFilePersistenceEnabled(false);
const scratch = fs.mkdtempSync(path.join(base, 'run-')), home = path.join(scratch, 'home'), project = path.join(scratch, 'project');
fs.mkdirSync(home); fs.mkdirSync(project);
const observation = path.join(scratch, 'observe.json'), device = path.join(scratch, 'device.json');
const env = { ...createQaPtyEnvironment(home, project), CHEERS_PROVIDER_MODE: 'real', NODE_OPTIONS: '--max-old-space-size=768',
  CHEERS_PROBE_BUILD: built, CHEERS_PROBE_RECEIPT: observation, CHEERS_PROBE_DEVICE: device };
assert.equal(spawnSync('rtk', ['git', 'init', '-q'], { cwd: project, env, stdio: 'ignore' }).status, 0);
let requests = 0, readiness = 0, rejectedRequests = 0;
const sockets = new Set(), wire = [];
const server = http.createServer((request, response) => {
  if (request.method === 'GET' && request.url === '/v1/models') {
    request.resume(); readiness++; response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ data: [{ id: 'fixture' }] })); return;
  }
  if (request.method !== 'POST' || request.url !== '/v1/chat/completions') {
    request.resume(); rejectedRequests++; response.writeHead(400); response.end('{}'); return;
  }
  let body = '';
  request.on('data', chunk => { body += chunk; if (body.length > 512 * 1024) request.destroy(); });
  request.on('end', () => {
    const parsed = JSON.parse(body); body = ''; requests++;
    const users = parsed.messages.filter(message => message.role === 'user');
    const user = users.find(message => Array.isArray(message.content) && JSON.stringify(message.content).includes(imageData));
    const blocks = Array.isArray(user?.content) ? user.content : [];
    const wireText = blocks.filter(block => block.type === 'text').map(block => block.text).join('');
    wire.push({ textMatches: requests === 1 ? wireText.endsWith('\n\n' + text) && wireText.split(text).length === 2 : wireText === text,
      imageMatches: blocks.filter(block => block.type === 'image_url').length === 1
        && blocks.find(block => block.type === 'image_url').image_url.url === 'data:image/png;base64,' + imageData,
      noLiteralTokens: !!user && !JSON.stringify(user).includes('[#'),
      imageBlocks: users.reduce((count, message) => count + (Array.isArray(message.content) ? message.content.filter(block => block.type === 'image_url').length : 0), 0),
      followupMatches: requests === 1 || users.at(-1).content.endsWith('Public followup after restart') });
    receipt.wireShape = parsed.messages.map(message => ({ role: message.role, array: Array.isArray(message.content),
      length: message.content?.length, kinds: Array.isArray(message.content) ? message.content.map(block => block.type) : [],
      containsPublicText: JSON.stringify(message.content).includes(text), containsPublicImage: JSON.stringify(message.content).includes(imageData) }));
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: requests === 1 ? 'Public retained paste accepted.' : 'Public replay image accepted.' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 12, completion_tokens: 4, total_tokens: 16 } }));
  });
});
server.on('connection', socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const profile = createProfileContext({ name: 'probe', homeDir: home, env });
fs.writeFileSync(path.join(profile.root, 'config.json'), JSON.stringify({ tuiMode: mode, enableMcpTools: false, offline: true,
  cacheWarming: 'off', provider: 'openai-compatible', maxTurns: 2, maxOutputTokens: 256, retryEnabled: false,
  retryMaxRetries: 0, providerRetryMaxRetries: 0, providerBodyTimeoutMs: 10000, hooks: {},
  providerCredentials: { 'openai-compatible': { apiKey: 'synthetic-fixture', baseUrl: `http://127.0.0.1:${server.address().port}/v1`, model: 'fixture' } } }));
fs.writeFileSync(path.join(profile.root, 'models.json'), JSON.stringify({ providers: {
  'openai-compatible': { models: [{ id: 'fixture', vision: true }] },
} }));
const sessionId = withProfile(profile, () => {
  const manager = new SessionManager(), session = manager.createNew(project);
  manager.addTurn(session.id, { id: 'fixture-message', role: 'user', content: 'Public fixture saved history' });
  manager.saveCompleted(session.id); return session.id;
});
const configBefore = fs.readFileSync(path.join(profile.root, 'config.json'));
const modelsBefore = fs.readFileSync(path.join(profile.root, 'models.json'));
const session = () => withProfile(profile, () => new SessionManager().getSession(sessionId));
const observe = () => { try { return JSON.parse(fs.readFileSync(observation)); } catch { return {}; } };
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const receipt = { mode, buildId: build.manifest.buildId, inputsDigest: build.manifest.inputsDigest, provider: 'loopback HTTP fixture',
  savedMessages: 1, phases: [], status: 'not-run', limits: { heapMiB: 768, wallSeconds: 60, outputBytes: 2097152 }, stages: [] };
let output = '', bytes = 0, closed = false, overflow = false, timedOut = false;
let child = spawn('python3', [path.join(root, '.omx/artifacts/phase20-addition-live-cli/relay.py'), '--', process.execPath,
  '--import', path.join(archive, 'observe.mjs'), path.join(root, 'scripts/start.mjs'), '--project', project, '--profile', 'probe', '--session-id', sessionId,
  '--no-context-files', '--no-skills', '--offline'], { cwd: project, env: { ...env, CHEERS_PROBE_PHASE: 'submit' }, detached: true });
let close = new Promise(resolve => child.once('close', (code, signal) => { closed = true; resolve({ code, signal }); }));
for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => {
  bytes += chunk.length; if (bytes <= 2 * 1024 * 1024) output += chunk.toString('utf8'); else { overflow = true; child.kill('SIGTERM'); }
});
const deadline = setTimeout(() => { timedOut = true; child.kill('SIGTERM'); }, 60000);
async function wait(predicate, label) {
  const until = Date.now() + 10000;
  while (Date.now() < until) { if (predicate()) return; assert(!closed, 'closed-' + label); assert(!overflow); await pause(25); }
  throw Error('timeout-' + label);
}
try {
  await wait(() => output.includes('Ask anything, or / for commands') && observe().sessionId, 'startup');
  assert.equal(observe().sessionId, sessionId);
  child.stdin.write('\x1b[200~' + text + '\x1b[201~');
  await wait(() => observe().expandedTextMatches && observe().imageMatches, 'initial-text-image');
  const initial = observe(); assert.equal(initial.unresolved, 0);
  const beforeStash = output.length; child.stdin.write('\x1bs');
  await wait(() => observe().draftLength === 0 && observe().pressureIssuances === 1100, 'stashed-pressure');
  await wait(() => output.slice(beforeStash).includes('Draft stashed'), 'painted-stash-notice');
  const pressure = observe().pressure;
  assert.equal(pressure.signatures, 1024); assert(pressure.payloads <= 128); assert(pressure.payloadBytes <= 32 * 1024 * 1024);
  assert.equal(requests, 0);
  receipt.stages.push({ action: 'real bracketed paste and alt+s stash', imageHostInjections: 1,
    pressureIssuances: 1100, pressureSource: 'tiny payload injection into actual PasteStore', pressure, noPostWhileStashed: true, noticePainted: true });
  child.stdin.write('\x1bs');
  await wait(() => observe().draftHash === initial.draftHash && observe().cursor === initial.cursor, 'restored-draft');
  const restored = observe(); assert(restored.expandedTextMatches); assert(restored.imageMatches); assert(restored.insideExpansionMatches); assert.equal(restored.unresolved, 0);
  receipt.stages.push({ action: 'real alt+s restore', exactDraftAndCaret: true, textRetained: true, imageRetained: true, interiorExpansion: true, unresolved: 0 });
  child.stdin.write('\r');
  await wait(() => observe().ends >= 1 && requests === 1 && output.includes('Public retained paste accepted.'), 'submitted');
  receipt.wire = wire;
  assert.deepEqual(wire, [{ textMatches: true, imageMatches: true, noLiteralTokens: true, imageBlocks: 1, followupMatches: true }]);
  const saved = session().turns.filter(turn => turn.role === 'user').at(-1);
  const expectedContent = [{ type: 'text', text }, { type: 'image', data: imageData, mimeType: 'image/png' }];
  assert.deepEqual(saved.content, expectedContent);
  receipt.savedUser = { exactTextAndImageBlocks: true, userMessages: session().turns.filter(turn => turn.role === 'user').length };
  assert.equal(receipt.savedUser.userMessages, 2);
  receipt.stages.push({ action: 'real Enter submission', wire: wire[0], savedUser: receipt.savedUser, responsePainted: true });
  assert(fs.readFileSync(path.join(profile.root, 'config.json')).equals(configBefore));
  assert(fs.readFileSync(path.join(profile.root, 'models.json')).equals(modelsBefore));
  assert.deepEqual(fs.readdirSync(project), ['.git']); assert.equal(rejectedRequests, 0);
  async function stop(label) {
    child.stdin.write('\x04'); const shutdown = await Promise.race([close, pause(6000).then(() => undefined)]);
    assert.deepEqual(shutdown, { code: 0, signal: null }); const deviceReceipt = JSON.parse(fs.readFileSync(device));
    assert(deviceReceipt.cookedFlagsRestored); receipt.phases.push({ label, shutdown, device: deviceReceipt });
  }
  await stop('initial submission');
  const durable = withProfile(profile, () => new SessionManager().getSession(sessionId));
  assert.deepEqual(durable.turns.filter(turn => turn.role === 'user').at(-1).content, expectedContent);
  fs.rmSync(observation, { force: true }); fs.rmSync(device, { force: true }); closed = false; output = '';
  child = spawn('python3', [path.join(root, '.omx/artifacts/phase20-addition-live-cli/relay.py'), '--', process.execPath,
    '--import', path.join(archive, 'observe.mjs'), path.join(root, 'scripts/start.mjs'), '--project', project, '--profile', 'probe', '--session-id', sessionId,
    '--no-context-files', '--no-skills', '--offline'], { cwd: project, env: { ...env, CHEERS_PROBE_PHASE: 'replay' }, detached: true });
  close = new Promise(resolve => child.once('close', (code, signal) => { closed = true; resolve({ code, signal }); }));
  for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => {
    bytes += chunk.length; if (bytes <= 2 * 1024 * 1024) output += chunk.toString('utf8'); else { overflow = true; child.kill('SIGTERM'); }
  });
  await wait(() => output.includes('Ask anything, or / for commands') && observe().sessionId === sessionId, 'restart-startup');
  assert.equal(requests, 1); assert.equal(observe().imageHostInjections, 0);
  child.stdin.write('Public followup after restart\r');
  await wait(() => observe().ends >= 1 && requests === 2 && output.includes('Public replay image accepted.'), 'replayed-image-request');
  assert.deepEqual(wire[1], { textMatches: true, imageMatches: true, noLiteralTokens: true, imageBlocks: 1, followupMatches: true });
  assert.equal(observe().imageHostInjections, 0); assert.equal(observe().pressureIssuances, 0);
  const final = withProfile(profile, () => new SessionManager().getSession(sessionId));
  const finalUsers = final.turns.filter(turn => turn.role === 'user');
  assert.equal(finalUsers.length, 3); assert.deepEqual(finalUsers[1].content, expectedContent);
  assert.equal(finalUsers[2].content, 'Public followup after restart');
  receipt.stages.push({ action: 'new CLI process resumes saved session and submits followup', priorImageReplayed: true,
    wire: wire[1], exactPriorContent: true, finalUserMessages: 3, noImageOrPressureInjection: true, responsePainted: true });
  assert(fs.readFileSync(path.join(profile.root, 'config.json')).equals(configBefore));
  assert(fs.readFileSync(path.join(profile.root, 'models.json')).equals(modelsBefore)); assert.deepEqual(fs.readdirSync(project), ['.git']);
  await stop('restart and replay');
  receipt.configurationUnchanged = true; receipt.projectUnchanged = true; receipt.status = 'passed';
} catch (error) { receipt.status = 'failed'; receipt.failure = error.message.split('\n')[0]; receipt.observation = observe(); }
finally {
  clearTimeout(deadline);
  if (!closed) { child.kill('SIGTERM'); await Promise.race([close, pause(3000)]); if (!closed) { try { process.kill(-child.pid, 'SIGKILL'); } catch {} await close; } }
  for (const socket of sockets) socket.destroy(); await new Promise(resolve => server.close(resolve));
  receipt.requests = requests; receipt.readinessRequests = readiness; receipt.rejectedRequests = rejectedRequests; receipt.configuredProviderLoopback = true;
  receipt.outputBytes = bytes; receipt.outputLimitExceeded = overflow; receipt.deadlineExceeded = timedOut; output = '';
  fs.rmSync(scratch, { recursive: true, force: true }); receipt.scratchRemoved = !fs.existsSync(scratch);
  fs.writeFileSync(path.join(archive, mode + '-receipt.json'), JSON.stringify(receipt, null, 2) + '\n'); console.log(JSON.stringify(receipt));
}
if (receipt.status !== 'passed') process.exitCode = 1;
