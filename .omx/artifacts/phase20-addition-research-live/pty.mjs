import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { parse } from 'jsonc-parser';
import { checkBuild } from '../../../scripts/start-lib.mjs';
import { createQaPtyEnvironment } from '../../../scripts/qa-pty-env.mjs';

const root = process.cwd(), archive = path.join(root, '.omx/artifacts/phase20-addition-research-live');
const base = path.join(root, '.tmp/research-live'); fs.mkdirSync(base, { recursive: true });
const model = process.argv[2] ?? 'gpt-6.1-terra'; assert(['gpt-6.1-terra', 'gpt-6.1-sol'].includes(model));
const receiptFile = path.join(archive, model + '-receipt.json');
assert(!fs.existsSync(receiptFile), 'preserve-existing-receipt');
const build = checkBuild({ root, dist: root + '/packages/ts-shell/dist', version: JSON.parse(fs.readFileSync('packages/ts-shell/package.json')).version, executablePolicy: 'ignore' });
assert(build.ok); const built = path.dirname(path.dirname(build.entry));
const load = file => import(pathToFileURL(path.join(built, file)));
const { createProfileContext, withProfile } = await load('core/paths/profile/context.js');
const { resolveUserDataFile } = await load('core/paths/userHome.js');
const { SessionManager } = await load('session/SessionManager.js');
(await load('observability/structuredLogger.js')).setFilePersistenceEnabled(false);
const operatorFile = resolveUserDataFile('config.json'), operatorBytes = fs.readFileSync(operatorFile);
const operatorDigest = createHash('sha256').update(operatorBytes).digest('hex');
const configured = parse(operatorBytes.toString()), credential = configured.providerCredentials?.['openai-compatible'];
assert.equal(configured.provider, 'openai-compatible', 'configured-provider-unavailable');
assert(credential?.apiKey && credential?.baseUrl && !credential.accountAuth, 'configured-credential-unavailable');
const sensitive = [credential.apiKey, credential.baseUrl];
const scratch = fs.mkdtempSync(path.join(base, 'run-')); fs.chmodSync(scratch, 0o700);
const home = path.join(scratch, 'home'), project = path.join(scratch, 'project'); fs.mkdirSync(home); fs.mkdirSync(project);
const documents = {
  'release.md': '# Official release note\nVersion: v2. Platform: Linux.\nThe feature is enabled only when FEATURE_X=1. With FEATURE_X=0 it is disabled.\nWindows is unsupported in v2.\n',
  'mirror.md': '# Unversioned mirror\nThis mirror claims the feature is enabled by default on all platforms, including Windows.\nIt provides no version, configuration, experiment or primary-source citation.\n',
};
for (const [file, text] of Object.entries(documents)) fs.writeFileSync(path.join(project, file), text);
const methods = {
  primary: 'PUBLIC_PRIMARY_METHOD: Read release.md as the versioned primary source. Preserve v2, Linux and FEATURE_X conditions. Use actual native receipt IDs and exact retained quotes. Treat missing evidence as missing.',
  critical: 'PUBLIC_CRITICAL_METHOD: Read mirror.md and actively try to disprove unqualified all-platform/default-enabled claims using the primary release. Preserve contradictions and limitations. Same-model review is not independent confirmation.',
};
const skills = Object.entries(methods).map(([name, text]) => {
  const file = path.join(scratch, name, 'SKILL.md'); fs.mkdirSync(path.dirname(file));
  fs.writeFileSync(file, `---\nname: ${name}\ndescription: Public bounded research method\n---\n${text}`); return file;
});
const question = 'Using only release.md and mirror.md in this isolated workspace, determine the feature conditions for v2. Is the mirror claim of default enablement on Windows supported? Use native read tools, preserve contradictions, and report only evidence-bound conclusions. Do not use the network or save a report.';
const input = `/deep-research --mode software --depth quick /skill:primary /skill:critical ${question}`;
const observation = path.join(scratch, 'observe.json'), device = path.join(scratch, 'device.json');
const env = { ...createQaPtyEnvironment(home, project), CHEERS_PROVIDER_MODE: 'real', NODE_OPTIONS: '--max-old-space-size=768',
  CHEERS_PROBE_BUILD: built, CHEERS_PROBE_RECEIPT: observation, CHEERS_PROBE_DEVICE: device };
