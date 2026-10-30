import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { checkBuild } from '../../../scripts/start-lib.mjs';
import { createQaPtyEnvironment } from '../../../scripts/qa-pty-env.mjs';

const root = process.cwd(), archive = path.join(root, '.omx/artifacts/phase20-addition-research-wire');
const base = path.join(root, '.tmp/research-wire'); fs.mkdirSync(base, { recursive: true });
const mode = process.argv[2] ?? 'regular'; assert(['regular', 'fullscreen'].includes(mode));
const build = checkBuild({ root, dist: root + '/packages/ts-shell/dist', version: JSON.parse(fs.readFileSync('packages/ts-shell/package.json')).version, executablePolicy: 'ignore' });
assert(build.ok); const built = path.dirname(path.dirname(build.entry));
const load = file => import(pathToFileURL(path.join(built, file)));
const { createProfileContext, withProfile } = await load('core/paths/profile/context.js');
const { SessionManager } = await load('session/SessionManager.js');
(await load('observability/structuredLogger.js')).setFilePersistenceEnabled(false);
const scratch = fs.mkdtempSync(path.join(base, 'run-')), home = path.join(scratch, 'home'), project = path.join(scratch, 'project');
fs.mkdirSync(home); fs.mkdirSync(project);
const evidence = 'v2 enabled only on Linux.\n'; fs.writeFileSync(path.join(project, 'release.md'), evidence);
const skills = ['one', 'two'].map(name => {
  const file = path.join(project, name, 'SKILL.md'); fs.mkdirSync(path.dirname(file));
  fs.writeFileSync(file, `---\nname: ${name}\ndescription: Public fixture method ${name}\n---\nPUBLIC_METHOD_${name.toUpperCase()}: inspect applicability and limits.`); return file;
});
const methods = ['PUBLIC_METHOD_ONE: inspect applicability and limits.', 'PUBLIC_METHOD_TWO: inspect applicability and limits.'];
const observation = path.join(scratch, 'observe.json'), device = path.join(scratch, 'device.json');
const env = { ...createQaPtyEnvironment(home, project), CHEERS_PROVIDER_MODE: 'real', NODE_OPTIONS: '--max-old-space-size=768',
  CHEERS_PROBE_BUILD: built, CHEERS_PROBE_RECEIPT: observation, CHEERS_PROBE_DEVICE: device };
assert.equal(spawnSync('rtk', ['git', 'init', '-q'], { cwd: project, env, stdio: 'ignore' }).status, 0);
const brief = { revision: 1, question: 'Versioned feature conditions', mode: 'software', questions: [{ id: 'q1', text: 'Under which conditions?' }],
  anchors: { versions: ['v2'], platforms: ['Linux'], conditions: ['enabled'] }, scope: 'v2 Linux enabled', exclusions: [] };
