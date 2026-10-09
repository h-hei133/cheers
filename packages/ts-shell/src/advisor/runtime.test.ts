import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { afterEach, expect, it, vi } from 'vitest';
import { createAdvisorHarness, cleanupAdvisorHarnesses, advisorResult } from '../test-utils/advisor.js';
import { AdvisorRuntime } from './runtime.js';
import { readAdvisor } from './store.js';
import { readBoundSessionState } from '../session/store/bound.js';
import { goalRequestPolicy } from '../planning/goal/budget.js';
import { writeGoal, readGoalEdit } from '../planning/goal/store.js';
import { runAdvisorCommand } from './command.js';
import type { CommandContext } from '../core/commands/types.js';

afterEach(cleanupAdvisorHarnesses);

function remote(setup: ReturnType<typeof createAdvisorHarness>, action: 'inspect' | 'cycle' | 'abandon'): Promise<void> {
  const script = path.join(setup.directory, 'remote-control.mjs'); const input = path.join(setup.directory, 'input.json');
  fs.writeFileSync(input, JSON.stringify({ session: setup.session, sourcePromptEntryId: setup.sourcePromptEntryId }));
  fs.writeFileSync(script, `import fs from 'node:fs';
import { AdvisorRuntime } from ${JSON.stringify(path.resolve('src/advisor/runtime.ts'))};
import { SessionManager } from ${JSON.stringify(path.resolve('src/session/SessionManager.ts'))};
const input=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
const runtime=new AdvisorRuntime({store:new SessionManager(),current:()=>input.session,report:()=>{}});
if(process.argv[3]==='inspect') runtime.view();
else if(process.argv[3]==='cycle'){runtime.setEnabled(false);runtime.configure({target:'openai/other-review-model',every:1,timeoutMs:100,mode:'turn'});runtime.setEnabled(true);}
else {runtime.configure({target:'openai/review-model',every:1,timeoutMs:100,mode:'turn'});runtime.setEnabled(true);
await runtime.capture({sourcePromptEntryId:input.sourcePromptEntryId,step:1,willContinue:false,failed:false,messages:[{role:'assistant',content:'abandoned checkpoint'}]},()=>new Promise(()=>{}),new AbortController().signal);process.exit(0);}
`);
  return new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, [path.resolve('../../node_modules/tsx/dist/cli.mjs'), script, input, action], { cwd: process.cwd(), env: { ...process.env }, stdio: ['ignore', 'pipe', 'pipe'] });
    let errors = ''; child.stderr.on('data', chunk => { errors += String(chunk); }); child.on('error', reject);
    child.on('exit', code => code === 0 ? resolve() : reject(new Error(`isolated advisor child ${code}: ${errors}`)));
  });
}

it('defaults off, sends nothing without a model and keeps configuration off until explicit enable', async () => {
  const setup = createAdvisorHarness(false, false); const runner = vi.fn(async () => advisorResult());
  const statePath = path.join(setup.manager.getSessionDirPath(setup.session.id), 'state.json'); const before = fs.readFileSync(statePath);
  expect(setup.runtime.view().status).toBe('off'); expect(fs.readFileSync(statePath)).toEqual(before);
  await setup.runtime.capture(setup.boundary('off'), runner, setup.signal);
  expect(setup.runtime.setEnabled(true).status).toBe('no-model');
  await setup.runtime.capture(setup.boundary('no-model'), runner, setup.signal);
  setup.runtime.configure({ target: 'openai/review-model', every: 1, timeoutMs: 500, mode: 'turn' });
  await setup.runtime.capture(setup.boundary('configured-off'), runner, setup.signal);
  expect(runner).not.toHaveBeenCalled(); expect(setup.runtime.view().enabled).toBe(false);
  setup.runtime.setEnabled(true); await setup.runtime.capture(setup.boundary('explicit-on'), runner, setup.signal);
  expect(runner).toHaveBeenCalledOnce();
});

