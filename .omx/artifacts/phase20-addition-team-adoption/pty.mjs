import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { checkBuild } from '../../../scripts/start-lib.mjs';
import { createQaPtyEnvironment } from '../../../scripts/qa-pty-env.mjs';

const root = process.cwd(), archive = path.join(root, '.omx/artifacts/phase20-addition-team-adoption');
const base = path.join(root, '.tmp/team-adoption'); fs.mkdirSync(base, { recursive: true });
const mode = process.argv[2] ?? 'regular'; assert(['regular', 'fullscreen'].includes(mode));
const build = checkBuild({ root, dist: root + '/packages/ts-shell/dist', version: JSON.parse(fs.readFileSync('packages/ts-shell/package.json')).version, executablePolicy: 'ignore' });
assert(build.ok); const built = path.dirname(path.dirname(build.entry));
const load = file => import(pathToFileURL(path.join(built, file)));
const { createProfileContext, withProfile } = await load('core/paths/profile/context.js');
const { SessionManager } = await load('session/SessionManager.js');
(await load('observability/structuredLogger.js')).setFilePersistenceEnabled(false);
const scratch = fs.mkdtempSync(path.join(base, 'run-')), home = path.join(scratch, 'home'), project = path.join(scratch, 'project');
fs.mkdirSync(home); fs.mkdirSync(project); fs.writeFileSync(path.join(project, 'profile.txt'), 'header\ncache misses: 0\nfooter\n');
const observation = path.join(scratch, 'observe.json'), device = path.join(scratch, 'device.json');
const env = { ...createQaPtyEnvironment(home, project), CHEERS_PROVIDER_MODE: 'real', NODE_OPTIONS: '--max-old-space-size=768',
  CHEERS_PROBE_BUILD: built, CHEERS_PROBE_RECEIPT: observation, CHEERS_PROBE_DEVICE: device };
