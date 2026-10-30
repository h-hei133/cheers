import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { checkBuild } from '../../../scripts/start-lib.mjs';
import { createQaPtyEnvironment } from '../../../scripts/qa-pty-env.mjs';
import { imageData } from '../phase20-addition-paste-retention/fixture.mjs';

const root = process.cwd(), archive = path.join(root, '.omx/artifacts/phase20-addition-image-restore');
const base = path.join(root, '.tmp/image-history'); fs.mkdirSync(base, { recursive: true });
const mode = process.argv[2] ?? 'regular'; assert(['regular', 'fullscreen'].includes(mode));
const build = checkBuild({ root, dist: path.join(root, 'packages/ts-shell/dist'),
  version: JSON.parse(fs.readFileSync('packages/ts-shell/package.json')).version, executablePolicy: 'ignore' });
assert(build.ok); const built = path.dirname(path.dirname(build.entry));
const load = file => import(pathToFileURL(path.join(built, file)));
const { createProfileContext, withProfile } = await load('core/paths/profile/context.js');
const { SessionManager } = await load('session/SessionManager.js');
(await load('observability/structuredLogger.js')).setFilePersistenceEnabled(false);
const scratch = fs.mkdtempSync(path.join(base, 'run-')), home = path.join(scratch, 'home'), project = path.join(scratch, 'project');
fs.mkdirSync(home); fs.mkdirSync(project);
const observation = path.join(scratch, 'observe.json'), device = path.join(scratch, 'device.json');
const env = { ...createQaPtyEnvironment(home, project), NODE_OPTIONS: '--max-old-space-size=768',
  CHEERS_PROBE_BUILD: built, CHEERS_PROBE_RECEIPT: observation, CHEERS_PROBE_DEVICE: device };
assert.equal(spawnSync('rtk', ['git', 'init', '-q'], { cwd: project, env, stdio: 'ignore' }).status, 0);
const profile = createProfileContext({ name: 'probe', homeDir: home, env });
const config = path.join(profile.root, 'config.json');
fs.writeFileSync(config, JSON.stringify({ tuiMode: mode, enableMcpTools: false, offline: true, cacheWarming: 'off', hooks: {} }));
const fixture = withProfile(profile, () => {
  const manager = new SessionManager(), session = manager.createNew(project);
  manager.addTurn(session.id, { id: 'base-question', role: 'user', content: 'Earlier public question' });
  manager.persistUserPromptBarrier(session.id, 'What is in this picture?', undefined, [{ type: 'image', data: imageData, mimeType: 'image/png' }]);
  const picture = manager.getSession(session.id).turns.at(-1);
  manager.persistUserPromptBarrier(session.id, '', undefined, [{ type: 'image', data: imageData, mimeType: 'image/png' }]);
  const onlyPicture = manager.getSession(session.id).turns.at(-1);
  manager.addTurn(session.id, { id: 'later-answer', role: 'assistant', content: 'Later public answer' });
  manager.saveCompleted(session.id);
  return { sessionId: session.id, pictureId: picture.id, onlyPictureId: onlyPicture.id,
    expected: picture.content, expectedOnly: onlyPicture.content, directory: manager.getSessionDirPath(session.id) };
});
const configBefore = fs.readFileSync(config), transcript = path.join(fixture.directory, 'transcript.jsonl');
const original = fs.readFileSync(transcript, 'utf8');
const observe = () => { try { return JSON.parse(fs.readFileSync(observation)); } catch { return {}; } };
const saved = () => withProfile(profile, () => new SessionManager().getSession(fixture.sessionId));
const receipt = { mode, status: 'not-run', savedMessages: 5, provider: 'synthetic without credentials; fetch rejects all calls',
  buildId: build.manifest.buildId, inputsDigest: build.manifest.inputsDigest,
  limits: { heapMiB: 768, wallSeconds: 45, outputBytes: 2097152 } };
let output = '', bytes = 0, overflow = false, timedOut = false, closed = false;
const child = spawn('python3', [path.join(root, '.omx/artifacts/phase20-addition-live-cli/relay.py'), '--', process.execPath,
  '--import', path.join(archive, 'observe.mjs'), path.join(root, 'scripts/start.mjs'), '--project', project, '--profile', 'probe',
  '--session-id', fixture.sessionId, '--no-context-files', '--no-skills', '--offline'], { cwd: project, env, detached: true });