it('requires explicit enable on reentry while preserving config, notes and read-only state bytes', async () => {
  const setup = createAdvisorHarness(); const runner = vi.fn(async () => advisorResult());
  await setup.runtime.capture(setup.boundary('captured'), runner, setup.signal);
  const reentered = new AdvisorRuntime(setup.host); const statePath = path.join(setup.manager.getSessionDirPath(setup.session.id), 'state.json'); const before = fs.readFileSync(statePath);
  const context = { sessionId: setup.session.id, projectRoot: setup.root } as CommandContext;
  expect(reentered.view()).toMatchObject({ status: 'paused', config: setup.runtime.view().config, notes: setup.runtime.view().notes });
  await runAdvisorCommand(['status'], context, reentered, false); await runAdvisorCommand(['dump'], context, reentered, false);
  await reentered.capture(setup.boundary('not-armed'), runner, setup.signal);
  expect(fs.readFileSync(statePath)).toEqual(before); expect(runner).toHaveBeenCalledOnce();
});

it('an actual separate process reads without mutation and off/configure/on epoch fences an older armed host', async () => {
  const setup = createAdvisorHarness(); const statePath = path.join(setup.manager.getSessionDirPath(setup.session.id), 'state.json'); const before = fs.readFileSync(statePath);
  await remote(setup, 'inspect'); expect(fs.readFileSync(statePath)).toEqual(before);
  await remote(setup, 'cycle'); const runner = vi.fn(async () => advisorResult());
  await setup.runtime.capture(setup.boundary('old-host'), runner, setup.signal);
  expect(runner).not.toHaveBeenCalled(); expect(setup.runtime.view().status).toBe('paused');
  expect(readAdvisor(setup.manager, setup.session).advisor.config!.target).toBe('openai/other-review-model');
});

it('explicit enable recovers an actual dead owner claim without releasing unknown shared model usage', async () => {
  const setup = createAdvisorHarness();
  await remote(setup, 'abandon');
  const pending = readAdvisor(setup.manager, setup.session).advisor.pending; expect(pending?.owner).toBeDefined();
  writeGoal(setup.manager, setup.session, readGoalEdit(setup.manager, setup.session), { type: 'prepare', objective: 'Unknown model dispatch remains' });
  const attempt = goalRequestPolicy(setup.manager, setup.session)!.reserve({ requestId: 'unknown-advisor', bodyDigest: '0'.repeat(64), provider: 'openai', model: 'review-model', endpoint: 'test', purpose: 'turn',
    bound: { inputTokens: 1, outputTokens: 1, source: 'isolated-test', version: '1' } }); attempt.dispatch();
  const ledger = readBoundSessionState(setup.manager, setup.session).state.requestLedger;
  await remote(setup, 'inspect'); expect(readAdvisor(setup.manager, setup.session).advisor.pending).toEqual(pending);
  const reopened = new AdvisorRuntime(setup.host); reopened.setEnabled(true);
  expect(reopened.view().pending).toBeUndefined(); expect(readBoundSessionState(setup.manager, setup.session).state.requestLedger).toEqual(ledger);
  expect(setup.reports.join('\n')).toContain('Unresolved model requests remain');
});

it.each([['configure', 'openai/model', '--every', '0'], ['configure', 'bare-model'], ['configure', 'openai/model', '--timeout', '60001'], ['configure', 'openai/model', '--mode', 'any'], ['on', 'extra']])('rejects invalid advisor command %j without sends or state writes', async (...args) => {
  const setup = createAdvisorHarness(false, false); const statePath = path.join(setup.manager.getSessionDirPath(setup.session.id), 'state.json'); const before = fs.readFileSync(statePath);
  const result = await runAdvisorCommand(args, { sessionId: setup.session.id, projectRoot: setup.root } as CommandContext, setup.runtime, false);
  expect(result.kind).toBe('local'); expect(fs.readFileSync(statePath)).toEqual(before);
});