const sockets = new Set(), wire = [], cases = [];
let current, requests = 0, readiness = 0, serverFailure;
function replyFor(parsed) {
  requests++; assert(requests <= 30, 'bounded request count');
  const texts = parsed.messages.map(message => typeof message.content === 'string' ? message.content
    : Array.isArray(message.content) ? message.content.map(block => block.text ?? '').join('\n') : '');
  const prompt = texts.find(text => text.startsWith('Research stage:'));
  const names = (parsed.tools ?? []).map(tool => tool.function?.name).filter(Boolean);
  const checkMethods = text => methods.forEach(method => assert.equal(text.split(method).length - 1, 1, 'exact method body appears once'));
  let name, args, value;
  if (!prompt) {
    const entry = texts.filter(text => text.includes('The user has armed the exact native research run ')).at(-1);
    assert(entry); checkMethods(entry);
    const runId = /exact native research run ([a-zA-Z0-9_.:-]+) for this question:/.exec(entry)?.[1]; assert(runId);
    if (current.runId) assert.equal(runId, current.runId); else current.runId = runId;
    current.rootRequests++;
    if (current.rootRequests === 1) {
      assert(names.includes('research_run'), 'real root request exposes native tool');
      const schema = parsed.tools.find(tool => tool.function?.name === 'research_run').function.parameters;
      assert.equal(schema.properties.runId.const, runId);
      name = 'research_run'; args = { runId };
    } else {
      assert.equal(current.rootRequests, 2);
      // The persisted state owns the result; do not derive completion from the fixture's intended case.
      const persisted = state().research.runs.find(item => item.id === runId); assert(persisted);
      assert(texts.some(text => text.includes(runId) && text.includes(persisted.status)));
      value = `Public native research status: ${persisted.status}. Review: ${persisted.review?.status}. Save: ${persisted.save.status}.`;
    }
    wire.push({ request: requests, case: current.name, stage: 'root', runId, methods: ['one', 'two'], nativeTool: names.includes('research_run') });
  } else {
    checkMethods(prompt); const stage = /^Research stage: (\w+)/.exec(prompt)[1];
    const input = JSON.parse(prompt.split('Research input: ')[1]); assert.equal(input.runId, current.runId);
    assert.equal(input.request.mode, 'software'); assert.equal(input.request.depth, 'quick'); assert.equal(input.request.save, false);
    assert.equal(input.request.question.trim(), brief.question); assert.equal(input.request.methods, undefined);
    assert(!names.some(name => ['shell', 'write', 'edit', 'task', 'team', 'research_run', 'research_save'].includes(name)), 'children retain read-only tools');
    const receiptText = texts.find(text => text.includes('[Research sources]\n'));
    const receipt = receiptText ? JSON.parse(receiptText.split('[Research sources]\n')[1]) : undefined;
    if (stage === 'brief') value = brief;
    else if ((stage === 'investigate' || stage === 'review') && current.reads && !receipt) {
      assert(names.includes('read')); name = 'read'; args = { path: 'release.md' };
    } else if (stage === 'investigate' || stage === 'review') {
      const source = receipt?.sources[0];
      if (current.reads) {
        assert.equal(source.status, 'read'); assert.equal(source.excerpts[0].quote, evidence.trim()); current.actualReads++;
      }
      const reference = source ? { sourceId: source.sourceId, excerptId: source.excerpts[0].excerptId, quote: source.excerpts[0].quote } : undefined;
      const claim = reference ? { id: 'c-q1', questionId: 'q1', text: 'v2 feature requires enabled mode on Linux.', kind: 'behavior', scope: 'v2 Linux enabled',
        support: 'direct', supportReason: 'Actual local versioned excerpt.', supporting: [reference], opposing: [], conflicts: [], limitations: [] } : undefined;
      value = stage === 'review' ? { findings: reference ? input.claims.map(claim => ({ claimId: claim.id, outcome: 'none-found',
        reason: 'This bounded fresh read found no opposite result.', references: [reference] })) : [], uncovered: reference ? [] : ['q1'], limitation: 'Public fixture; same model independent context.' }
        : { summary: reference ? 'Bound versioned applicability.' : 'No evidence obtained.', claims: claim ? [claim] : [], covered: claim ? ['q1'] : [],
          uncovered: claim ? [] : ['q1'], limitations: claim ? ['Public fixture only.'] : ['No source evidence.'] };
    } else if (stage === 'gaps') value = { gaps: [], covered: input.draft.covered, uncovered: input.draft.uncovered };
    else if (stage === 'draft') value = input.draft;
    else if (stage === 'report') {
      assert.equal(names.length, 0); const claim = input.claims[0], ref = claim?.supporting[0];
      value = { index: input.fragmentIndex, title: input.fragmentSections[input.fragmentIndex],
        text: ref ? `Public applicability [source:${ref.sourceId}#${ref.excerptId}]. Public fixture only; same model review.` : 'No evidence obtained; coverage and review remain unverified.',
        claimIds: claim ? [claim.id] : [], sourceIds: ref ? [ref.sourceId] : [], inputDigest: input.inputDigest };
    } else throw Error('unexpected-stage-' + stage);
    current.childRequests++;
    wire.push({ request: requests, case: current.name, stage, runId: input.runId, methods: ['one', 'two'], receipt: !!receipt, nativeRead: name === 'read', toolCount: names.length });
  }
  return { choices: [{ message: name ? { role: 'assistant', content: '', tool_calls: [{ id: `fixture-${requests}`, type: 'function', function: { name, arguments: JSON.stringify(args) } }] }
    : { role: 'assistant', content: typeof value === 'string' ? value : JSON.stringify(value) }, finish_reason: name ? 'tool_calls' : 'stop' }],
    usage: { prompt_tokens: 24, completion_tokens: 12, total_tokens: 36 } };
}
const server = http.createServer((request, response) => {
  if (request.method === 'GET' && request.url === '/v1/models') { request.resume(); readiness++; response.writeHead(200, { 'content-type': 'application/json' }); response.end(JSON.stringify({ data: [{ id: 'fixture' }] })); return; }
  let body = ''; request.on('data', chunk => { body += chunk; if (body.length > 512 * 1024) request.destroy(Error('request-limit')); });
  request.on('end', () => {
    try {
      assert.equal(request.method, 'POST'); assert.equal(request.url, '/v1/chat/completions'); const answer = replyFor(JSON.parse(body)); body = '';
      response.writeHead(200, { 'content-type': 'application/json' }); response.end(JSON.stringify(answer));
    } catch (error) { serverFailure = error.message.split('\n')[0]; response.writeHead(500); response.end('{}'); }
  });
});
server.on('connection', socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const profile = createProfileContext({ name: 'probe', homeDir: home, env });
fs.writeFileSync(path.join(profile.root, 'config.json'), JSON.stringify({ tuiMode: mode, allowedTools: ['read', 'glob', 'grep', 'research_run'],
  enableMcpTools: false, offline: true, cacheWarming: 'off', provider: 'openai-compatible', maxTurns: 4, maxOutputTokens: 1024,
  retryEnabled: false, retryMaxRetries: 0, providerRetryMaxRetries: 0, providerBodyTimeoutMs: 8000, hooks: {},
  providerCredentials: { 'openai-compatible': { apiKey: 'synthetic-fixture', baseUrl: `http://127.0.0.1:${server.address().port}/v1`, model: 'fixture' } } }));
const sessionId = withProfile(profile, () => { const manager = new SessionManager(), session = manager.createNew(project);
  manager.addTurn(session.id, { id: 'fixture-message', role: 'user', content: 'Public fixture saved history' }); manager.saveCompleted(session.id); return session.id; });
const configBefore = fs.readFileSync(path.join(profile.root, 'config.json'));
const session = () => withProfile(profile, () => new SessionManager().getSession(sessionId));
const state = () => JSON.parse(fs.readFileSync(path.join(profile.root, 'sessions', sessionId, 'state.json')));
const observe = () => { try { return JSON.parse(fs.readFileSync(observation)); } catch { return {}; } };
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const receipt = { mode, buildId: build.manifest.buildId, inputsDigest: build.manifest.inputsDigest, provider: 'loopback HTTP fixture; real adapter path', savedMessages: 1,
  limits: { heapMiB: 768, wallSeconds: 60, outputBytes: 2097152, requests: 30 }, status: 'not-run', cases };
let output = '', bytes = 0, closed = false, overflow = false, timedOut = false;
const child = spawn('python3', [path.join(root, '.omx/artifacts/phase20-addition-live-cli/relay.py'), '--', process.execPath,
  '--import', path.join(archive, 'observe.mjs'), path.join(root, 'scripts/start.mjs'), '--project', project, '--profile', 'probe', '--session-id', sessionId,
  '--no-context-files', '--no-skills', ...skills.flatMap(file => ['--skill', file]), '--offline'], { cwd: project, env, detached: true });
const close = new Promise(resolve => child.once('close', (code, signal) => { closed = true; resolve({ code, signal }); }));
for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => { bytes += chunk.length; if (bytes <= 2 * 1024 * 1024) output += chunk.toString('utf8'); else { overflow = true; child.kill('SIGTERM'); } });
const deadline = setTimeout(() => { timedOut = true; child.kill('SIGTERM'); }, 60000);
async function wait(predicate, label) { const until = Date.now() + 12000; while (Date.now() < until) {
  assert(!serverFailure, 'server-' + serverFailure); if (predicate()) return; assert(!closed, 'closed-' + label); assert(!overflow); await pause(25); } throw Error('timeout-' + label); }
