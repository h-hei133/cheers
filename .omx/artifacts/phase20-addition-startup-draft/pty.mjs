import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { checkBuild } from '../../../scripts/start-lib.mjs';
import { createQaPtyEnvironment } from '../../../scripts/qa-pty-env.mjs';

const root = process.cwd(), archive = path.join(root, '.omx/artifacts/phase20-addition-startup-draft');
const mode = process.argv[2] ?? 'regular'; assert(['regular', 'fullscreen'].includes(mode));
const build = checkBuild({ root, dist: path.join(root, 'packages/ts-shell/dist'),
  version: JSON.parse(fs.readFileSync('packages/ts-shell/package.json')).version, executablePolicy: 'ignore' });
assert(build.ok); const built = path.dirname(path.dirname(build.entry));
const load = file => import(pathToFileURL(path.join(built, file)));
const { createProfileContext } = await load('core/paths/profile/context.js');
(await load('observability/structuredLogger.js')).setFilePersistenceEnabled(false);
const base = path.join(root, '.tmp/startup-draft'); fs.mkdirSync(base, { recursive: true });
const scratch = fs.mkdtempSync(path.join(base, 'run-'));
const home = path.join(scratch, 'home'), project = path.join(scratch, 'project');
fs.mkdirSync(home); fs.mkdirSync(project);
const observation = path.join(scratch, 'observe.json'), device = path.join(scratch, 'device.json');
const env = { ...createQaPtyEnvironment(home, project), NODE_OPTIONS: '--max-old-space-size=768',
  CHEERS_PROBE_BUILD: built, CHEERS_PROBE_RECEIPT: observation, CHEERS_PROBE_DEVICE: device };
assert.equal(spawnSync('rtk', ['git', 'init', '-q'], { cwd: project, env, stdio: 'ignore' }).status, 0);
const profile = createProfileContext({ name: 'probe', homeDir: home, env });
fs.writeFileSync(path.join(profile.root, 'config.json'),
  JSON.stringify({ tuiMode: mode, enableMcpTools: false, offline: true, cacheWarming: 'off', hooks: {} }));
const observe = () => { try { return JSON.parse(fs.readFileSync(observation)); } catch { return {}; } };
const receipt = { mode, status: 'not-run', buildId: build.manifest.buildId, inputsDigest: build.manifest.inputsDigest,
  limits: { heapMiB: 768, wallSeconds: 40, outputBytes: 1048576 } };
let output = '', bytes = 0, closed = false, overflow = false;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const child = spawn('python3', [path.join(root, '.omx/artifacts/phase20-addition-live-cli/relay.py'), '--', process.execPath,
  '--import', path.join(archive, 'observe.mjs'), path.join(root, 'scripts/start.mjs'), '--project', project, '--profile', 'probe',
  '--no-context-files', '--no-skills', '--offline'], { cwd: project, env, detached: true });
const close = new Promise(resolve => child.once('close', (code, signal) => { closed = true; resolve({ code, signal }); }));
for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => {
  bytes += chunk.length; if (bytes <= 1048576) output += chunk.toString('utf8'); else { overflow = true; child.kill('SIGTERM'); }
});
const deadline = setTimeout(() => child.kill('SIGTERM'), 40000);
try {
  // Type during loading: three lines, then wait for the real runtime to adopt.
  child.stdin.write('line one\rline two\rline three');
  // A non-empty draft suppresses the placeholder, so readiness is observed as a
  // settled render count plus the adopted draft, not the placeholder text.
  const until = Date.now() + 20000;
  let previous = -1, stableSince = 0;
  while (Date.now() < until) {
    assert(!closed, 'closed-before-ready'); assert(!overflow);
    const renders = observe().renders ?? 0;
    if (renders > 3 && renders === previous) { stableSince += 25; if (stableSince >= 300) break; }
    else { previous = renders; stableSince = 0; }
    await pause(25);
  }
  assert((observe().renders ?? 0) > 3, 'runtime-not-ready');
  await pause(400);
  const snapshot = observe().draft;
  receipt.draftAfterAdoption = snapshot;
  // The draft typed during loading must survive intact, with the caret after it.
  assert.equal(snapshot.text, 'line one\nline two\nline three', 'draft text changed across adoption');
  assert.equal(snapshot.cursor, snapshot.text.length, 'caret not at end of the adopted draft');
  // Deleting from the end must remove real characters, not phantom blank rows.
  for (let index = 0; index < 5; index++) child.stdin.write('\x7f');
  await pause(250);
  const trimmed = observe().draft;
  receipt.afterBackspaces = trimmed;
  assert.equal(trimmed.length, snapshot.length - 5, 'backspace did not remove five characters');
  assert.equal(trimmed.text, snapshot.text.slice(0, -5), 'backspace removed the wrong characters');
  receipt.status = 'passed';
} catch (error) { receipt.status = 'failed'; receipt.failure = error.message.split('\n')[0]; receipt.observation = observe(); }
finally {
  clearTimeout(deadline);
  child.stdin.write('\x04');
  const shutdown = await Promise.race([close, pause(8000).then(() => undefined)]);
  if (!closed) { child.kill('SIGTERM'); await Promise.race([close, pause(3000)]);
    if (!closed) { try { process.kill(-child.pid, 'SIGKILL'); } catch {} await close; } }
  receipt.shutdown = shutdown ?? { code: null, signal: 'unknown' };
  receipt.outputTail = output.slice(-4000).replaceAll(scratch, '<scratch>');
  receipt.outputBytes = bytes; receipt.outputLimitExceeded = overflow;
  fs.rmSync(scratch, { recursive: true, force: true }); receipt.scratchRemoved = !fs.existsSync(scratch);
  fs.writeFileSync(path.join(archive, mode + '-receipt.json'), JSON.stringify(receipt, null, 2) + '\n');
  console.log(JSON.stringify(receipt));
}
if (receipt.status !== 'passed') process.exitCode = 1;