assert.equal(spawnSync('rtk', ['git', 'init', '-q'], { cwd: project, env, stdio: 'ignore' }).status, 0);
const profile = createProfileContext({ name: 'probe', homeDir: home, env }), configFile = path.join(profile.root, 'config.json');
fs.writeFileSync(configFile, JSON.stringify({ tuiMode: 'regular', allowedTools: ['read', 'glob', 'grep', 'research_run'],
  enableMcpTools: false, offline: true, cacheWarming: 'off', provider: 'openai-compatible', maxTurns: 4, maxOutputTokens: 1536,
  retryEnabled: false, retryMaxRetries: 0, providerRetryMaxRetries: 0, providerConnectTimeoutMs: 10000,
  providerHeadersTimeoutMs: 45000, providerBodyTimeoutMs: 60000, hooks: {},
  providerCredentials: { 'openai-compatible': { apiKey: credential.apiKey, baseUrl: credential.baseUrl, model } } }), { mode: 0o600 });
assert.equal(fs.statSync(configFile).mode & 0o777, 0o600); const configBefore = fs.readFileSync(configFile);
const sessionId = withProfile(profile, () => { const manager = new SessionManager(), session = manager.createNew(project);
  manager.addTurn(session.id, { id: 'fixture-message', role: 'user', content: 'Public fixture saved history' }); manager.saveCompleted(session.id); return session.id; });
const state = () => { const file = path.join(profile.root, 'sessions', sessionId, 'state.json'); assert(fs.statSync(file).size < 2 * 1024 * 1024, 'state-limit'); return JSON.parse(fs.readFileSync(file)); };
const observe = () => { try { return JSON.parse(fs.readFileSync(observation)); } catch { return {}; } };
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const receipt = { status: 'not-run', mode: 'regular', provider: 'configured openai-compatible live endpoint', requestedModel: model, backendModel: 'unconfirmed',
  buildId: build.manifest.buildId, inputsDigest: build.manifest.inputsDigest, savedMessages: 1, limits: { heapMiB: 768, wallSeconds: 360,
    outputBytes: 2097152, requestedMaxOutputTokens: 1536, retryEnabled: false, nativeDepth: 'quick', allowedTools: ['read', 'glob', 'grep', 'research_run'] }, checks: {} };
let output = '', bytes = 0, closed = false, overflow = false, timedOut = false, lastProgress = '', child;
const begun = Date.now();
child = spawn('python3', [path.join(root, '.omx/artifacts/phase20-addition-live-cli/relay.py'), '--', process.execPath,
  '--import', path.join(archive, 'observe.mjs'), path.join(root, 'scripts/start.mjs'), '--project', project, '--profile', 'probe', '--session-id', sessionId,
  '--no-context-files', '--no-skills', ...skills.flatMap(file => ['--skill', file]), '--offline'], { cwd: project, env, detached: true });
const close = new Promise(resolve => child.once('close', (code, signal) => { closed = true; resolve({ code, signal }); }));
for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => { bytes += chunk.length; if (bytes <= 2 * 1024 * 1024) output += chunk.toString('utf8'); else { overflow = true; child.kill('SIGTERM'); } });
const deadline = setTimeout(() => { timedOut = true; child.kill('SIGTERM'); }, 360000);
async function wait(predicate, label, milliseconds = 15000) { const until = Date.now() + milliseconds; while (Date.now() < until) {
  if (predicate()) return; assert(!closed, 'closed-' + label); assert(!overflow, 'output-limit'); await pause(100); } throw Error('timeout-' + label); }
