import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createHash } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { checkBuild } from '../../../scripts/start-lib.mjs';
import { createQaPtyEnvironment } from '../../../scripts/qa-pty-env.mjs';
const root = process.cwd(), archive = path.join(root, '.omx/artifacts/phase20-addition-turn-restore');
const base = path.join(root, '.tmp/turn-restore'); fs.mkdirSync(base, { recursive: true });
const mode = process.argv[2] ?? 'regular'; assert(['regular', 'fullscreen'].includes(mode));
const build = checkBuild({ root, dist: root + '/packages/ts-shell/dist',
  version: JSON.parse(fs.readFileSync('packages/ts-shell/package.json')).version, executablePolicy: 'ignore' }); assert(build.ok);
const built = path.dirname(path.dirname(build.entry));
const load = file => import(pathToFileURL(path.join(built, file)));
const { createProfileContext, withProfile } = await load('core/paths/profile/context.js');
const { SessionManager } = await load('session/SessionManager.js');
const { captureOperationScope, readOperations } = await load('edit/recovery/operation/store.js');
const { setFilePersistenceEnabled } = await load('observability/structuredLogger.js'); setFilePersistenceEnabled(false);
const scratch = fs.mkdtempSync(path.join(base, 'run-')), home = path.join(scratch, 'home'), project = path.join(scratch, 'project');
fs.mkdirSync(home); fs.mkdirSync(project);
const observation = path.join(scratch, 'observe.json'), device = path.join(scratch, 'device.json');
const env = { ...createQaPtyEnvironment(home, project), CHEERS_PROVIDER_MODE: 'real', NODE_OPTIONS: '--max-old-space-size=768',
  CHEERS_PROBE_BUILD: built, CHEERS_PROBE_RECEIPT: observation, CHEERS_PROBE_DEVICE: device };