const submit = input => child.stdin.write('\x03\x1b[200~' + input + '\x1b[201~\r');
try {
  await wait(() => output.includes('Ask anything, or / for commands') && observe().sessionId, 'startup'); assert.equal(observe().sessionId, sessionId);
  child.stdin.write('\x1bp'); await wait(() => observe().scope === 'accept-edits', 'accept-edits');
  child.stdin.write('\x1bp'); await wait(() => observe().scope === 'allow-all', 'allow-all');
  const invalid = '/deep-research --mode software /skill:one /skill:missing Versioned feature conditions';
  const beforeInvalid = JSON.stringify(state()); submit(invalid);
  await wait(() => observe().restoredDrafts?.includes(invalid) && observe().ends >= 1, 'unknown-second-skill-refused');
  assert.equal(requests, 0); assert.equal(state().research, undefined); assert.equal(JSON.stringify(state()), beforeInvalid);
  cases.push({ name: 'unknown second skill', exactDraftRestored: true, stateUnchanged: true, providerRequests: 0, researchRuns: 0 });
  const inputs = [
    { name: 'first-position with evidence', reads: true, input: '/deep-research --mode software --depth quick /skill:one /skill:two Versioned feature conditions', expected: 'completed' },
    { name: 'body entry without evidence', reads: false, input: 'Versioned feature conditions /deep-research --mode software --depth quick /skill:one\n/skill:two', expected: 'partial' },
  ];
  for (const [index, scenario] of inputs.entries()) {
    current = { name: scenario.name, reads: scenario.reads, rootRequests: 0, childRequests: 0, actualReads: 0 };
    const beforeEnds = observe().ends, beforeRequests = requests, outputStart = output.length;
    submit(scenario.input); await wait(() => observe().ends > beforeEnds, 'settled-' + scenario.name);
    const stored = state(), runs = stored.research?.runs ?? []; assert.equal(runs.length, index + 1);
    const run = runs.find(run => run.id === current.runId); assert(run, 'native run persisted'); assert.equal(run.status, scenario.expected, run.stopReason);
    assert.equal(run.request.methods.originalInput, scenario.input); assert.deepEqual(run.request.methods.skills.map(skill => skill.name), ['one', 'two']);
    assert.deepEqual(run.request.methods.skills.map(skill => skill.body.trim()), methods); assert.equal(run.save.status, 'not-requested');
    assert.deepEqual(run.children.map(child => child.stage), ['brief', 'investigate', 'gaps', 'draft', 'review', 'report', 'report', 'report']);
    assert(run.children.every(child => child.status === 'completed' && child.requestIds.length >= 1));
    assert.equal(new Set(run.children.flatMap(child => child.requestIds)).size, current.childRequests);
    assert.equal(current.rootRequests, 2); assert.equal(current.actualReads, scenario.reads ? 2 : 0);
    assert.equal(run.fragments.length, 3); assert.equal(run.claims.length, scenario.reads ? 1 : 0);
    assert.equal(run.review.status, scenario.reads ? 'completed' : 'failed'); assert.equal(run.review.correlation, 'same-model-independent-context');
    assert(run.children.filter(child => child.stage === 'investigate' || child.stage === 'review').every(child => scenario.reads ? child.sourceIds.length > 0 : child.sourceIds.length === 0));
    // Re-reading identical selected content refreshes one content-addressed source.
    assert.equal(run.sources.length, scenario.reads ? 1 : 0);
    if (scenario.reads) {
      const investigator = run.children.find(child => child.stage === 'investigate'), reviewer = run.children.find(child => child.stage === 'review');
      assert.notEqual(investigator.id, reviewer.id); assert.deepEqual(investigator.sourceIds, reviewer.sourceIds);
      assert.equal(run.sources[0].childId, reviewer.id);
      assert(run.review.findings.every(finding => finding.references[0].sourceId === reviewer.sourceIds[0]));
    }
    if (scenario.reads) assert(run.sources.every(source => source.locator === 'release.md' && source.hashScope === 'selected-text'
      && source.contentHash === createHash('sha256').update(evidence).digest('hex')));
    assert.equal(run.pending, undefined);
    const ledger = stored.requestLedger?.scopes[run.ledgerScopeId]; assert(ledger, 'native research ledger exists'); assert(ledger.nextSequence > 1);
    assert(Object.values(stored.requestLedger?.scopes ?? {}).every(scope => Object.keys(scope.pending).length === 0));
    const turn = session().turns.find(turn => turn.role === 'user' && turn.metadata?.researchRunId === run.id);
    assert(turn); assert.equal(turn.metadata.originalInput, scenario.input);
    await wait(() => output.slice(outputStart).includes(`Public native research status: ${scenario.expected}`), 'visible-native-result-' + scenario.name);
    cases.push({ ...current, originalInputPreserved: true, durableSkillBodies: true, nativeStatus: run.status, review: run.review.status,
      sameModelCorrelation: run.review.correlation, requests: requests - beforeRequests, children: run.children.map(child => ({ stage: child.stage, status: child.status,
        requestIds: child.requestIds.length, sourceIds: child.sourceIds.length })), sources: run.sources.length, claims: run.claims.length, fragments: run.fragments.length,
      parentMetadataBound: true, ledgerScopePresent: true, ledgerNextSequence: ledger.nextSequence, ledgerPending: 0, nativeResultPainted: true, save: run.save.status });
  }
  child.stdin.write('\x04'); receipt.shutdown = await Promise.race([close, pause(6000).then(() => undefined)]);
  assert.deepEqual(receipt.shutdown, { code: 0, signal: null }); receipt.device = JSON.parse(fs.readFileSync(device)); assert(receipt.device.cookedFlagsRestored);
  assert(fs.readFileSync(path.join(profile.root, 'config.json')).equals(configBefore)); receipt.configurationUnchanged = true;
  assert.equal(fs.readFileSync(path.join(project, 'release.md'), 'utf8'), evidence);
  assert.deepEqual(fs.readdirSync(project).sort(), ['.git', 'one', 'release.md', 'two']); receipt.projectUnchanged = true;
  assert(observe().tools.filter(tool => tool.name === 'research_run').every(tool => tool.success));
  assert.equal(observe().tools.filter(tool => tool.name === 'research_run').length, 2); receipt.status = 'passed';
} catch (error) { receipt.status = 'failed'; receipt.failure = error.message.split('\n')[0];
  receipt.assertion = { actual: error.actual, expected: error.expected, location: error.stack?.split('\n').find(line => line.includes('pty.mjs:'))?.trim() }; receipt.observation = observe();
  receipt.nativeRuns = state().research?.runs.map(run => ({ id: run.id, status: run.status, stage: run.stage, stopReason: run.stopReason, children: run.children })); }
finally {
  clearTimeout(deadline); if (!closed) { child.kill('SIGTERM'); await Promise.race([close, pause(3000)]); if (!closed) { try { process.kill(-child.pid, 'SIGKILL'); } catch {} await close; } }
  for (const socket of sockets) socket.destroy(); await new Promise(resolve => server.close(resolve));
  receipt.requests = requests; receipt.readinessRequests = readiness; receipt.wire = wire; receipt.serverFailure = serverFailure;
  receipt.outputBytes = bytes; receipt.outputLimitExceeded = overflow; receipt.deadlineExceeded = timedOut; output = '';
  fs.rmSync(scratch, { recursive: true, force: true }); receipt.scratchRemoved = !fs.existsSync(scratch);
  fs.writeFileSync(path.join(archive, mode + '-receipt.json'), JSON.stringify(receipt, null, 2) + '\n'); console.log(JSON.stringify(receipt));
}
if (receipt.status !== 'passed') process.exitCode = 1;