const close = new Promise(resolve => child.once('close', (code, signal) => { closed = true; resolve({ code, signal }); }));
for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => {
  bytes += chunk.length;
  if (bytes <= 2 * 1024 * 1024) output += chunk.toString('utf8'); else { overflow = true; child.kill('SIGTERM'); }
});
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const deadline = setTimeout(() => { timedOut = true; child.kill('SIGTERM'); }, 45000);
async function wait(predicate, label) {
  const until = Date.now() + 10000;
  while (Date.now() < until) { if (predicate()) return; assert(!closed, 'closed-' + label); assert(!overflow); await pause(25); }
  throw Error('timeout-' + label);
}
try {
  await wait(() => output.includes('Ask anything, or / for commands') && observe().sessionId === fixture.sessionId, 'startup');
  // The restored conversation must carry both pictures: the one sent with words
  // and the one sent alone.
  await wait(() => (observe().restoredUserBlocks ?? []).length === 3, 'restored-user-blocks');
  const restored = observe().restoredUserBlocks;
  assert.deepEqual(restored.map(block => [block.text, block.images]), [
    ['Earlier public question', 0], ['What is in this picture?', 1], ['', 1],
  ]);
  receipt.restoredBlocks = restored;
  // The terminal in this fixture speaks no graphics protocol, so the restored
  // picture must be named in text rather than silently vanish.
  await wait(() => /image attachment: image\/png/.test(output), 'drawn-image-label');
  receipt.pictureDrawnAsLabel = true;
  assert.equal(observe().composerImages, 0);
  assert.equal(observe().draftLength, 0);
  assert.equal(observe().networkAttempts, 0);
  const after = saved();
  assert.equal(after.turns.filter(turn => turn.role === 'user').length, 3);
  assert.deepEqual(after.turns.find(turn => turn.id === fixture.pictureId).content, fixture.expected);
  assert.deepEqual(after.turns.find(turn => turn.id === fixture.onlyPictureId).content, fixture.expectedOnly);
  assert(fs.readFileSync(transcript, 'utf8').startsWith(original));
  receipt.history = { userMessages: 3, storedImagesUnchanged: true, transcriptPrefixUnchanged: true,
    noComposerImageInjection: true, zeroNetworkAttempts: true };
  assert(fs.readFileSync(config).equals(configBefore)); assert.deepEqual(fs.readdirSync(project), ['.git']);
  child.stdin.write('\x04');
  const shutdown = await Promise.race([close, pause(6000).then(() => undefined)]);
  assert.deepEqual(shutdown, { code: 0, signal: null });
  const cooked = JSON.parse(fs.readFileSync(device)); assert(cooked.cookedFlagsRestored);
  receipt.shutdown = shutdown; receipt.device = cooked; receipt.configurationUnchanged = true; receipt.projectUnchanged = true;
  receipt.status = 'passed';
} catch (error) { receipt.status = 'failed'; receipt.failure = error.message.split('\n')[0]; receipt.observation = observe(); }
finally {
  clearTimeout(deadline);
  if (!closed) {
    child.kill('SIGTERM'); await Promise.race([close, pause(3000)]);
    if (!closed) { try { process.kill(-child.pid, 'SIGKILL'); } catch {} await close; }
  }
  receipt.networkAttempts = observe().networkAttempts ?? 0;
  receipt.outputBytes = bytes; receipt.outputLimitExceeded = overflow; receipt.deadlineExceeded = timedOut;
  receipt.transcriptBaselineSha256 = createHash('sha256').update(original).digest('hex');
  fs.rmSync(scratch, { recursive: true, force: true }); receipt.scratchRemoved = !fs.existsSync(scratch);
  fs.writeFileSync(path.join(archive, mode + '-receipt.json'), JSON.stringify(receipt, null, 2) + '\n'); console.log(JSON.stringify(receipt));
}
if (receipt.status !== 'passed') process.exitCode = 1;