assert.equal(spawnSync('rtk', ['git', 'init', '-q'], { cwd: project, env, stdio: 'ignore' }).status, 0);
let round = 0, mainSteps = 0, requests = 0, readiness = 0, proposerRequests = 0, reviewRequests = 0, receiptRequests = 0;
const marker = () => `PUBLIC_TEAM_CLAIM_${mode}_${round}`;
const mainPayloads = [], sockets = new Set();
const server = http.createServer((request, response) => {
  if (request.method === 'GET' && request.url === '/v1/models') {
    request.resume(); readiness++; response.writeHead(200, { 'content-type': 'application/json' }); response.end(JSON.stringify({ data: [{ id: 'fixture' }] })); return;
  }
  assert.equal(request.method, 'POST'); assert.equal(request.url, '/v1/chat/completions');
  let body = ''; request.on('data', chunk => { body += chunk; assert(body.length < 512 * 1024); });
  request.on('end', () => {
    const parsed = JSON.parse(body); body = ''; requests++;
    const texts = parsed.messages.filter(message => typeof message.content === 'string').map(message => message.content);
    const review = texts.some(text => text.startsWith("Another agent's claims are below."));
    const proposer = texts.some(text => text.includes('You are one of several independent agents answering the same question.')) && !review;
    let name, args, text = 'Public fixture turn settled.';
    if (review) {
      reviewRequests++;
      const receipt = /Read receipt: (\S+)/.exec(texts.filter(text => text.includes('Read receipt:')).join('\n'))?.[1];
      if (!receipt) { name = 'read'; args = { path: 'profile.txt:2-2' }; }
      else { receiptRequests++; text = `CLAIM p1 counterevidence The selected profile disagrees. evidence: ${receipt}`; }
    } else if (proposer) {
      proposerRequests++;
      const id = /hypothesis ID is (p[12])/.exec(texts.join('\n'))?.[1];
      const receipt = /Read receipt: (\S+)/.exec(texts.filter(text => text.includes('Read receipt:')).join('\n'))?.[1];
      if (!receipt) { name = 'read'; args = { path: 'profile.txt:2-2' }; }
      else text = JSON.stringify({ hypothesisId: id, claim: marker(), evidenceRefs: [receipt], falsifiers: ['A profile with zero cache misses.'] });
    } else {
      mainSteps++;
      mainPayloads.push({ round, step: mainSteps, currentClaim: JSON.stringify(parsed.messages).includes(marker()) });
      if (round === 1 && mainSteps === 1) { name = 'tool_search'; args = { query: 'team', limit: 4 }; }
      else if (round === 1 && mainSteps === 2 || round >= 2 && mainSteps === 1) { name = 'tool_load'; args = { names: ['team'] }; }
      else if (round === 1 && mainSteps === 3 || round >= 2 && mainSteps === 2) {
        name = 'team'; args = { question: 'Why is the public fixture slow?', perspectives: ['profile', 'configuration'] };
        assert(parsed.tools.some(tool => tool.function?.name === 'team'));
      }
    }
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ choices: [{ message: name ? { role: 'assistant', content: '', tool_calls: [{ id: `fixture-${requests}`, type: 'function', function: { name, arguments: JSON.stringify(args) } }] }
      : { role: 'assistant', content: text }, finish_reason: name ? 'tool_calls' : 'stop' }], usage: { prompt_tokens: 12, completion_tokens: 4, total_tokens: 16 } }));
  });
});
server.on('connection', socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const profile = createProfileContext({ name: 'probe', homeDir: home, env });
fs.writeFileSync(path.join(profile.root, 'config.json'), JSON.stringify({ tuiMode: mode, allowedTools: ['team', 'read', 'glob', 'grep'],
  enableMcpTools: false, offline: true, cacheWarming: 'off', provider: 'openai-compatible', maxTurns: 8, maxOutputTokens: 256,
  retryEnabled: false, retryMaxRetries: 0, providerRetryMaxRetries: 0, providerBodyTimeoutMs: 10000, hooks: {},
  providerCredentials: { 'openai-compatible': { apiKey: 'synthetic-fixture', baseUrl: `http://127.0.0.1:${server.address().port}/v1`, model: 'fixture' } } }));
const sessionId = withProfile(profile, () => { const manager = new SessionManager(), session = manager.createNew(project);
  manager.addTurn(session.id, { id: 'fixture-message', role: 'user', content: 'Public fixture saved history' }); manager.saveCompleted(session.id); return session.id; });
const configBefore = fs.readFileSync(path.join(profile.root, 'config.json'));
const session = () => withProfile(profile, () => new SessionManager().getSession(sessionId));
const observe = () => { try { return JSON.parse(fs.readFileSync(observation)); } catch { return {}; } };
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const receipt = { mode, buildId: build.manifest.buildId, inputsDigest: build.manifest.inputsDigest, provider: 'loopback HTTP fixture', savedMessages: 1, status: 'not-run', stages: [] };
let output = '', bytes = 0, closed = false, overflow = false, timedOut = false;
const child = spawn('python3', [path.join(root, '.omx/artifacts/phase20-addition-live-cli/relay.py'), '--', process.execPath,
  '--import', path.join(archive, 'observe.mjs'), path.join(root, 'scripts/start.mjs'), '--project', project, '--profile', 'probe', '--session-id', sessionId, '--no-context-files', '--no-skills', '--offline'], { cwd: project, env, detached: true });
const close = new Promise(resolve => child.once('close', (code, signal) => { closed = true; resolve({ code, signal }); }));
for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => { bytes += chunk.length; if (bytes <= 2 * 1024 * 1024) output += chunk.toString('utf8'); else { overflow = true; child.kill('SIGTERM'); } });
const deadline = setTimeout(() => { timedOut = true; child.kill('SIGTERM'); }, 45000);
async function wait(predicate, label) { const until = Date.now() + 10000; while (Date.now() < until) {
  if (predicate()) return; assert(!closed, 'closed-' + label); assert(!overflow); await pause(25); } throw Error('timeout-' + label); }