function failureKind() {
  const observed = observe();
  const classes = [...(observed.failures ?? []), ...(observed.outcomes ?? [])].map(value => value.classification);
  return classes.find(value => value !== 'unclassified-live-or-runtime') ?? 'unclassified-live-or-runtime';
}
function summarize(run, stored) {
  const ledger = stored.requestLedger?.scopes[run.ledgerScopeId];
  const references = [...run.claims.flatMap(claim => [...claim.supporting, ...claim.opposing]), ...(run.review?.findings.flatMap(finding => finding.references) ?? [])];
  const publicHashes = new Set(Object.values(documents).map(text => createHash('sha256').update(text).digest('hex')));
  return { status: run.status, stage: run.stage, runId: run.id, depth: run.request.depth,
    methods: run.request.methods?.skills.map(skill => Object.hasOwn(methods, skill.name) ? skill.name : 'other'),
    originalInputPreserved: run.request.methods?.originalInput === input,
    methodBodiesPreserved: run.request.methods?.skills.every(skill => methods[skill.name] === skill.body.trim()),
    children: run.children.map(item => ({ id: item.id, stage: item.stage, status: item.status, requestIds: item.requestIds.length, sourceIds: item.sourceIds.length })),
    childRequestIds: new Set(run.children.flatMap(item => item.requestIds)).size,
    sources: run.sources.map(source => ({ id: source.id, publicLocator: Object.hasOwn(documents, source.locator) ? source.locator : 'other',
      status: source.status, hashScope: source.hashScope, matchesFixtureHash: publicHashes.has(source.contentHash), excerpts: source.excerpts.length })),
    claims: run.claims.map(claim => ({ support: claim.support, supporting: claim.supporting.length, opposing: claim.opposing.length,
      versionCondition: /v2/i.test(claim.scope + ' ' + claim.text), linuxCondition: /linux/i.test(claim.scope + ' ' + claim.text),
      featureCondition: /FEATURE_X/i.test(claim.scope + ' ' + claim.text), windowsMentioned: /windows/i.test(claim.scope + ' ' + claim.text) })),
    allReferencesBound: references.every(reference => run.sources.some(source => !source.stale && source.id === reference.sourceId
      && source.excerpts.some(excerpt => excerpt.id === reference.excerptId && excerpt.text.includes(reference.quote)))),
    review: run.review ? { status: run.review.status, correlation: run.review.correlation,
      findings: run.review.findings.map(finding => ({ outcome: finding.outcome, references: finding.references.length })), uncovered: run.review.uncovered.length } : { status: 'not-run' },
    fragments: run.fragments.length, coverage: { covered: run.draft?.covered.length ?? 0, uncovered: run.draft?.uncovered.length ?? 0 },
    pendingChild: !!run.pending, ownerRetained: !!run.owner, save: run.save.status,
    ledger: ledger ? { present: true, nextSequence: ledger.nextSequence, pending: Object.keys(ledger.pending).length,
      dispatchedUnknown: Object.values(ledger.pending).filter(attempt => attempt.dispatched).length,
      unsent: Object.values(ledger.pending).filter(attempt => !attempt.dispatched).length,
      inputTokens: ledger.inputTokens, outputTokens: ledger.outputTokens, historyUnknown: ledger.historyUnknown, breach: !!ledger.breach } : { present: false } };
}
try {
  await wait(() => output.includes('Ask anything, or / for commands') && observe().sessionId, 'startup'); assert.equal(observe().sessionId, sessionId);
  child.stdin.write('\x1bp'); await wait(() => observe().scope === 'accept-edits', 'accept-edits');
  child.stdin.write('\x1bp'); await wait(() => observe().scope === 'allow-all', 'allow-all');
  child.stdin.write('\x1b[200~' + input + '\x1b[201~\r');
  await wait(() => {
    const stored = state(), run = stored.research?.runs[0];
    if (run) {
      const progress = `${run.stage}:${run.children.length}:${run.status}`;
      if (progress !== lastProgress) { lastProgress = progress; console.log(JSON.stringify({ progress, elapsedSeconds: Math.round((Date.now() - begun) / 1000),
        nativeChildRequests: new Set(run.children.flatMap(child => child.requestIds)).size })); }
    }
    return observe().ends >= 1;
  }, 'live-turn', 330000);
  const stored = state(), runs = stored.research?.runs ?? [];
  assert.equal(runs.length, 1, 'one-native-run'); const run = runs[0]; receipt.native = summarize(run, stored);
  receipt.observation = observe();
  receipt.outcome = run.status; receipt.classification = ['completed', 'partial'].includes(run.status) && run.children.length ? 'native-live-result' : failureKind();
  receipt.checks.oneRun = true; receipt.checks.methods = receipt.native.methodBodiesPreserved && receipt.native.methods.join(',') === 'primary,critical';
  receipt.checks.originalInput = receipt.native.originalInputPreserved; receipt.checks.referencesBound = receipt.native.allReferencesBound;
  receipt.checks.noSaveRequested = run.save.status === 'not-requested'; receipt.checks.noUnexpectedTool = observe().tools.every(tool => tool.name !== 'other');
  receipt.checks.noPendingChild = !run.pending; receipt.checks.ownerReleased = !run.owner;
  receipt.ledgerSettled = !!receipt.native.ledger.present && receipt.native.ledger.pending === 0;
  receipt.checks.ledgerOutcomeRetained = !!receipt.native.ledger.present && receipt.native.ledger.unsent === 0
    && (receipt.ledgerSettled || receipt.native.ledger.dispatchedUnknown === receipt.native.ledger.pending);
  if (run.status === 'completed') assert(receipt.ledgerSettled, 'completed-ledger-unsettled');
  child.stdin.write('\x04'); receipt.shutdown = await Promise.race([close, pause(8000).then(() => undefined)]);
  assert.deepEqual(receipt.shutdown, { code: 0, signal: null }); receipt.device = JSON.parse(fs.readFileSync(device)); assert(receipt.device.cookedFlagsRestored, 'terminal-restored');
  receipt.checks.fixtureConfigUnchanged = fs.readFileSync(configFile).equals(configBefore);
  receipt.checks.projectUnchanged = Object.entries(documents).every(([file, text]) => fs.readFileSync(path.join(project, file), 'utf8') === text)
    && fs.readdirSync(project).length === 3;
  for (const check of Object.values(receipt.checks)) assert(check, 'runtime-check');
  receipt.status = run.status === 'completed' ? 'bounded-live-completed' : run.children.length ? 'partial-live-evidence' : 'provider-or-model-unverified';
} catch (error) {
  receipt.status = 'failed'; receipt.failure = /^(timeout|closed)-[a-z-]+$/.test(error.message) ? error.message : 'probe-assertion';
  receipt.classification = failureKind(); receipt.observation = observe();
  try { const stored = state(), run = stored.research?.runs?.[0]; if (run) receipt.native = summarize(run, stored); } catch {}
} finally {
  clearTimeout(deadline); if (!closed) { child.kill('SIGTERM'); await Promise.race([close, pause(12000)]); if (!closed) { try { process.kill(-child.pid, 'SIGKILL'); } catch {} await close; } }
  receipt.outputBytes = bytes; receipt.outputLimitExceeded = overflow; receipt.deadlineExceeded = timedOut; receipt.elapsedSeconds = Math.round((Date.now() - begun) / 1000);
  receipt.checks.operatorConfigUnchanged = createHash('sha256').update(fs.readFileSync(operatorFile)).digest('hex') === operatorDigest;
  output = ''; fs.rmSync(scratch, { recursive: true, force: true }); receipt.checks.secretFixtureRemoved = !fs.existsSync(scratch);
  const serialized = JSON.stringify(receipt, null, 2) + '\n'; assert(sensitive.every(value => !serialized.includes(value)), 'secret-scan');
  fs.writeFileSync(receiptFile, serialized);
  console.log(serialized);
}
if (!['bounded-live-completed', 'partial-live-evidence'].includes(receipt.status)) process.exitCode = 1;