assert.equal(spawnSync('rtk', ['git', 'init', '-q'], { cwd: project, env, stdio: 'ignore' }).status, 0);
const a = path.join(project, 'a.txt'), b = path.join(project, 'b.txt'); fs.writeFileSync(a, 'old-a\n'); fs.writeFileSync(b, 'old-b\n');
let round = 0, perRound = 0, requests = 0, readiness = 0, partialNoticeInRequest = false, completeNoticeInRequest = false;
const sockets = new Set();
const server = http.createServer((request, response) => {
  if (request.method === 'GET' && request.url === '/v1/models') {
    request.resume(); readiness++; response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ data: [{ id: 'fixture' }] })); return;
  }
  assert.equal(request.method, 'POST'); assert.equal(request.url, '/v1/chat/completions');
  let body = ''; request.on('data', chunk => { body += chunk; assert(body.length < 512 * 1024); });
  request.on('end', () => {
    const parsed = JSON.parse(body); body = '';
    if (round === 2 && perRound === 0) partialNoticeInRequest = parsed.messages.some(message =>
      typeof message.content === 'string' && message.content.includes('Restored 1 of 2 recorded operation(s).') && message.content.includes('Previous file reads may be stale'));
    if (round === 3) completeNoticeInRequest = parsed.messages.some(message =>
      typeof message.content === 'string' && message.content.includes('Every operation of this turn was restored and verified.'));
    requests++; perRound++;
    const editing = round <= 2 && perRound <= 2;
    const args = { path: perRound === 1 ? a : b, content: perRound === 1 ? `round-${round}-a\n` : `round-${round}-b\n` };
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ choices: [{ message: editing ? { role: 'assistant', content: '',
      tool_calls: [{ id: `fixture-${round}-${perRound}`, type: 'function', function: { name: 'edit', arguments: JSON.stringify(args) } }] }
      : { role: 'assistant', content: 'Public fixture turn settled.' }, finish_reason: editing ? 'tool_calls' : 'stop' }],
      usage: { prompt_tokens: 12, completion_tokens: 4, total_tokens: 16 } }));
  });
});
server.on('connection', socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const profile = createProfileContext({ name: 'probe', homeDir: home, env });
fs.writeFileSync(path.join(profile.root, 'config.json'), JSON.stringify({ tuiMode: mode, allowedTools: ['edit'],
  enableMcpTools: false, offline: true, cacheWarming: 'off', provider: 'openai-compatible', maxTurns: 4, maxOutputTokens: 256,
  retryEnabled: false, retryMaxRetries: 0, providerRetryMaxRetries: 0, providerBodyTimeoutMs: 10000, hooks: {},
  providerCredentials: { 'openai-compatible': { apiKey: 'synthetic-fixture', baseUrl: `http://127.0.0.1:${server.address().port}/v1`, model: 'fixture' } } }));
const sessionId = withProfile(profile, () => { const manager = new SessionManager(), session = manager.createNew(project);
  manager.addTurn(session.id, { id: 'fixture-message', role: 'user', content: 'Public fixture saved history' }); manager.saveCompleted(session.id); return session.id; });
const configBefore = fs.readFileSync(path.join(profile.root, 'config.json'));
const operations = () => withProfile(profile, () => readOperations(captureOperationScope({ sessionId, workspaceRoot: project })));
const session = () => withProfile(profile, () => new SessionManager().getSession(sessionId));
const observe = () => { try { return JSON.parse(fs.readFileSync(observation)); } catch { return {}; } };
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const receipt = { mode, buildId: build.manifest.buildId, inputsDigest: build.manifest.inputsDigest,
  provider: 'loopback HTTP fixture', status: 'not-run', stages: [], checks: {} };
let output = '', bytes = 0, closed = false, overflow = false, timedOut = false;
const child = spawn('python3', [path.join(root, '.omx/artifacts/phase20-addition-live-cli/relay.py'), '--', process.execPath,
  '--import', path.join(archive, 'observe.mjs'), path.join(root, 'scripts/start.mjs'), '--project', project, '--profile', 'probe',
  '--session-id', sessionId, '--no-context-files', '--no-skills', '--offline'], { cwd: project, env, detached: true });
const close = new Promise(resolve => child.once('close', (code, signal) => { closed = true; resolve({ code, signal }); }));
for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => {
  bytes += chunk.length; if (bytes <= 2 * 1024 * 1024) output += chunk.toString('utf8'); else { overflow = true; child.kill('SIGTERM'); }
});
const deadline = setTimeout(() => { timedOut = true; child.kill('SIGTERM'); }, 45000);
async function wait(predicate, label) {
  const until = Date.now() + 10000;
  while (Date.now() < until) { if (predicate()) return; assert(!closed, 'closed-' + label); assert(!overflow, 'output cap'); await pause(25); }
  throw Error('timeout-' + label);
}
async function send(text, label) { const before = observe().ends, started = Date.now(); child.stdin.write(text + '\r');
  await wait(() => observe().ends > before, label);
  if (observe().pager) { child.stdin.write('\x1b'); await wait(() => observe().pager === false, label + '-reader-closed'); }
  return Date.now() - started; }