const teamResults = () => session().turns.filter(turn => turn.role === 'tool' && turn.metadata?.adoption);
async function pending(action) {
  round++; mainSteps = 0; child.stdin.write(`Compare public explanations ${action}\r`);
  await wait(() => observe().questions >= round && observe().questionPending && output.includes(marker()), 'question-' + action);
  const preview = observe().preview;
  for (const key of ['report', 'originalClaim', 'falsifiers', 'reads', 'limitations', 'decline', 'adopt']) assert(preview[key], 'preview-' + key);
  assert.equal(preview.recommended, false);
  const before = { requests, mainSteps }; await pause(300);
  assert.deepEqual({ requests, mainSteps }, before, 'no provider continuation while adoption is pending');
  assert.equal(JSON.stringify(session().turns).includes(marker()), false, 'no report saved while adoption is pending');
  return before;
}
try {
  await wait(() => output.includes('Ask anything, or / for commands') && observe().sessionId, 'startup'); assert.equal(observe().sessionId, sessionId);
  child.stdin.write('\x1bp'); await wait(() => observe().scope === 'accept-edits', 'accept-edits');
  child.stdin.write('\x1bp'); await wait(() => observe().scope === 'allow-all', 'allow-all');
  await pending('decline'); child.stdin.write('1\r'); await wait(() => observe().ends >= 1, 'declined');
  const declined = teamResults().at(-1); assert.equal(declined.metadata.adoption.status, 'declined');
  assert.equal(JSON.stringify(session().turns).includes(marker()), false); assert.equal(mainPayloads.at(-1).currentClaim, false);
  assert.equal(mainSteps, 4); assert.deepEqual(Object.keys(declined.metadata), ['adoption']);
  receipt.stages.push({ action: 'decline after full preview', reportInSavedSession: false, reportInNextMainRequest: false, continuedAfterAnswer: true });
  await pending('adopt'); child.stdin.write('2\r'); await wait(() => observe().ends >= 2, 'adopted');
  const adopted = teamResults().at(-1); assert.equal(adopted.metadata.adoption.status, 'adopted');
  assert(adopted.content.includes(marker())); assert.equal(mainPayloads.at(-1).currentClaim, true); assert.equal(mainSteps, 3);
  assert.equal(adopted.metadata.evidence.length, 4);
  assert(adopted.metadata.evidence.every(entry => entry.locator === 'profile.txt:2-2' && entry.start === 2 && entry.end === 2 && entry.contentHash === createHash('sha256').update('cache misses: 0').digest('hex')));
  assert(adopted.metadata.proposals.every(proposal => proposal.claim === marker() && proposal.falsifiers[0] === 'A profile with zero cache misses.' && proposal.evidenceRefs.length === 1));
  assert.match(adopted.metadata.adoption.digest, /^[a-f0-9]{64}$/);
  receipt.stages.push({ action: 'explicit adoption after full preview', reportInSavedSession: true, reportInNextMainRequest: true, boundReads: 4, digestPresent: true });
  const beforeCancel = await pending('cancel'); const cancelStart = Date.now(); child.stdin.write('\x03'); await wait(() => observe().ends >= 3 && !observe().questionPending, 'cancelled');
  await pause(300); assert.deepEqual({ requests, mainSteps }, beforeCancel);
  assert.equal(JSON.stringify(session().turns).includes(marker()), false);
  receipt.stages.push({ action: 'Ctrl+C pending adoption', cancelMs: Date.now() - cancelStart, reportInSavedSession: false, additionalMainRequests: 0, questionSettled: true });
  const beforeExit = await pending('input-close'); const stopStart = Date.now(); child.stdin.write('\x04');
  receipt.shutdown = await Promise.race([close, pause(6000).then(() => undefined)]); receipt.exitMs = Date.now() - stopStart;
  assert.deepEqual(receipt.shutdown, { code: 0, signal: null }); assert(!observe().questionPending);
  assert.deepEqual({ requests, mainSteps }, beforeExit); assert.equal(JSON.stringify(session().turns).includes(marker()), false);
  receipt.stages.push({ action: 'Ctrl+D pending adoption', reportInSavedSession: false, additionalMainRequests: 0, questionSettled: true });
  assert.equal(fs.readFileSync(path.join(project, 'profile.txt'), 'utf8'), 'header\ncache misses: 0\nfooter\n');
  assert(fs.readFileSync(path.join(profile.root, 'config.json')).equals(configBefore));
  assert(observe().tools.some(tool => tool.name === 'tool_search' && tool.success)); assert(observe().tools.some(tool => tool.name === 'tool_load' && tool.success));
  receipt.device = JSON.parse(fs.readFileSync(device)); assert(receipt.device.cookedFlagsRestored); receipt.status = 'passed';
} catch (error) { receipt.status = 'failed'; receipt.failure = error.message.split('\n')[0]; receipt.observation = observe(); }
finally {
  clearTimeout(deadline); if (!closed) { child.kill('SIGTERM'); await Promise.race([close, pause(3000)]); if (!closed) { try { process.kill(-child.pid, 'SIGKILL'); } catch {} await close; } }
  for (const socket of sockets) socket.destroy(); await new Promise(resolve => server.close(resolve));
  receipt.requests = requests; receipt.readinessRequests = readiness; receipt.proposerRequests = proposerRequests; receipt.reviewRequests = reviewRequests; receipt.receiptRequests = receiptRequests;
  receipt.outputBytes = bytes; receipt.outputLimitExceeded = overflow; receipt.deadlineExceeded = timedOut; output = '';
  fs.rmSync(scratch, { recursive: true, force: true }); receipt.scratchRemoved = !fs.existsSync(scratch);
  fs.writeFileSync(path.join(archive, mode + '-receipt.json'), JSON.stringify(receipt, null, 2) + '\n'); console.log(JSON.stringify(receipt));
}
if (receipt.status !== 'passed') process.exitCode = 1;
