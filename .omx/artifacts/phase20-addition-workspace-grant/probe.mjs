// End-to-end: an out-of-workspace write is refused, the documented grant path
// makes the same write succeed, and the grant is bound to the directory identity.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { checkBuild } from '../../../scripts/start-lib.mjs';

const root = process.cwd(), archive = path.join(root, '.omx/artifacts/phase20-addition-workspace-grant');
const build = checkBuild({ root, dist: path.join(root, 'packages/ts-shell/dist'),
  version: JSON.parse(fs.readFileSync('packages/ts-shell/package.json')).version, executablePolicy: 'ignore' });
assert(build.ok); const built = path.dirname(path.dirname(build.entry));
const load = file => import(pathToFileURL(path.join(built, file)));
const { createProfileContext, withProfile } = await load('core/paths/profile/context.js');
const { SessionManager } = await load('session/SessionManager.js');
const { changeSessionWorkspaceRoots } = await load('session/continuation/workspace.js');
const { createShellRuntimeContext } = await load('core/shell/runtimeContext.js');
(await load('observability/structuredLogger.js')).setFilePersistenceEnabled(false);

const base = path.join(root, '.tmp/workspace-grant'); fs.mkdirSync(base, { recursive: true });
const scratch = fs.mkdtempSync(path.join(base, 'run-'));
const home = path.join(scratch, 'home'), project = path.join(scratch, 'project'), outside = path.join(scratch, 'outside');
fs.mkdirSync(home); fs.mkdirSync(project); fs.mkdirSync(outside);
spawnSync('rtk', ['git', 'init', '-q'], { cwd: project, stdio: 'ignore' });
const env = { ...process.env, HOME: home, USERPROFILE: home, CHEERS_TEST_ROOT: home };
const profile = createProfileContext({ name: 'probe', homeDir: home, env });
const receipt = { buildId: build.manifest.buildId, inputsDigest: build.manifest.inputsDigest, status: 'not-run' };

try {
  const setup = withProfile(profile, () => {
    const manager = new SessionManager(), session = manager.createNew(project);
    manager.addTurn(session.id, { id: 'q', role: 'user', content: 'A question' });
    return { sessionId: session.id, manager };
  });

  // Resolve the tool surface the way a real turn does.
  const { createCoreToolRegistry } = await load('core/tools/registry.js');
  const makeContext = session => ({
    workspaceRoot: project, workspaceRoots: session.workspaceRoots, sessionId: session.id,
    abortSignal: undefined, cwd: project,
  });
  // The profile must be active while the tool runs: the edit ledger derives its
  // storage root from the current profile, exactly as a real turn does.
  const runWrite = async (target, content) => withProfile(profile, async () => {
    const session = new SessionManager().getSession(setup.sessionId);
    const tools = createCoreToolRegistry({});
    const write = [...tools.values()].find(tool => tool.name === 'write');
    assert(write, 'write tool missing');
    try {
      const result = await write.execute({ path: target, content }, makeContext(session));
      return { ok: !result.isError, output: result.output ?? '' };
    } catch (error) { return { ok: false, output: error instanceof Error ? error.message : String(error) }; }
  });

  const targetFile = path.join(outside, 'note.txt');
  const refused = await runWrite(targetFile, 'first');
  receipt.refusedBeforeGrant = { ok: refused.ok, mentionsGrant: /\/workspace add/.test(refused.output),
    mentionsWriteFlag: /--write/.test(refused.output), fileCreated: fs.existsSync(targetFile) };
  assert.equal(refused.ok, false, 'out-of-workspace write must be refused');
  assert.match(refused.output, /\/workspace add/);
  assert.match(refused.output, /--write/);
  assert.equal(fs.existsSync(targetFile), false, 'refused write must not create the file');

  // The documented path: attach the root with write access.
  const grant = withProfile(profile, () => changeSessionWorkspaceRoots({
    manager: setup.manager, session: new SessionManager().getSession(setup.sessionId),
    busy: () => false, action: 'add', target: outside, access: 'write',
  }));
  receipt.grant = { status: grant.status, note: grant.note, roots: grant.session?.workspaceRoots?.map(root => ({ path: root.path, access: root.access })) };
  assert.equal(grant.status, 'changed');

  const allowed = await runWrite(targetFile, 'first');
  receipt.allowedAfterGrant = { ok: allowed.ok, output: allowed.output?.slice(0, 400), fileCreated: fs.existsSync(targetFile),
    content: fs.existsSync(targetFile) ? fs.readFileSync(targetFile, 'utf8') : undefined };
  assert.equal(allowed.ok, true, 'write must succeed after the grant');
  assert.equal(fs.readFileSync(targetFile, 'utf8'), 'first');

  // The grant is bound to the directory identity: replacing the directory must
  // stop the old grant from authorizing the same path.
  fs.rmSync(outside, { recursive: true, force: true }); fs.mkdirSync(outside);
  const afterReplace = await runWrite(targetFile, 'second');
  receipt.afterDirectoryReplace = { ok: afterReplace.ok, content: fs.existsSync(targetFile) ? fs.readFileSync(targetFile, 'utf8') : undefined };
  assert.equal(afterReplace.ok, false, 'replaced directory must not inherit the old grant');

  receipt.status = 'passed';
} catch (error) { receipt.status = 'failed'; receipt.failure = error instanceof Error ? error.message.split('\n')[0] : String(error); }
finally {
  fs.rmSync(scratch, { recursive: true, force: true }); receipt.scratchRemoved = !fs.existsSync(scratch);
  fs.writeFileSync(path.join(archive, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n');
  console.log(JSON.stringify(receipt));
}
if (receipt.status !== 'passed') process.exitCode = 1;
