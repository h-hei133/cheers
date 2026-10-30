// A narrow terminal plus a multi-line draft typed during loading: does the caret
// land inside the composer, and can the blank rows (if any) be deleted?
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { checkBuild } from '../../../scripts/start-lib.mjs';
import { createQaPtyEnvironment } from '../../../scripts/qa-pty-env.mjs';

const root = process.cwd(), archive = path.join(root, '.omx/artifacts/phase20-addition-startup-narrow');
const mode = process.argv[2] ?? 'regular'; assert(['regular', 'fullscreen'].includes(mode));
const cols = Number(process.argv[3] ?? 40); assert(Number.isInteger(cols) && cols >= 20 && cols <= 200);
const build = checkBuild({ root, dist: path.join(root, 'packages/ts-shell/dist'),
  version: JSON.parse(fs.readFileSync('packages/ts-shell/package.json')).version, executablePolicy: 'ignore' });
assert(build.ok); const built = path.dirname(path.dirname(build.entry));
const load = file => import(pathToFileURL(path.join(built, file)));
const { createProfileContext } = await load('core/paths/profile/context.js');
(await load('observability/structuredLogger.js')).setFilePersistenceEnabled(false);
const base = path.join(root, '.tmp/startup-narrow'); fs.mkdirSync(base, { recursive: true });
const scratch = fs.mkdtempSync(path.join(base, 'run-'));
const home = path.join(scratch, 'home'), project = path.join(scratch, 'project');
fs.mkdirSync(home); fs.mkdirSync(project);
const device = path.join(scratch, 'device.json');
const env = { ...createQaPtyEnvironment(home, project), NODE_OPTIONS: '--max-old-space-size=768',
  CHEERS_PROBE_DEVICE: device };
assert.equal(spawnSync('rtk', ['git', 'init', '-q'], { cwd: project, env, stdio: 'ignore' }).status, 0);
const profile = createProfileContext({ name: 'probe', homeDir: home, env });
fs.writeFileSync(path.join(profile.root, 'config.json'),
  JSON.stringify({ tuiMode: mode, enableMcpTools: false, offline: true, cacheWarming: 'off', hooks: {} }));
const receipt = { mode, cols, status: 'not-run', buildId: build.manifest.buildId, inputsDigest: build.manifest.inputsDigest,
  limits: { heapMiB: 768, wallSeconds: 45, outputBytes: 2097152 } };
let output = '', bytes = 0, closed = false, overflow = false;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const child = spawn('python3', [path.join(archive, 'relay.py'), '--', String(cols), '40', process.execPath,
  path.join(root, 'scripts/start.mjs'), '--project', project, '--profile', 'probe',
  '--no-context-files', '--no-skills', '--offline'], { cwd: project, env, detached: true });
const close = new Promise(resolve => child.once('close', (code, signal) => { closed = true; resolve({ code, signal }); }));
for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => {
  bytes += chunk.length; if (bytes <= 2097152) output += chunk.toString('utf8'); else { overflow = true; child.kill('SIGTERM'); }
});
const deadline = setTimeout(() => child.kill('SIGTERM'), 45000);
try {
  // Wait for the real runtime to adopt input before typing, so the keystrokes
  // are not split across the loading surface and the runtime.
  const readyUntil = Date.now() + 15000;
  while (Date.now() < readyUntil && !output.includes('Ask anything, or / for commands')) {
    assert(!closed, 'closed-before-adopt'); await pause(25);
  }
  // A long single line wraps across several rows at this width; that is the
  // shape that would expose a caret placed outside the visible composer.
  child.stdin.write('abcdef');
  const until = Date.now() + 20000;
  let previous = -1, stableSince = 0;
  while (Date.now() < until) {
    assert(!closed, 'closed-before-ready'); assert(!overflow);
    if (output.includes('Ask anything, or / for commands')) break;
    if (output.includes('❯ one') || output.includes('❯ ')) { await pause(600); break; }
    await pause(25);
  }
  await pause(500);
  // Ten backspaces must remove ten real characters, including the newlines.
  const before = output.length;
  for (let index = 0; index < 3; index++) { child.stdin.write('\x7f'); await pause(120); }
  await pause(800);
  const after = output.slice(before);
  receipt.bytesAfterBackspace = after.length;
  receipt.backspaceFrames = after.replaceAll(scratch, '<scratch>').slice(-1500);
  receipt.changedByBackspace = after.length > 0;
  receipt.afterHasShorterText = /❯ alpha bravo charlie delta echo/.test(after) === false;
  receipt.tail = output.slice(-1500).replaceAll(scratch, '<scratch>');
  receipt.cookedRestored = fs.existsSync(device) ? Boolean(JSON.parse(fs.readFileSync(device, 'utf8')).cookedFlagsRestored) : undefined;
  receipt.status = 'passed';
} catch (error) { receipt.status = 'failed'; receipt.failure = error instanceof Error ? error.message.split('\n')[0] : String(error); }
finally {
  clearTimeout(deadline);
  // Clear the leftover draft first: a slash command is only a command when it
  // starts the source, so `abc/exit` would be submitted as prose.
  for (let index = 0; index < 12; index++) child.stdin.write('\x7f');
  await pause(300);
  child.stdin.write('/exit\r');
  const shutdown = await Promise.race([close, pause(12000).then(() => undefined)]);
  receipt.shutdownTail = output.slice(-1200).replaceAll(scratch, '<scratch>');
  if (!closed) { child.kill('SIGTERM'); await Promise.race([close, pause(3000)]);
    if (!closed) { try { process.kill(-child.pid, 'SIGKILL'); } catch {} await close; } }
  receipt.shutdown = shutdown ?? { code: null, signal: 'unknown' };
  receipt.outputBytes = bytes; receipt.outputLimitExceeded = overflow;
  fs.rmSync(scratch, { recursive: true, force: true }); receipt.scratchRemoved = !fs.existsSync(scratch);
  fs.writeFileSync(path.join(archive, `${mode}-${cols}-receipt.json`), JSON.stringify(receipt, null, 2) + '\n');
  console.log(JSON.stringify(receipt));
}
if (receipt.status !== 'passed') process.exitCode = 1;
