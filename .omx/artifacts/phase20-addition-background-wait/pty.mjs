import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createHash } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { checkBuild } from '../../../scripts/start-lib.mjs';
import { createQaPtyEnvironment } from '../../../scripts/qa-pty-env.mjs';
const root = process.cwd(), archive = path.join(root, '.omx/artifacts/phase20-addition-background-wait');
const base = path.join(root, '.tmp/background-wait'); fs.mkdirSync(base, { recursive: true });
const mode = process.argv[2] ?? 'regular'; assert(['regular', 'fullscreen'].includes(mode));
const build = checkBuild({ root, dist: path.join(root, 'packages/ts-shell/dist'),
  version: JSON.parse(fs.readFileSync('packages/ts-shell/package.json')).version, executablePolicy: 'ignore' });
assert(build.ok, 'fresh build');
const built = path.dirname(path.dirname(build.entry));
const load = file => import(pathToFileURL(path.join(built, file)));
const { createProfileContext, withProfile } = await load('core/paths/profile/context.js');
const { SessionManager } = await load('session/SessionManager.js');
const { JobStore } = await load('workflow/jobs/store.js');
const { setFilePersistenceEnabled } = await load('observability/structuredLogger.js'); setFilePersistenceEnabled(false);
const scratch = fs.mkdtempSync(path.join(base, 'run-')), home = path.join(scratch, 'home'), project = path.join(scratch, 'project');
fs.mkdirSync(home); fs.mkdirSync(project);
const observation = path.join(scratch, 'observe.json'), device = path.join(scratch, 'device.json');
const env = { ...createQaPtyEnvironment(home, project), CHEERS_PROVIDER_MODE: 'real', NODE_OPTIONS: '--max-old-space-size=768',
  CHEERS_PROBE_BUILD: built, CHEERS_PROBE_RECEIPT: observation, CHEERS_PROBE_DEVICE: device };
