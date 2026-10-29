import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { StringDecoder } from 'node:string_decoder';
import { stripVTControlCharacters } from 'node:util';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { checkBuild } from '../../../scripts/start-lib.mjs';
import { createQaPtyEnvironment } from '../../../scripts/qa-pty-env.mjs';
const root = process.cwd(), base = path.join(root, '.tmp/live-cli');
const archive = path.join(root, '.omx/artifacts/phase20-addition-live-cli');
fs.mkdirSync(base, { recursive: true, mode: 0o700 });
const build = checkBuild({ root, dist: path.join(root, 'packages/ts-shell/dist'),
  version: JSON.parse(fs.readFileSync('packages/ts-shell/package.json')).version, executablePolicy: 'ignore' });
assert(build.ok, 'build-unavailable');
const buildRoot = path.dirname(path.dirname(build.entry));
const load = file => import(pathToFileURL(path.join(buildRoot, file)));
const { getRuntimeConfig } = await load('config/runtimeConfig.js');
const { resolveCliCredential } = await load('cli/provider/cliProviderRuntimeBridge.js');
const { resolveUserDataFile } = await load('core/paths/userHome.js');
const { userCatalogPath, loadCatalog } = await load('core/models/catalogStore.js');
const { createProfileContext, withProfile } = await load('core/paths/profile/context.js');
const { SessionManager } = await load('session/SessionManager.js');
const { readSessionModelEdit, writeSessionModel } = await load('session/model/state.js');
const { setFilePersistenceEnabled } = await load('observability/structuredLogger.js');
setFilePersistenceEnabled(false);
const config = getRuntimeConfig(root), selected = resolveCliCredential(config, {});
assert.equal(selected.provider, 'openai-compatible', 'target-provider');
assert.equal(selected.model, 'bailu-2.9-preview', 'target-model');
assert(selected.credential?.authMode === 'api-key' && selected.credential.apiKey, 'credential-unavailable');
assert(!config.providerConnections.some(connection => connection.accountAuth)
  && !Object.values(config.providerCredentials).some(credential => credential.accountAuth), 'rotating-owner-unavailable');
const endpointHost = new URL(selected.baseUrl).hostname;
const targets = [resolveUserDataFile('config.json'), userCatalogPath()];
const digest = text => createHash('sha256').update(text).digest('hex');
const operatorBefore = targets.map(file => digest(fs.readFileSync(file)));
const providers = loadCatalog().filter(provider => provider.runtime === selected.provider && provider.baseUrl
  && new URL(provider.baseUrl).hostname === endpointHost && provider.models.some(model => model.id === selected.model));
assert.equal(providers.length, 1, 'catalog-ambiguous');
const model = providers[0].models.find(model => model.id === selected.model);
const catalog = JSON.stringify({ providers: { [providers[0].id]: { ...providers[0], models: [model] } } });
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const mode = process.argv[2] ?? 'regular';
assert(['regular', 'fullscreen'].includes(mode), 'mode');
const scratch = fs.mkdtempSync(path.join(base, 'run-'));
fs.chmodSync(scratch, 0o700);
const home = path.join(scratch, 'home'), project = path.join(scratch, 'project');
fs.mkdirSync(home); fs.mkdirSync(project);
const env = { ...createQaPtyEnvironment(home, project), CHEERS_PROVIDER_MODE: 'real',
  NODE_OPTIONS: '--max-old-space-size=768', CHEERS_PROBE_BUILD: buildRoot };
assert.equal(spawnSync('rtk', ['git', 'init', '-q'], { cwd: project, env, stdio: 'ignore' }).status, 0, 'git-fixture');
const profile = createProfileContext({ name: 'probe', homeDir: home, env });
fs.writeFileSync(path.join(profile.root, 'models.json'), catalog, { mode: 0o600 });
const overrideFile = path.join(scratch, 'override.json');
fs.writeFileSync(overrideFile, JSON.stringify({ tuiMode: mode, tui: { displayMode: mode },
  maxTurns: 1, maxOutputTokens: 1024, allowedTools: [], enableMcpTools: false,
  retryEnabled: false, retryMaxRetries: 0, providerRetryMaxRetries: 0,
  providerConnectTimeoutMs: 10000, providerHeadersTimeoutMs: 30000, providerBodyTimeoutMs: 30000,
  cacheWarming: 'off', offline: true, hooks: {} }), { mode: 0o600 });
