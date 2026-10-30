// A turn interrupted mid-flight keeps its reasoning in the saved message, and
// reopening shows the thinking block.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { checkBuild } from '/home/wang/projects/cheers/scripts/start-lib.mjs';
const root = process.cwd();
const build = checkBuild({ root, dist: path.join(root, 'packages/ts-shell/dist'),
  version: JSON.parse(fs.readFileSync('packages/ts-shell/package.json')).version, executablePolicy: 'ignore' });
assert(build.ok);
const built = path.dirname(path.dirname(build.entry));
const load = f => import(pathToFileURL(path.join(built, f)));
const { createProfileContext, withProfile } = await load('core/paths/profile/context.js');
const { SessionManager } = await load('session/SessionManager.js');
const { restoreConversation } = await load('cli/interactive/history.js');
(await load('observability/structuredLogger.js')).setFilePersistenceEnabled(false);
const base = path.join(root, '.tmp/interrupt-thinking'); fs.mkdirSync(base, { recursive: true });
const scratch = fs.mkdtempSync(path.join(base, 'run-'));
const home = path.join(scratch, 'home'), project = path.join(scratch, 'project');
fs.mkdirSync(home); fs.mkdirSync(project);
spawnSync('rtk', ['git', 'init', '-q'], { cwd: project, stdio: 'ignore' });
const env = { ...process.env, HOME: home, USERPROFILE: home, CHEERS_TEST_ROOT: home };
const profile = createProfileContext({ name: 'default', homeDir: home, env });
const receipt = { status: 'not-run' };
try {
  const setup = withProfile(profile, () => {
    const manager = new SessionManager(), session = manager.createNew(project);
    manager.persistUserPromptBarrier(session.id, 'A question', undefined);
    // A turn that produced reasoning but no answer before being interrupted.
    manager.addTurn(session.id, { role: 'assistant', content: '',
      reasoning: { text: 'I was working this out.', signature: 'opaque-sig' } });
    manager.saveInterrupted(session.id, 'turn');
    return { sessionId: session.id };
  });
  receipt.blocks = withProfile(profile, () => {
    const session = new SessionManager().getSession(setup.sessionId);
    return restoreConversation(session.turns).blocks.map(b => ({ kind: b.kind, text: b.text, collapsed: b.collapsed }));
  });
  receipt.reasoningPreserved = receipt.blocks.some(b => b.kind === 'thinking' && b.text === 'I was working this out.');
  receipt.signatureNotShown = !JSON.stringify(receipt.blocks).includes('opaque-sig');
  receipt.status = 'passed';
} catch (error) { receipt.status = 'failed'; receipt.failure = String(error).split('\n')[0]; }
finally {
  fs.rmSync(scratch, { recursive: true, force: true }); receipt.scratchRemoved = !fs.existsSync(scratch);
  console.log(JSON.stringify(receipt));
}
if (receipt.status !== 'passed') process.exitCode = 1;
