import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { SessionManager } from '../../session/SessionManager.js';
import { ConfigState } from '../../config/state.js';
import { getRuntimeConfig } from '../../config/runtimeConfig.js';
import { configurationBinding } from '../../core/shell/configuration.js';
import type { ShellRuntimeContext } from '../../core/shell/runtimeContext.js';
import type { ShellSessionRuntime } from '../../core/shell/sessionRuntime.js';
import { HookDispatcher } from '../../core/hooks/hookDispatcher.js';
import { routeSlashCommand } from '../../core/commands/slashRouter.js';
import { installJobsRuntime, closeJobsFor, jobsFor } from '../runtime/jobs.js';
import { evaluationCommandFor, cancelEvaluationFor } from '../runtime/evaluation.js';
import { EvaluationStore } from '../../eval/workflow/store.js';
import { EvaluationOwner, liveEvaluations } from './owner.js';
import { compareEvaluation } from '../../eval/workflow/scoring.js';
import { assertEvaluationPlacement } from '../../eval/workflow/isolation.js';
import * as sandbox from '../../sandbox/osSandbox.js';
import * as native from '../../runtime/execution/local.js';
import * as fileWrites from '../../edit/authority/commit.js';

let scratch: string; let root: string; let manager: SessionManager; let context: ShellRuntimeContext; let runtime: ShellSessionRuntime;
let approvals: string[]; let decision: (name: string) => Promise<'allow-once' | 'deny'>;
const candidateProgram = `import fs from 'node:fs'; import path from 'node:path';
const sample = JSON.parse(fs.readFileSync(0, 'utf8'));
const candidate = JSON.parse(fs.readFileSync(path.join(process.env.EVAL_CANDIDATE_ROOT, 'candidate.json'), 'utf8'));
if (candidate.mode === 'failure') process.exit(3);
if (candidate.mode === 'invalid') { console.log('SECRET_HOLDOUT_RAW'); process.exit(0); }
if (candidate.mode === 'probe') {
  const grader = path.join(path.dirname(process.env.EVAL_CANDIDATE_ROOT), 'evaluator', 'evaluator.mjs');
  const exposed = fs.existsSync(grader) || Object.hasOwn(sample, 'expected') || Object.hasOwn(process.env, 'EVALUATION_SECRET');
  console.log(JSON.stringify({ value: exposed ? 2 : 0, cost: 1 })); process.exit(0);
}
const quality = candidate.mode === 'training' && sample.id.startsWith('hold') ? 0 : candidate.quality;
console.log(JSON.stringify({ value: quality, cost: candidate.cost }));`;
const evaluator = `import fs from 'node:fs';
const sample = JSON.parse(fs.readFileSync(0, 'utf8'));
const actual = JSON.parse(sample.actual);
console.log(JSON.stringify({ metrics: { quality: actual.value === sample.expected ? 2 : 0, cost: actual.cost } }));`;
function writeCandidate(quality: number, mode = 'all', cost = 1) { fs.writeFileSync(path.join(root, 'candidate.json'), JSON.stringify({ quality, cost, mode })); }
function install() {
  installJobsRuntime(context, manager, runtime, tool => ({ sessionId: context.session.id, workspaceRoot: root,
    agentMode: 'build', permissionScope: 'ask', hooks: new HookDispatcher(), emit: event => manager.appendQueryEvent(context.session.id, event),
    escalationPromptHandler: async prompt => { const name = prompt.context.toolName; approvals.push(name);
      return { decision: await decision(name), promptId: prompt.id, respondedAt: Date.now() }; }, admission: () => undefined }));
}
beforeEach(() => {
  scratch = fs.mkdtempSync(path.resolve(process.cwd(), '../../.tmp/evaluation-test-')); root = path.join(scratch, 'project'); fs.mkdirSync(path.join(root, '.git'), { recursive: true });
  const home = path.join(scratch, 'home'); fs.mkdirSync(home); vi.stubEnv('HOME', home); vi.stubEnv('USERPROFILE', home); vi.stubEnv('GIT_CEILING_DIRECTORIES', scratch);
  manager = new SessionManager(); context = { session: manager.createNew(root), cwd: root, projectRoot: root } as ShellRuntimeContext;
  context.configuration = new ConfigState(getRuntimeConfig(root), configurationBinding(context));
  Object.defineProperty(context, 'runtimeConfig', { get: () => context.configuration.current.config });
  runtime = { getCurrentRunController: () => null, getAgentMode: () => 'build', getPermissionScope: () => 'ask' } as unknown as ShellSessionRuntime;
  approvals = []; decision = async () => 'allow-once'; writeCandidate(0);
  fs.writeFileSync(path.join(root, 'evaluator.mjs'), evaluator);
  fs.writeFileSync(path.join(root, 'candidate.mjs'), candidateProgram);
  fs.writeFileSync(path.join(root, 'evaluation.json'), JSON.stringify({ version: 1, entry: 'evaluator.mjs', candidateEntry: 'candidate.mjs', evaluator: ['evaluator.mjs'],
    editable: ['candidate.json'], context: ['candidate.mjs'], runtime: 'node', target: { name: 'quality', direction: 'higher', threshold: 1 },
    guardrails: [{ name: 'cost', direction: 'lower', threshold: 0 }],
    samples: ['trainA', 'trainB', 'holdA', 'holdB'].map(id => ({ id, split: id.startsWith('hold') ? 'holdout' : 'train', input: { label: id.startsWith('hold') ? 'SECRET_HOLDOUT_INPUT' : id }, expected: 2 })),
    repetitions: 1, maxRounds: 8, timeoutMs: 3000 })); install();
});
afterEach(async () => { cancelEvaluationFor(context); await closeJobsFor(context); vi.restoreAllMocks(); vi.unstubAllEnvs(); fs.rmSync(scratch, { recursive: true, force: true }); });
async function command(args: string) {
  const result = await routeSlashCommand('/improve ' + args, { cwd: root, sessionId: context.session.id, improveCommand: evaluationCommandFor(context) });
  if (result?.kind !== 'local') throw new Error('Expected native evaluator result.'); return result.output;
}
function row() { return new EvaluationStore(manager, context.session).read().runs.at(-1)!; }
async function patch(quality: number, mode = 'all', cost = 1) {
  const current = fs.readFileSync(path.join(row().directory!.path, 'candidate', 'candidate.json'), 'utf8');
  fs.writeFileSync(path.join(root, 'candidate.patch'), `*** Begin Patch\n*** Update File: candidate.json\n@@\n-${current}\n+${JSON.stringify({ quality, cost, mode })}\n*** End Patch\n`);
  return command('patch candidate.patch');
}
it('runs native fixed samples, preserves source through scoring, and publishes only after final reevaluation plus separate approval', async () => {
  let setupFailure: unknown; const initialize = EvaluationOwner.prototype.initialize;
  vi.spyOn(EvaluationOwner.prototype, 'initialize').mockImplementation(function (this: EvaluationOwner, captured) {
    try { initialize.call(this, captured); } catch (error) { setupFailure = (error as Error).cause; throw error; }
  });
  const started = await command('start evaluation.json'); expect(started, String(setupFailure)).toContain('initialized'); expect(row().rounds[0]).toMatchObject({ status: 'completed', verdict: 'baseline', measurements: expect.any(Array) });
  expect(row().rounds[0]!.measurements).toHaveLength(4); await patch(2);
  const original = fs.readFileSync(path.join(root, 'candidate.json'), 'utf8'); await command('check');
  expect(row().rounds.at(-1)).toMatchObject({ verdict: 'improved', kind: 'candidate' }); expect(fs.readFileSync(path.join(root, 'candidate.json'), 'utf8')).toBe(original);
  expect(await command('publish')).toContain('published'); expect(row()).toMatchObject({ phase: 'published', operationId: expect.stringMatching(/^op-/) });
  expect(row().rounds.at(-1)).toMatchObject({ kind: 'final', verdict: 'improved', status: 'completed' });
  expect(JSON.parse(fs.readFileSync(path.join(root, 'candidate.json'), 'utf8')).quality).toBe(2);
  expect(approvals).toEqual(['improve_start', 'improve_check', 'improve_patch', 'improve_check', 'improve_check', 'improve_publish']);
});
it('rejects training-only improvement and guardrail regression with actual evaluator output', async () => {
  await command('start evaluation.json'); await patch(2, 'training'); await command('check'); expect(row().rounds.at(-1)?.verdict).toBe('rejected');
  await patch(2, 'all', 2); await command('publish'); expect(row().rounds.at(-1)).toMatchObject({ kind: 'final', verdict: 'rejected' });
  expect(approvals).not.toContain('improve_publish'); expect(JSON.parse(fs.readFileSync(path.join(root, 'candidate.json'), 'utf8')).quality).toBe(0);
});
it('refuses incomplete comparison and does not expose holdout bodies or raw evaluator failures', async () => {
  await command('start evaluation.json'); const initial = row();
  expect(() => compareEvaluation(initial.frozen.spec, initial.rounds[0]!, initial.rounds[0]!.measurements.slice(1))).toThrow('Incomplete');
  expect(await command('status')).not.toContain('SECRET_HOLDOUT_INPUT'); await patch(2, 'invalid');
  expect(await command('check')).not.toContain('SECRET_HOLDOUT_RAW'); expect(row().rounds.at(-1)?.status).toBe('failed'); expect(row().rounds.at(-1)?.verdict).toBeUndefined();
  expect(initial.rounds[0]!.measurements).toHaveLength(4);
});
it('freezes evaluator bytes and samples and refuses out-of-scope candidate patches', async () => {
  await command('start evaluation.json'); fs.writeFileSync(path.join(root, 'bad.patch'), '*** Begin Patch\n*** Update File: evaluator.mjs\n@@\n+console.log(1)\n*** End Patch\n');
  expect(await command('patch bad.patch')).toContain('Only declared');
  fs.writeFileSync(path.join(row().directory!.path, 'evaluator', 'evaluator.mjs'), evaluator + '\n// changed');
  expect(await command('check')).toContain('Immutable'); expect(row().rounds).toHaveLength(1);
});
it('never dispatches when isolation is unavailable and retains a failed baseline without improvement', async () => {
  vi.spyOn(sandbox, 'planSandboxedCommand').mockReturnValue({ state: 'refused' }); const run = vi.spyOn(native, 'executeLocally');
  await command('start evaluation.json'); expect(run).not.toHaveBeenCalled(); expect(row().rounds[0]?.status).toBe('failed'); expect(row().rounds[0]?.verdict).toBeUndefined();
  expect(await patch(2)).toContain('completed baseline'); expect(await command('publish')).toContain('baseline');
});
it('denies publication separately and rejects a source edit arriving during the approval', async () => {
  await command('start evaluation.json'); await patch(2); decision = async name => name === 'improve_publish' ? 'deny' : 'allow-once';
  expect(await command('publish')).toContain('refused'); expect(row().phase).toBe('active');
  decision = async name => { if (name === 'improve_publish') writeCandidate(7); return 'allow-once'; };
  expect(await command('publish')).toContain('changed'); expect(JSON.parse(fs.readFileSync(path.join(root, 'candidate.json'), 'utf8')).quality).toBe(7);
  expect(row().phase).toBe('active');
});
it.each(['revocation', 'fixed source drift'])('stops further original writes after %s between publication targets', async change => {
  fs.writeFileSync(path.join(root, 'extra.txt'), 'before');
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'evaluation.json'), 'utf8')); manifest.editable.push('extra.txt');
  fs.writeFileSync(path.join(root, 'evaluation.json'), JSON.stringify(manifest));
  await command('start evaluation.json'); await patch(2);
  fs.writeFileSync(path.join(root, 'candidate.patch'), '*** Begin Patch\n*** Update File: extra.txt\n@@\n-before\n+after\n*** End Patch\n');
  await command('patch candidate.patch');
  const commit = fileWrites.commitWorkspaceFile; let revoked = false;
  vi.spyOn(fileWrites, 'commitWorkspaceFile').mockImplementation(input => {
    const result = commit(input);
    if (!revoked && input.workspaceRoot === root && input.relativePath === 'candidate.json') {
      revoked = true;
      if (change === 'revocation') cancelEvaluationFor(context);
      else fs.appendFileSync(path.join(root, 'evaluator.mjs'), '\n// changed after the first original write\n');
    }
    return result;
  });
  const output = await command('publish');
  expect(revoked).toBe(true); expect(fs.readFileSync(path.join(root, 'extra.txt'), 'utf8')).toBe('before');
  expect(row().phase).not.toBe('published'); expect(output).toMatch(/unknown|partial/);
  expect(await command('check')).toContain('No live');
});
it('refuses exposed system ancestors, aliases and runtime overlap before isolated dispatch', () => {
  const alias = path.join(scratch, 'system'); fs.symlinkSync('/usr', alias, 'dir');
  expect(() => assertEvaluationPlacement(alias, scratch, process.execPath)).toThrow('outside exposed system');
  expect(() => assertEvaluationPlacement(root, '/etc', process.execPath)).toThrow('outside exposed system');
  expect(() => assertEvaluationPlacement(root, scratch, path.join(root, 'node'))).toThrow('outside exposed system');
  expect(() => assertEvaluationPlacement(root, scratch, fs.realpathSync(process.execPath))).not.toThrow();
});
it('preserves evaluation state across ordinary prompt persistence and refuses restart adoption', async () => {
  await command('start evaluation.json'); const before = JSON.stringify(row()); manager.persistUserPromptBarrier(context.session.id, 'Ordinary main prompt');
  expect(JSON.stringify(row())).toBe(before); liveEvaluations.delete(context); await closeJobsFor(context); install();
  expect(await command('status')).toContain('unknown'); expect(await command('check')).toContain('No live');
  expect(row().rounds).toHaveLength(1); expect(await command('stop')).toContain('retained'); expect(row().phase).toBe('retained');
});
it('retains an evaluation-only session at graceful exit while ordinary empty sessions are discarded', async () => {
  decision = async name => name === 'improve_check' ? 'deny' : 'allow-once'; await command('start evaluation.json');
  const directory = row().directory!.path; const empty = manager.createNew(root);
  manager.saveTerminated(context.session.id); manager.saveTerminated(empty.id);
  expect(manager.sessionExists(context.session.id)).toBe(true); expect(manager.sessionExists(empty.id)).toBe(false);
  expect(row().directory!.path).toBe(directory); expect(fs.existsSync(path.join(directory, 'candidate', 'candidate.json'))).toBe(true);
});
it('revokes setup and write authority while an approval is pending', async () => {
  decision = async name => { if (name === 'improve_start') cancelEvaluationFor(context); return 'allow-once'; };
  await command('start evaluation.json'); expect(new EvaluationStore(manager, context.session).read().runs).toEqual([]);
  decision = async () => 'allow-once'; await command('start evaluation.json');
  decision = async name => { if (name === 'improve_patch') cancelEvaluationFor(context); return 'allow-once'; };
  expect(await patch(2)).toContain('authority'); expect(JSON.parse(fs.readFileSync(path.join(row().directory!.path, 'candidate', 'candidate.json'), 'utf8')).quality).toBe(0);
});
it('holds unknown native cleanup as unknown and refuses another evaluator dispatch', async () => {
  await command('start evaluation.json'); await patch(2);
  const run = vi.spyOn(native, 'executeLocally').mockResolvedValue({ status: 'failed', exitCode: null, stdout: '', stderr: '', terminationFailed: true });
  expect(await command('check')).toContain('unknown'); expect(row().rounds.at(-1)?.status).toBe('unknown');
  await command('check'); expect(run).toHaveBeenCalledTimes(1); expect(row().phase).toBe('active'); expect(await command('status')).toContain('unknown');
});
it('keeps the grader, expected outcomes and inherited secrets outside the actual candidate process', async () => {
  vi.stubEnv('EVALUATION_SECRET', 'synthetic-hidden'); await command('start evaluation.json'); await patch(2, 'probe'); await command('check');
  expect(row().rounds.at(-1)).toMatchObject({ status: 'completed', verdict: 'rejected' });
  expect(row().rounds.at(-1)!.measurements.every(measure => measure.receiptId !== measure.candidateReceiptId)).toBe(true);
});