const overrideBefore = fs.readFileSync(overrideFile);
const session = withProfile(profile, () => {
  const session = new SessionManager().createNew(project);
  writeSessionModel(session.id, { connectionScope: 'provider', provider: selected.provider, model: selected.model, thinkingEffort: 'high' },
    readSessionModelEdit(session.id));
  return session;
});
const readSession = () => withProfile(profile, () => new SessionManager().getSession(session.id));
const sample = { mode, buildId: build.manifest.buildId, inputsDigest: build.manifest.inputsDigest,
  provider: selected.provider, endpointHost, model: selected.model, effort: 'high', explicit: true,
  maxOutputTokens: 1024, tools: [], retryEnabled: false, status: 'not-run', phases: [] };
async function run(resume) {
  const telemetry = path.join(scratch, resume ? 'resume.json' : 'first.json');
  const device = path.join(scratch, resume ? 'resume-device.json' : 'first-device.json');
  let child, close, closed = false, output = '', bytes = 0, overflow = false, timedOut = false;
  const receipt = { phase: resume ? 'resume' : 'request', checks: {} };
  const current = () => { try { return JSON.parse(fs.readFileSync(telemetry)); } catch { return {}; } };
  async function wait(predicate, label, timeout = 10000) {
    const until = Date.now() + timeout;
    while (Date.now() < until) {
      assert(!overflow, 'output-cap'); if (predicate()) return;
      assert(!closed, 'closed-' + label); await pause(25);
    }
    throw Error('timeout-' + label);
  }
  const args = ['--project', project, '--profile', 'probe', '--session-id', session.id,
    '--config', targets[0], '--config', overrideFile, '--no-context-files', '--no-skills', '--offline'];
  child = spawn('python3', [path.join(archive, 'relay.py'), '--', process.execPath, '--import', path.join(archive, 'observe.mjs'),
    path.join(root, 'scripts/start.mjs'), ...args], {
    cwd: project, env: { ...env, CHEERS_PROBE_RECEIPT: telemetry, CHEERS_PROBE_DEVICE: device }, detached: true,
  });
  close = new Promise(resolve => child.once('close', (code, signal) => { closed = true; resolve({ code, signal }); }));
  child.once('error', () => { receipt.launchError = true; });
  for (const stream of [child.stdout, child.stderr]) {
    const decoder = new StringDecoder('utf8'); stream.on('data', chunk => {
      bytes += chunk.length; if (bytes <= 2 * 1024 * 1024) output += decoder.write(chunk);
      else { overflow = true; child.kill('SIGTERM'); }
    });
  }
  const deadline = setTimeout(() => { timedOut = true; child.kill('SIGTERM'); }, 65000);
  try {
    await wait(() => output.includes('Ask anything, or / for commands'), 'startup');
    const started = Date.now();
    if (!resume) {
      child.stdin.write('What is 17 times 19? Use brief reasoning, at most three short sentences. Reply with only the integer.\r');
      await wait(() => current().ended && current().result, 'response', 45000);
      receipt.requestMs = Date.now() - started;
    } else await wait(() => current().paints?.some(paint => paint.blocks.length === 1), 'restored-thinking');
    const stored = readSession();
    const assistants = stored.turns.filter(turn => turn.role === 'assistant');
    assert.equal(assistants.length, 1, 'assistant-count');
    const publicText = assistants[0].reasoning?.text;
    assert(publicText?.trim(), 'public-thinking');
    const fragments = publicText.split(/\r?\n/).flatMap(line => {
      const words = line.trim().split(/\s+/);
      return words.map((_, index) => words.slice(index, index + 3).join(' ')).filter(text => text.length >= 16);
    });
    receipt.reasoningCharacters = publicText.length; receipt.reasoningDigest = digest(publicText);
    receipt.answerCorrect = assistants[0].content === '323'; assert(receipt.answerCorrect, 'answer');
    const before = current();
    const shown = before.blocks ?? before.paints.at(-1).blocks;
    assert(shown.every(block => block.collapsed === true && block.finalized === true
      && block.digest === receipt.reasoningDigest), 'initial-display');
    for (const [index, collapsed] of [false, true, false].entries()) {
      const from = output.length;
      child.stdin.write('\x14');
      await wait(() => current().toggles?.length === index + 1 && output.length > from
        && current().paints?.at(-1)?.blocks.every(block => block.collapsed === collapsed), 'toggle-' + index);
      const toggle = current().toggles[index];
      assert(toggle.only === 'thinking' && toggle.changed && toggle.after.length === 1, 'toggle-target');
      assert(toggle.after[0].digest === receipt.reasoningDigest && toggle.after[0].finalized === true, 'toggle-content');
      assert(collapsed ? toggle.afterRows < toggle.beforeRows : toggle.afterRows > toggle.beforeRows, 'row-change');
      if (index === 0) await wait(() => {
        const visible = stripVTControlCharacters(output.slice(from));
        return fragments.some(fragment => visible.includes(fragment));
      }, 'painted-body');
    }
    receipt.checks.keyboardExpandCollapseExpand = true;
    receipt.checks.actualPtyBody = true; receipt.checks.storedDisplayMatch = true;
    receipt.observation = current();
    if (resume) {
      receipt.checks.noResumedRequest = Object.keys(receipt.observation.events).length === 0;
      assert(receipt.checks.noResumedRequest, 'resumed-request');
    } else {
      const observation = receipt.observation;
      receipt.checks.singleSuccessfulRequest = observation.result?.status === 'completed'
        && observation.result.terminalClassification === 'success'
        && observation.events['message.started'] === 1 && observation.events['query.completed'] === 1
        && !observation.events['query.failed'] && observation.usage.length === 1
        && observation.usage[0].turns === 1 && observation.usage[0].toolCalls === 0
        && observation.usage[0].buckets.length === 1 && observation.usage[0].buckets[0].requests === 1;
      assert(receipt.checks.singleSuccessfulRequest, 'request-count');
    }
    const exitFrom = output.length, exitStarted = Date.now();
    child.stdin.write('\x04');
    receipt.shutdown = await Promise.race([close, pause(6000).then(() => undefined)]);
    receipt.exitMs = Date.now() - exitStarted;
    assert.deepEqual(receipt.shutdown, { code: 0, signal: null }, 'shutdown');
    const finalOutput = output.slice(exitFrom);
    receipt.checks.restoreEscapes = ['\x1b[?1049l', '\x1b[?2004l', '\x1b[?1003l', '\x1b[?25h'].every(code => finalOutput.includes(code));
    receipt.device = JSON.parse(fs.readFileSync(device));
    assert(receipt.device.cookedFlagsRestored, 'cooked-flags');
    assert(receipt.checks.restoreEscapes, 'restore-escapes');
    receipt.status = 'passed';
  } catch(error) {
    receipt.status = 'failed';
    receipt.failure = /^(timeout-|closed-)[\w-]+$/.test(error.message) ? error.message : 'assertion';
    receipt.observation = current();
  } finally {
    clearTimeout(deadline);
    if (!closed) { child.kill('SIGTERM'); await Promise.race([close, pause(3000)]);
      if (!closed) { try { process.kill(-child.pid, 'SIGKILL'); } catch {} await close; } }
    receipt.outputBytes = bytes; receipt.outputLimitExceeded = overflow; receipt.deadlineExceeded = timedOut;
    output = ''; sample.phases.push(receipt);
  }
  assert.equal(receipt.status, 'passed', 'phase-failed');
}
try {
  await run(false); await run(true);
  sample.checks = { operatorFilesUnchanged: targets.every((file, index) => digest(fs.readFileSync(file)) === operatorBefore[index]),
    overrideUnchanged: fs.readFileSync(overrideFile).equals(overrideBefore),
    noCredentialCopies: !fs.existsSync(path.join(profile.root, 'config.json')), sessionTerminated: readSession().status === 'terminated' };
  assert(Object.values(sample.checks).every(Boolean), 'isolation'); sample.status = 'passed';
} catch { sample.status = 'failed'; }
finally { fs.rmSync(scratch, { recursive: true, force: true }); sample.scratchRemoved = !fs.existsSync(scratch); }
fs.writeFileSync(path.join(base, mode + '-receipt.json'), JSON.stringify(sample, null, 2) + '\n');
console.log(JSON.stringify(sample)); process.exitCode = sample.status === 'passed' ? 0 : 1;