const metadata = () => session().turns.filter(turn => turn.metadata?.fileUndo).at(-1)?.metadata.fileUndo;
try {
  await wait(() => output.includes('Ask anything, or / for commands') && observe().sessionId, 'startup');
  assert.equal(observe().sessionId, sessionId); child.stdin.write('\x1bp'); await wait(() => observe().scope === 'accept-edits', 'accept-edits');
  round = 1; perRound = 0; await send('Edit both public files in one turn', 'first edits');
  assert.equal(requests, 3); let selected = operations(); assert.equal(selected.length, 2);
  assert(selected.every(operation => operation.status === 'committed'));
  const turn1 = selected[0].correlationId; assert(turn1 && selected[1].correlationId === turn1);
  let elapsedMs = await send('/undo restore-turn ' + turn1, 'unconfirmed');
  assert.equal(requests, 3); assert(operations().every(operation => operation.undo === 'none'));
  assert.equal(observe().reports.at(-1).status, 'permission-pending');
  receipt.stages.push({ action: 'unconfirmed batch', elapsedMs, writes: 0, modelRequests: 0 });
  fs.writeFileSync(a, 'external-a\n'); elapsedMs = await send('/undo restore-turn ' + turn1 + ' --execute', 'partial');
  assert.equal(fs.readFileSync(a, 'utf8'), 'external-a\n'); assert.equal(fs.readFileSync(b, 'utf8'), 'old-b\n');
  const partial = observe().reports.at(-1); assert.equal(partial.restored, 1); assert.equal(partial.status, 'partial');
  assert.deepEqual(partial.skipped, [selected[1].operationId]);
  assert.equal(metadata()?.status, 'partial', 'partial-metadata'); assert.equal(operations()[0].undo, 'restored-verified', 'newer-ledger'); assert.equal(operations()[1].undo, 'none', 'older-ledger');
  receipt.stages.push({ action: 'real partial batch', elapsedMs, newerRestored: true, olderChangedPreserved: true,
    persistedModelNotice: true, reportDigest: createHash('sha256').update(JSON.stringify(partial)).digest('hex') });
  round = 2; perRound = 0; await send('Make a second two-file turn', 'second edits'); assert(partialNoticeInRequest);
  selected = operations().slice(0, 2); const turn2 = selected[0].correlationId; assert(turn2 !== turn1 && selected[1].correlationId === turn2);
  elapsedMs = await send('/undo restore-turn ' + turn2 + ' --execute', 'complete');
  assert.equal(fs.readFileSync(a, 'utf8'), 'external-a\n'); assert.equal(fs.readFileSync(b, 'utf8'), 'old-b\n');
  const complete = observe().reports.at(-1); assert.equal(complete.status, 'restored-verified'); assert.equal(complete.restored, 2);
  assert.deepEqual(complete.steps.map(step => step.operationId), selected.map(operation => operation.operationId));
  assert.equal(metadata()?.status, 'restored-verified'); assert(operations().slice(0, 2).every(operation => operation.undo === 'restored-verified'));
  receipt.stages.push({ action: 'real complete batch', elapsedMs, bothRestored: true, newestFirst: true, persistedModelNotice: true });
  round = 3; perRound = 0; await send('Inspect restored public context without tools', 'next request'); assert(completeNoticeInRequest);
  receipt.checks = { noWriteWithoutConfirmation: true, partialDoesNotOverwriteExternal: true, completeRestoresBoth: true,
    partialNoticeReachedNextRequest: partialNoticeInRequest, completeNoticeReachedNextRequest: completeNoticeInRequest,
    localUndoDoesNotRequestModel: requests === 7, configUnchanged: fs.readFileSync(path.join(profile.root, 'config.json')).equals(configBefore) };
  const stopped = Date.now(); child.stdin.write('\x04'); receipt.shutdown = await Promise.race([close, pause(6000).then(() => undefined)]);
  receipt.exitMs = Date.now() - stopped; assert.deepEqual(receipt.shutdown, { code: 0, signal: null });
  receipt.device = JSON.parse(fs.readFileSync(device)); assert(receipt.device.cookedFlagsRestored); receipt.status = 'passed';
} catch (error) { receipt.status = 'failed'; receipt.failure = error.message.split('\n')[0]; receipt.observation = observe(); }
finally {
  clearTimeout(deadline); if (!closed) { child.kill('SIGTERM'); await Promise.race([close, pause(3000)]);
    if (!closed) { try { process.kill(-child.pid, 'SIGKILL'); } catch {} await close; } }
  for (const socket of sockets) socket.destroy(); await new Promise(resolve => server.close(resolve));
  receipt.requests = requests; receipt.readinessRequests = readiness; receipt.outputBytes = bytes;
  receipt.outputLimitExceeded = overflow; receipt.deadlineExceeded = timedOut; output = '';
  fs.rmSync(scratch, { recursive: true, force: true }); receipt.scratchRemoved = !fs.existsSync(scratch);
  fs.writeFileSync(path.join(base, mode + '-receipt.json'), JSON.stringify(receipt, null, 2) + '\n'); console.log(JSON.stringify(receipt));
}
if (receipt.status !== 'passed') process.exitCode = 1;
