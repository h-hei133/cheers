import fs from 'node:fs';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { createSubagentRunner } from '../../turn/subagent.js';
import type { StepFunction } from '../../turn/step.js';
import { createReadToolDefinition } from '../../core/tools/read.js';
import { createWebSearchToolDefinition } from '../../core/tools/webSearch.js';
import { createDefaultExecutionService } from '../../runtime/execution/service.js';
import { HookDispatcher } from '../../core/hooks/hookDispatcher.js';
import { cleanupResearch, finishResearch, fixtureClaim, researchBrief, researchHarness } from '../../test-utils/research.js';
import { sourceReceipt } from '../evidence/receipt.js';
import type { SourceRecord } from '../evidence/model.js';
import { readOnlyDelegation, delegationTools } from '../../core/subagents/capability.js';
import { readOnlyTool } from '../../core/tools/capability.js';
import { researchSaveTool } from '../report/save.js';
import { boundRun, updateRun } from './state.js';
import { toolSources } from '../evidence/producer.js';
import { SessionManager } from '../../session/SessionManager.js';
import { readResearch, currentResearch } from './store.js';
import { researchReport } from '../report/renderer.js';
import * as network from '../../core/network/connection.js';

afterEach(cleanupResearch);
it('runs actual read stages, bounded gap reinvestigation and a fresh adversarial context before ordered reports', async () => {
  const setup = researchHarness(); fs.writeFileSync(path.join(setup.root, 'release.md'), 'v2 enabled only on Linux.\n');
  const run = setup.runtime.create({ question: researchBrief.question, mode: 'software', depth: 'quick', save: false });
  let investigations = 0; const contexts: string[] = [];
  const step: StepFunction = async messages => {
    const prompt = messages.map(message => typeof message.content === 'string' ? message.content : '').find(text => text.startsWith('Research stage:'))!;
    const stage = /^Research stage: (\w+)/.exec(prompt)![1]; const input = JSON.parse(prompt.split('Research input: ')[1]!) as any;
    if (messages.length === 2) contexts.push(stage!);
    const reply = (value: unknown) => ({ text: JSON.stringify(value), toolCalls: [], stopReason: 'stop' as const });
    if (stage === 'brief') return reply(researchBrief);
    if ((stage === 'investigate' || stage === 'review') && messages.length === 2) {
      if (stage === 'investigate') investigations++;
      expect(prompt).not.toContain('PRIVATE_PARENT_HISTORY');
      return { text: 'Read actual evidence.', toolCalls: [{ id: `read-${stage}-${investigations}`, name: 'read', args: { path: 'release.md' } }], stopReason: 'stop' };
    }
    if (stage === 'investigate' || stage === 'review') {
      const body = String(messages.at(-1)!.content);
      expect(body).toContain('[Research sources]');
      const receipt = JSON.parse(body.split('[Research sources]\n')[1]!);
      const source = receipt.sources[0];
      const actual: SourceRecord = { ...input.sources[0], id: source.sourceId, excerpts: [{ id: source.excerpts[0].excerptId, text: source.excerpts[0].quote }] };
      const claim = fixtureClaim(actual);
      if (stage === 'review') return reply({ findings: input.claims.map((retained: { id: string }) => ({ claimId: retained.id,
        outcome: 'none-found', reason: 'Actual bounded re-read found no opposite result.', references: claim.supporting })), uncovered: [], limitation: 'Same model independent context.' });
      const claims = investigations === 1 ? [claim] : [claim, fixtureClaim(actual, 'q2')];
      return reply({ summary: 'Versioned result', claims, covered: investigations === 1 ? ['q1'] : ['q1', 'q2'], uncovered: investigations === 1 ? ['q2'] : [], limitations: [] });
    }
    if (stage === 'gaps') return reply({ gaps: investigations === 1 ? ['Read applicability evidence for q2.'] : [], covered: input.draft.covered, uncovered: input.draft.uncovered });
    if (stage === 'draft') return reply(input.draft);
    const reference = input.claims[0].supporting[0];
    return reply({ index: input.fragmentIndex, title: input.fragmentSections[input.fragmentIndex], text: `Bound finding [source:${reference.sourceId}#${reference.excerptId}]`,
      claimIds: ['c-q1'], sourceIds: [reference.sourceId], inputDigest: input.inputDigest });
  };
  const pool = new Map([['read', createReadToolDefinition(createDefaultExecutionService())]]);
  const runner = createSubagentRunner({ step, defaultMaxSteps: 16 }, pool, { workspaceRoot: setup.root, sessionId: setup.session.id,
    agentMode: 'build', permissionScope: 'ask', hooks: new HookDispatcher(), emit: () => {} });
  const finished = await setup.runtime.run(run.id, { taskId: 'native', workspaceRoot: setup.root, sessionId: setup.session.id, runSubagent: runner });
  expect(finished.status, finished.stopReason).toBe('completed'); expect(finished.investigationRounds).toBe(2);
  expect(contexts).toEqual(['brief', 'investigate', 'gaps', 'investigate', 'gaps', 'draft', 'review', 'report', 'report', 'report']);
  expect(finished.review).toMatchObject({ status: 'completed', correlation: 'same-model-independent-context' });
  expect(finished.claims.map(claim => claim.support)).toEqual(['direct', 'direct']); expect(finished.fragments).toHaveLength(3);
  expect(finished.children.find(child => child.stage === 'review')?.sourceIds).not.toEqual([]);
  expect(sourceReceipt(finished.sources).length).toBeLessThan(2000);
});
it.each(['no-reads', 'empty', 'omitted-claim'])('keeps native research partial when review is %s', async scenario => {
  const harness = researchHarness(); fs.writeFileSync(path.join(harness.root, 'release.md'), 'v2 enabled only on Linux.\n');
  const read = createReadToolDefinition(createDefaultExecutionService()); const args = { path: 'release.md' };
  const result = await read.execute(args, { taskId: 'initial', workspaceRoot: harness.root, sessionId: harness.session.id });
  const source = toolSources({ assistantMessage: { role: 'assistant', content: '' }, call: { id: 'initial', name: 'read', args }, args,
    result: { output: result.output!, metadata: result.metadata, isError: false }, isError: false }, 'initial', 1)[0]!;
  const claims = [fixtureClaim(source), fixtureClaim(source, 'q2')];
  const setup = finishResearch(harness, { status: 'ready', stage: 'review', review: undefined, sources: [source], claims,
    draft: { summary: 'Bound draft', claims, covered: ['q1', 'q2'], uncovered: [], limitations: [] } });
  const step: StepFunction = async messages => {
    const prompt = messages.map(message => String(message.content)).find(text => text.startsWith('Research stage:'))!;
    const input = JSON.parse(prompt.split('Research input: ')[1]!) as any;
    if (prompt.startsWith('Research stage: review')) {
      if (scenario !== 'no-reads' && messages.length === 2) return { text: '', toolCalls: [{ id: 'review-read', name: 'read', args: { path: 'release.md' } }], stopReason: 'stop' };
      const receipt = scenario === 'no-reads' ? undefined : JSON.parse(String(messages.at(-1)!.content).split('[Research sources]\n')[1]!);
      const source = receipt?.sources[0];
      return { text: JSON.stringify({ findings: scenario === 'omitted-claim' ? [{ claimId: 'c-q1', outcome: 'none-found',
        reason: 'Actual bounded review of q1.', references: [{ sourceId: source.sourceId, excerptId: source.excerpts[0].excerptId, quote: source.excerpts[0].quote }] }] : [],
      uncovered: [], limitation: 'Bounded review.' }), toolCalls: [], stopReason: 'stop' };
    }
    const reference = input.claims[0].supporting[0];
    return { text: JSON.stringify({ index: input.fragmentIndex, title: input.fragmentSections[input.fragmentIndex],
      text: `Bound finding [source:${reference.sourceId}#${reference.excerptId}]`, claimIds: ['c-q1'], sourceIds: [reference.sourceId], inputDigest: input.inputDigest }), toolCalls: [], stopReason: 'stop' };
  };
  const runner = createSubagentRunner({ step, defaultMaxSteps: 8 }, new Map([['read', read]]),
    { workspaceRoot: setup.root, sessionId: setup.session.id, agentMode: 'build', permissionScope: 'ask', hooks: new HookDispatcher(), emit: () => {} });
  const final = await setup.runtime.run(setup.created.id, { taskId: 'review-coverage', workspaceRoot: setup.root, sessionId: setup.session.id, runSubagent: runner });
  expect(final.status, final.stopReason).toBe('partial'); expect(final.fragments).toHaveLength(3);
  expect(final.review?.status).toBe(scenario === 'no-reads' ? 'failed' : 'completed');
  expect(final.review?.findings.map(finding => finding.outcome)).toEqual(scenario === 'omitted-claim' ? ['none-found', 'insufficient'] : ['insufficient', 'insufficient']);
  expect(final.review?.uncovered).toEqual(scenario === 'omitted-claim' ? ['q2'] : ['q1', 'q2']);
  expect(final.claims.map(claim => claim.support)).toEqual(['direct', 'direct']);
});
it('retains actual native web search attempts and outcomes across session reload without promoting them to read sources', async () => {
  const setup = researchHarness(); const run = setup.runtime.create({ question: researchBrief.question, depth: 'quick', save: false });
  vi.stubEnv('EXA_API_KEY', ''); vi.stubEnv('TAVILY_API_KEY', '');
  const request = vi.spyOn(network, 'requestPublic').mockImplementation(async () => new Response('<div class="result"><a class="result__a" href="https://example.com/release">Versioned release</a><span class="result__snippet">Discovery result only</span></div>', { status: 200 }));
  const step: StepFunction = async messages => {
    const prompt = messages.map(message => String(message.content)).find(text => text.startsWith('Research stage:'))!;
    const stage = /^Research stage: (\w+)/.exec(prompt)![1]; const input = JSON.parse(prompt.split('Research input: ')[1]!) as any;
    const reply = (value: unknown) => ({ text: JSON.stringify(value), toolCalls: [], stopReason: 'stop' as const });
    if (stage === 'brief') return reply(researchBrief);
    if ((stage === 'investigate' || stage === 'review') && messages.length === 2) return { text: '', toolCalls: [{ id: `search-${stage}`, name: 'web_search',
      args: { query: stage === 'review' ? 'River v2 Linux fastPath opposite default' : 'River v2 Linux fastPath release',
        headers: { authorization: 'SYNTHETIC_HEADER_SENTINEL' }, body: 'SYNTHETIC_BODY_SENTINEL', apiKey: 'SYNTHETIC_KEY_SENTINEL' } }], stopReason: 'stop' };
    if (stage === 'investigate' || stage === 'draft') return reply({ summary: 'Search results have not been read.', claims: [], covered: [], uncovered: ['q1', 'q2'], limitations: ['Actual source reads are missing.'] });
    if (stage === 'gaps') return reply({ gaps: [], covered: [], uncovered: ['q1', 'q2'] });
    if (stage === 'review') return reply({ findings: [], uncovered: ['q1', 'q2'], limitation: 'No usable reviewer source reads.' });
    return reply({ index: input.fragmentIndex, title: input.fragmentSections[input.fragmentIndex], text: 'No supported findings.', claimIds: [], sourceIds: [], inputDigest: input.inputDigest });
  };
  const runner = createSubagentRunner({ step, defaultMaxSteps: 8 }, new Map([['web_search', createWebSearchToolDefinition()]]),
    { workspaceRoot: setup.root, sessionId: setup.session.id, agentMode: 'build', permissionScope: 'ask', hooks: new HookDispatcher(), emit: () => {} });
  const final = await setup.runtime.run(run.id, { taskId: 'query-trail', workspaceRoot: setup.root, sessionId: setup.session.id, runSubagent: runner });
  expect(final.status, final.stopReason).toBe('partial'); expect(request).toHaveBeenCalledTimes(2); expect(final.sources).toEqual([]);
  setup.manager.saveInterrupted(setup.session.id);
  const manager = new SessionManager(); const resumed = manager.tryResume(setup.session.id, setup.root);
  expect(resumed.ok, JSON.stringify(resumed)).toBe(true); if (!resumed.ok) throw new Error('Expected reloaded session.');
  const retained = currentResearch(readResearch(manager, resumed.session))!;
  const attempts = retained.events.filter(event => event.detail.includes(': attempted'));
  expect(attempts).toMatchObject([{ stage: 'investigate', detail: expect.stringContaining('search-investigate') }, { stage: 'review', detail: expect.stringContaining('search-review') }]);
  expect(attempts[0]?.detail).toContain('River v2 Linux fastPath release'); expect(attempts[1]?.detail).toContain('River v2 Linux fastPath opposite default');
  expect(retained.events.filter(event => event.detail.includes(': returned'))).toHaveLength(2);
  const report = researchReport(retained); expect(report).toContain('River v2 Linux fastPath opposite default');
  expect(report).not.toMatch(/SYNTHETIC_(HEADER|BODY|KEY)_SENTINEL|authorization|apiKey/);
});
it('publishes honest partial outcomes when valid maximum explanations and limitation lists require host normalization', async () => {
  const setup = researchHarness(); const run = setup.runtime.create({ question: researchBrief.question, depth: 'quick', save: false });
  const claims = [{ ...fixtureClaim(), support: 'indirect' as const, supporting: [], opposing: [], supportReason: 'x'.repeat(4096),
    limitations: Array.from({ length: 32 }, (_, index) => `Declared limitation ${index}`) },
  { ...fixtureClaim(undefined, 'q2'), kind: 'method' as const, support: 'indirect' as const, supporting: [], opposing: [],
    supportReason: 'x'.repeat(4096), limitations: Array.from({ length: 32 }, (_, index) => `Declared method limitation ${index}`) }];
  const draft = { summary: 'Unsupported claims stay visible.', claims, covered: ['q1', 'q2'], uncovered: [], limitations: [] };
  const final = await setup.runtime.run(run.id, { taskId: 'legal-boundaries', workspaceRoot: setup.root, sessionId: setup.session.id,
    runSubagent: async child => {
      const stage = /^Research stage: (\w+)/.exec(child.prompt)![1]; const input = JSON.parse(child.prompt.split('Research input: ')[1]!) as any;
      const output = stage === 'brief' ? researchBrief : stage === 'investigate' || stage === 'draft' ? draft
        : stage === 'gaps' ? { gaps: [], covered: [], uncovered: ['q1', 'q2'] }
        : stage === 'review' ? { findings: claims.map(claim => ({ claimId: claim.id, outcome: 'none-found', reason: 'y'.repeat(4096), references: [] })), uncovered: [], limitation: 'z'.repeat(4096) }
        : { index: input.fragmentIndex, title: input.fragmentSections[input.fragmentIndex], text: 'No supported conclusions.', claimIds: [], sourceIds: [], inputDigest: input.inputDigest };
      return { failed: false, text: JSON.stringify(output), steps: 1, allowedTools: [] };
    } });
  expect(final.status, final.stopReason).toBe('partial'); expect(final.pending).toBeUndefined();
  const retained = currentResearch(readResearch(setup.manager, setup.session))!;
  expect(retained.owner).toBeUndefined(); expect(retained.fragments).toHaveLength(3);
  for (const claim of retained.claims) {
    expect(claim.support).toBe('insufficient'); expect(claim.supportReason.length).toBeLessThanOrEqual(4096);
    expect(claim.limitations).toHaveLength(32); expect(claim.limitations.at(-1)).toContain('Indirect support requires actual supporting evidence.');
  }
  expect(retained.review?.limitation).toContain('no actual successful source reads'); expect(retained.review!.limitation.length).toBeLessThanOrEqual(4096);
  expect(retained.review?.findings.every(finding => finding.outcome === 'insufficient' && finding.reason.length <= 4096)).toBe(true);
  expect(retained.review?.uncovered).toEqual(['q1', 'q2']);
});
it('narrows native capabilities through the actual parent pool and refuses forged grants and task denies', async () => {
  const setup = researchHarness(); const run = setup.runtime.create({ question: 'q', depth: 'quick', save: true });
  const names = ['read', 'bash', 'write', 'task']; const pool = new Map(names.map(name => [name, { name, description: '', argsSchema: {}, execute: async () => ({ success: true }) }]));
  pool.set('paper_search', readOnlyTool({ name: 'paper_search', description: '', argsSchema: {}, execute: async () => ({ success: true }) }, { network: true }));
  pool.set('research_run', readOnlyTool({ name: 'research_run', description: '', argsSchema: {}, execute: async () => ({ success: true }) }, { delegation: true }));
  pool.set('research_save', researchSaveTool(setup.runtime, run.id));
  const input = { tools: [...pool.keys()], network: true, maxSteps: 4 };
  expect(() => delegationTools(input, pool)).toThrow(/host-issued/);
  const grant = readOnlyDelegation(input); expect(delegationTools(grant, pool)).toEqual(['read', 'paper_search']);
  expect(() => delegationTools(grant, pool, [{ tool: 'task' }])).toThrow(/deny/);
  expect(delegationTools(readOnlyDelegation({ ...input, network: false }), pool)).toEqual(['read']);
  const step = vi.fn(async () => ({ text: 'unreachable', toolCalls: [], stopReason: 'stop' as const }));
  const runner = createSubagentRunner({ step, defaultMaxSteps: 4 }, pool, { workspaceRoot: setup.root, sessionId: setup.session.id,
    agentMode: 'build', permissionScope: 'allow-all', hooks: new HookDispatcher(), emit: () => {} });
  const forged = await runner({ definition: { name: 'research-investigate', description: '', systemPrompt: '', source: 'builtin' },
    prompt: 'q', workspace: setup.root, capability: input });
  expect(forged.failed).toBe(true); expect(step).not.toHaveBeenCalled();
});
it('requires actual cited-source re-reads on resume and invalidates draft/review/fragments when bytes changed', async () => {
  const harness = researchHarness(); fs.writeFileSync(path.join(harness.root, 'release.md'), 'Version A applies on Linux.\n');
  const read = createReadToolDefinition(createDefaultExecutionService());
  const args = { path: 'release.md' }; const result = await read.execute(args, { taskId: 'initial', workspaceRoot: harness.root, sessionId: harness.session.id });
  const source = toolSources({ assistantMessage: { role: 'assistant', content: '' }, call: { id: 'initial', name: 'read', args }, args,
    result: { output: result.output!, metadata: result.metadata, isError: false }, isError: false }, 'initial', 1)[0]!;
  const claim = fixtureClaim(source);
  const setup = finishResearch(harness, { sources: [source], claims: [claim],
    draft: { summary: 'Old bound draft', claims: [claim], covered: ['q1'], uncovered: ['q2'], limitations: [] },
    fragments: [{ index: 0, title: 'Old report', text: 'Old fragment', claimIds: [claim.id], sourceIds: [source.id], inputDigest: '0'.repeat(64) }] });
  setup.runtime.pause(); const first = setup.runtime.resume();
  const declarationOnly = await setup.runtime.run(first.id, { taskId: 'declaration-only', workspaceRoot: setup.root, sessionId: setup.session.id,
    runSubagent: async () => ({ failed: false, text: JSON.stringify({ sourceIds: [source.id], unavailable: [] }), steps: 1, allowedTools: [] }) });
  expect(declarationOnly.status).toBe('partial'); expect(declarationOnly.stage).toBe('reconcile'); expect(declarationOnly.stopReason).toContain('actual successful re-reads');
  const resumed = setup.runtime.resume(); fs.writeFileSync(path.join(setup.root, 'release.md'), 'Version B applies only on another platform.\n');
  const step: StepFunction = async messages => {
    const prompt = messages.map(message => String(message.content)).find(text => text.startsWith('Research stage:'))!;
    if (prompt.startsWith('Research stage: investigate')) return { text: '', toolCalls: [], stopReason: 'error', errorMessage: 'Bounded reinvestigation fixture stop', retriesExhausted: true };
    if (messages.length === 2) return { text: '', toolCalls: [{ id: 'reconcile-read', name: 'read', args }], stopReason: 'stop' };
    const receipt = JSON.parse(String(messages.at(-1)!.content).split('[Research sources]\n')[1]!);
    return { text: JSON.stringify({ sourceIds: receipt.sources.map((value: any) => value.sourceId), unavailable: [] }), toolCalls: [], stopReason: 'stop' };
  };
  const runner = createSubagentRunner({ step, defaultMaxSteps: 4 }, new Map([['read', read]]), { workspaceRoot: setup.root, sessionId: setup.session.id,
    agentMode: 'build', permissionScope: 'ask', hooks: new HookDispatcher(), emit: () => {} });
  const final = await setup.runtime.run(resumed.id, { taskId: 'actual', workspaceRoot: setup.root, sessionId: setup.session.id, runSubagent: runner });
  expect(final.stage).toBe('investigate'); expect(final.sources.find(value => value.id === source.id)?.stale).toBe(true);
  expect(final.claims).toEqual([]); expect(final.draft).toBeUndefined(); expect(final.review).toBeUndefined(); expect(final.fragments).toEqual([]);
  expect(final.deadlineAt).toBe(setup.created.deadlineAt);
});
it('fences late child output after pause and never automatically starts a persisted run on reentry', async () => {
  const setup = researchHarness(); const run = setup.runtime.create({ question: 'q', depth: 'quick', save: false });
  let release!: () => void; let began!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
  const started = new Promise<void>(resolve => { began = resolve; });
  const running = setup.runtime.run(run.id, { taskId: 'native', workspaceRoot: setup.root, sessionId: setup.session.id,
    runSubagent: async input => { began(); await gate; return { failed: false, text: JSON.stringify(researchBrief), finalText: JSON.stringify(researchBrief), steps: 1, allowedTools: [] }; } });
  await started; const paused = setup.runtime.pause(); expect(paused.pending).toBeDefined(); expect(() => setup.runtime.resume()).toThrow(/Pending/);
  release(); const final = await running; expect(final.status).toBe('paused'); expect(final.brief).toBeUndefined(); expect(final.pending).toBeUndefined();
  updateRun(setup.runtime.binding(), value => ({ ...value, status: 'ready' }));
  const fresh = new (setup.runtime.constructor as typeof import('./runtime.js').ResearchRuntime)(setup.runtime.host);
  expect(fresh.current()?.status).toBe('ready'); expect(fresh.selected(run.id)).toBeUndefined();
  expect(boundRun(setup.runtime.binding()).deadlineAt).toBe(run.deadlineAt);
});
it('does not mutate another live or unknown host run through status or dump inspection', () => {
  const setup = researchHarness(); const created = setup.runtime.create({ question: 'q', depth: 'quick', save: false });
  const owned = updateRun(setup.runtime.binding(), run => ({ ...run, status: 'running',
    owner: { token: 'live-owner', pid: process.pid, hostname: 'foreign-owner-host', startedAt: created.createdAt } }));
  const second = new (setup.runtime.constructor as typeof import('./runtime.js').ResearchRuntime)(setup.runtime.host);
  expect(second.current()).toEqual(owned); second.snapshot();
  expect(boundRun(setup.runtime.binding())).toEqual(owned); expect(second.selected(created.id)).toBeUndefined();
});