assert.equal(spawnSync('rtk', ['git', 'init', '-q'], { cwd: project, env, stdio: 'ignore' }).status, 0);
const ready = path.join(project, 'ready.json'), release = path.join(project, 'release');
const jobFile = path.join(project, 'job.mjs');
fs.writeFileSync(jobFile, `import fs from 'node:fs';
const ready = ${JSON.stringify(ready)}, release = ${JSON.stringify(release)};
fs.writeFileSync(ready, JSON.stringify({pid: process.pid}));
console.log('Public background fixture started');
const poll = setInterval(() => { if (fs.existsSync(release)) {
  clearInterval(poll); console.log('Public background fixture finished'); process.exit(0);
}}, 100);
setTimeout(() => { clearInterval(poll); process.exit(2); }, 45000);
`);
const command = [process.execPath, jobFile].map(value => "'" + value.replaceAll("'", "'\\''") + "'").join(' ');
const observe = () => { try { return JSON.parse(fs.readFileSync(observation)); } catch { return {}; } };
let round = 0, perRound = 0, requests = 0, readiness = 0;
const sockets = new Set();
const server = http.createServer((request, response) => {
  request.resume();
  if (request.method === 'GET' && request.url === '/v1/models') {
    readiness++; response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ data: [{ id: 'fixture' }] })); return;
  }
  assert.equal(request.method, 'POST'); assert.equal(request.url, '/v1/chat/completions'); requests++; perRound++;
  let name, args;
  if (round === 1 && perRound === 1) { name = 'bash'; args = { command, runInBackground: true, timeout: 45 }; }
  else if (round === 1 && perRound === 2 || round >= 2 && perRound === 1) {
    name = 'taskWait'; args = { taskId: observe().jobs[0].id, timeoutSeconds: round === 1 ? 1 : 300 };
  }
  response.writeHead(200, { 'content-type': 'application/json' });
  response.end(JSON.stringify({ choices: [{ message: name
    ? { role: 'assistant', content: '', tool_calls: [{ id: `fixture-${round}-${perRound}`, type: 'function',
      function: { name, arguments: JSON.stringify(args) } }] }
    : { role: 'assistant', content: 'Public fixture turn settled.' }, finish_reason: name ? 'tool_calls' : 'stop' }],
    usage: { prompt_tokens: 12, completion_tokens: 4, total_tokens: 16 } }));
});
server.on('connection', socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const profile = createProfileContext({ name: 'probe', homeDir: home, env });
fs.writeFileSync(path.join(profile.root, 'config.json'), JSON.stringify({ tuiMode: mode, allowedTools: ['bash', 'taskWait', 'taskOutput', 'taskStop'],
  permissionScope: 'allow-all', enableMcpTools: false, offline: true, cacheWarming: 'off', provider: 'openai-compatible',
  maxTurns: 4, maxOutputTokens: 256, retryEnabled: false, retryMaxRetries: 0, providerRetryMaxRetries: 0, providerBodyTimeoutMs: 10000, hooks: {},
  providerCredentials: { 'openai-compatible': { apiKey: 'synthetic-fixture', baseUrl: `http://127.0.0.1:${server.address().port}/v1`, model: 'fixture' } } }));
const sessionId = withProfile(profile, () => { const manager = new SessionManager(), session = manager.createNew(project);
  manager.addTurn(session.id, { id: 'fixture-message', role: 'user', content: 'Public fixture saved history' });
  manager.saveCompleted(session.id); return session.id; });
const configBefore = fs.readFileSync(path.join(profile.root, 'config.json'));
const journal = () => withProfile(profile, () => { const manager = new SessionManager(); return new JobStore(manager, () => manager.getSession(sessionId)).read(); });
const session = () => withProfile(profile, () => new SessionManager().getSession(sessionId));
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const receipt = { mode, buildId: build.manifest.buildId, inputsDigest: build.manifest.inputsDigest,
  provider: 'loopback HTTP fixture', status: 'not-run', stages: [], checks: {} };
let output = '', bytes = 0, closed = false, overflow = false, timedOut = false;
const child = spawn('python3', [path.join(root, '.omx/artifacts/phase20-addition-live-cli/relay.py'), '--', process.execPath,
  '--import', path.join(archive, 'observe.mjs'), path.join(root, 'scripts/start.mjs'), '--project', project,
  '--profile', 'probe', '--session-id', sessionId, '--no-context-files', '--no-skills', '--offline'],
  { cwd: project, env, detached: true });
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
function identity(pid) { try { const fields = fs.readFileSync(`/proc/${pid}/stat`, 'utf8').split(') ')[1].split(' ');
  return { state: fields[0], start: fields[19] }; } catch { return undefined; } }
let original, pid;
try {
  await wait(() => output.includes('Ask anything, or / for commands') && observe().sessionId, 'startup');
  assert.equal(observe().sessionId, sessionId);
  child.stdin.write('\x1bp'); await wait(() => observe().scope === 'accept-edits', 'accept-edits');
  child.stdin.write('\x1bp'); await wait(() => observe().scope === 'allow-all', 'allow-all');
  round = 1; perRound = 0; const first = Date.now(); child.stdin.write('Start and briefly wait for public fixture\r');
  await wait(() => observe().ends >= 1, 'timeout turn');
  const firstTool = session().turns.filter(turn => turn.role === 'tool').at(-1);
  if (!firstTool.content.includes('Wait limit reached after 1s')) throw Error('public fixture tool refusal: ' + firstTool.content.slice(0, 500));
  assert.equal(requests, 3); assert(fs.existsSync(ready)); pid = JSON.parse(fs.readFileSync(ready)).pid; original = identity(pid);
  assert(original && original.state !== 'Z'); assert.equal(journal().local.length, 1); assert.equal(journal().local[0].status, 'running');
  assert(session().turns.filter(turn => turn.role === 'tool').at(-1).content.includes('Wait limit reached after 1s'));
  assert.equal(observe().active, 1); assert.equal(observe().releases, 1);
  receipt.stages.push({ action: 'wait limit', elapsedMs: Date.now() - first, taskStillRunning: true, waitListenerReleased: true });
  round = 2; perRound = 0; const second = Date.now(); child.stdin.write('Wait for public fixture until interrupted\r');
  await wait(() => observe().active === 2 && observe().starts.filter(entry => entry.name === 'taskWait').length === 2, 'cancel wait');
  await pause(500); const cancelling = Date.now(); child.stdin.write('\x03');
  await wait(() => observe().ends >= 2 && observe().active === 1, 'cancelled');
  assert.equal(requests, 4); assert.equal(journal().local[0].status, 'running');
  const live = identity(pid); assert.equal(live?.start, original.start); assert(live.state !== 'Z');
  assert.equal(observe().releases, 2);
  receipt.stages.push({ action: 'Ctrl+C wait cancellation', elapsedMs: Date.now() - second,
    cancelMs: Date.now() - cancelling, sameOriginalProcessActive: true, waitListenerReleased: true, noExtraModelRequest: true });
  round = 3; perRound = 0; const third = Date.now(); child.stdin.write('Wait again for the same public fixture\r');
  await wait(() => observe().active === 2 && observe().starts.filter(entry => entry.name === 'taskWait').length === 3, 'final wait');
  await pause(16000); assert.equal(journal().local[0].status, 'running'); assert.equal(observe().ends, 2);
  const releasing = Date.now(); fs.writeFileSync(release, 'finish');
  await wait(() => observe().ends >= 3 && journal().local[0].status === 'completed', 'completed');
  assert.equal(requests, 6); assert.equal(journal().local.length, 1); assert.equal(journal().local[0].exitCode, 0);
  assert.equal(observe().active, 1); assert.equal(observe().releases, 3);
  const final = session().turns.filter(turn => turn.role === 'tool').at(-1);
  assert(final.content.includes('finished with exit code 0')); assert(final.content.includes('Public background fixture finished'));
  assert(!identity(pid) || identity(pid).start !== original.start || identity(pid).state === 'Z');
  receipt.stages.push({ action: 'same-task completion event', elapsedMs: Date.now() - third, releaseToTurnMs: Date.now() - releasing,
    waitedForActualProcess: true, heldWaitMs: 16000, exitCode: 0, oneDispatch: true, outputDigest: createHash('sha256').update(final.content).digest('hex') });
  receipt.checks = { timeoutKeepsTask: true, cancellationKeepsOriginalProcess: true, resumedWaitNoRespawn: true,
    allWaitListenersReleased: true, completionOutputPersisted: true, configUnchanged: fs.readFileSync(path.join(profile.root, 'config.json')).equals(configBefore) };
  const stopped = Date.now(); child.stdin.write('\x04'); receipt.shutdown = await Promise.race([close, pause(6000).then(() => undefined)]);
  receipt.exitMs = Date.now() - stopped; assert.deepEqual(receipt.shutdown, { code: 0, signal: null });
  receipt.device = JSON.parse(fs.readFileSync(device)); assert(receipt.device.cookedFlagsRestored); receipt.status = 'passed';
} catch (error) { receipt.status = 'failed'; receipt.failure = error.message.split('\n')[0]; receipt.observation = observe(); }
finally {
  clearTimeout(deadline); if (!closed) { child.kill('SIGTERM'); await Promise.race([close, pause(3000)]);
    if (!closed) { try { process.kill(-child.pid, 'SIGKILL'); } catch {} await close; } }
  if (pid && original) { const live = identity(pid); if (live?.start === original.start && live.state !== 'Z') {
    process.kill(pid, 'SIGTERM'); receipt.forcedFixtureCleanup = true;
  } }
  for (const socket of sockets) socket.destroy(); await new Promise(resolve => server.close(resolve));
  receipt.requests = requests; receipt.readinessRequests = readiness; receipt.outputBytes = bytes;
  receipt.outputLimitExceeded = overflow; receipt.deadlineExceeded = timedOut; output = '';
  fs.rmSync(scratch, { recursive: true, force: true }); receipt.scratchRemoved = !fs.existsSync(scratch);
  fs.writeFileSync(path.join(base, mode + '-receipt.json'), JSON.stringify(receipt, null, 2) + '\n');
  console.log(JSON.stringify(receipt));
}
if (receipt.status !== 'passed') process.exitCode = 1;
