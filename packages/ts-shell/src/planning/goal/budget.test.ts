import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { SessionManager } from '../../session/SessionManager.js';
import type { Session } from '../../session/schema/sessionRecord.js';
import { readStateSnapshotRequired } from '../../session/store/sessionStateStore.js';
import { writeJsonFileAtomic } from '../../session/store/sessionFileStore.js';
import { decodeRequestLedger } from '../../core/agent/request/codec.js';
import type { PreparedRequest } from '../../core/agent/request/model.js';
import { declareEndpoint, endpointShape } from '../../provider/endpoints/index.js';
import { prepareRequestAttempt } from '../../provider/request/attempt.js';
import { providerModelTransport } from '../../provider/request/transport.js';
import { requestSimpleCompletion } from '../../provider/request/completion.js';
import { requestCompactionSummary } from '../../core/query/compaction/summarize.js';
import { sendSentRequest } from '../../provider/request/sentRequest.js';
import { createStepFunction } from '../../turn/step.js';
import { runAgentLoop } from '../../core/agent/loop.js';
import { runSubagent } from '../../core/subagents/runner.js';
import { readGoalEdit } from './store.js';
import { runSessionGoalCommand } from './command.js';
import { goalRequestPolicy } from './budget.js';

let scratch: string; let root: string; let manager: SessionManager; let session: Session;
const boundedEndpoint = 'goal-budget-test';
const wire = endpointShape('openai-compatible');
const request: PreparedRequest = { requestId: 'test-logical', bodyDigest: '0'.repeat(64), provider: 'test', model: 'm', endpoint: boundedEndpoint, purpose: 'turn',
  bound: { inputTokens: 10, outputTokens: 10, source: 'isolated-test-protocol', version: '1' } };

beforeEach(async () => {
  const temporary = path.resolve(process.cwd(), '../../.tmp'); fs.mkdirSync(temporary, { recursive: true });
  scratch = fs.mkdtempSync(path.join(temporary, 'goal-budget-test-')); root = path.join(scratch, 'project');
  fs.mkdirSync(path.join(root, '.git'), { recursive: true });
  const home = path.join(scratch, 'home'); fs.mkdirSync(home);
  vi.stubEnv('HOME', home); vi.stubEnv('USERPROFILE', home); vi.stubEnv('GIT_CEILING_DIRECTORIES', scratch); vi.stubEnv('CHEERS_PROVIDER_PROXY', 'off');
  manager = new SessionManager(); session = manager.createNew(root);
  declareEndpoint(boundedEndpoint, { ...wire, requestBound: value => {
    const body = JSON.parse(value.body) as Record<string, unknown>;
    const output = body.max_completion_tokens ?? body.max_tokens;
    return typeof output === 'number' ? { inputTokens: 10, outputTokens: output, source: 'isolated-test-protocol', version: '1' } : undefined;
  } });
  await command(['set', 'Meter this objective']);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); fs.rmSync(scratch, { recursive: true, force: true }); });

function command(args: string[]) { return runSessionGoalCommand(args, { cwd: root, projectRoot: root, sessionId: session.id }, manager, session); }
function statePath() { return path.join(manager.getSessionDirPath(session.id), 'state.json'); }
function ledger() { return decodeRequestLedger(readStateSnapshotRequired(statePath()).requestLedger)!; }
function scope() { return ledger().scopes[readGoalEdit(manager, session).goal!.id]!; }
function step(fetchImpl: typeof fetch, endpoint = boundedEndpoint) {
  return createStepFunction({ provider: { headers: {}, baseUrl: 'https://example.test', provider: 'test', model: 'm', endpoint },
    workspaceRoot: root, sessionId: session.id, systemPrompt: 'test', tools: [], maxOutputTokens: 10, fetchImpl, thinkingEffort: 'high', thinkingEffortExplicit: false,
    requestPolicy: goalRequestPolicy(manager, session), retry: { maxRetries: 2, baseDelayMs: 1, maxDelayMs: 1 } });
}
function answer() { return Response.json({ choices: [{ message: { content: 'answer' }, finish_reason: 'stop' }],
  usage: { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12, prompt_tokens_details: { cached_tokens: 8 } } }); }

describe('goal request policies', () => {
  it('creates a known-zero scope atomically, keeps usage and other owners across writes, and validates exact budget args', async () => {
    expect(scope()).toMatchObject({ inputTokens: 0, outputTokens: 0, historyUnknown: false, nextSequence: 1 });
    for (const invalid of ['-1', '01', '1e2', '+2', '2.5', '9007199254740992']) {
      expect((await command(['budget', invalid])).output).toContain('not saved');
      expect(readGoalEdit(manager, session).goal!.tokenBudget).toBeUndefined();
    }
    await command(['budget', '0']); expect(readGoalEdit(manager, session).goal!.tokenBudget).toBe(0);
    await command(['budget', 'off']);
    const current = readStateSnapshotRequired(statePath()); writeJsonFileAtomic(statePath(), { ...current, workingMemory: { retained: true }, pendingPrompt: 'other owner' });
    const fetchImpl = vi.fn(async () => answer()) as unknown as typeof fetch;
    await step(fetchImpl)([{ role: 'user', content: 'hello' }], undefined, {}, { allowTools: false });
    const goal = readGoalEdit(manager, session).goal;
    expect(scope()).toMatchObject({ inputTokens: 10, outputTokens: 2, cacheReadTokens: 8, finalized: [[1, 1]], pending: {} });
    expect(readStateSnapshotRequired(statePath())).toMatchObject({ workingMemory: { retained: true } });
    manager.addTurn(session.id, { role: 'user', content: 'ordinary save' }); manager.saveCompleted(session.id);
    expect(readGoalEdit(manager, session).goal).toEqual(goal); expect(scope().inputTokens).toBe(10);
  });

  it('retains unknown no-cap history and old pre-metering history when switching on a cap', async () => {
    const fetchImpl = vi.fn(async () => Response.json({ choices: [{ message: { content: 'answer' } }] })) as unknown as typeof fetch;
    await step(fetchImpl, 'openai-compatible')([{ role: 'user', content: 'hello' }], undefined, {}, { allowTools: false });
    expect(scope().pending['1']).toMatchObject({ dispatched: true }); expect(scope().pending['1']!.bound).toBeUndefined();
    await command(['budget', '100']);
    expect(() => goalRequestPolicy(manager, session)!.reserve(request)).toThrow(/history-unknown/);
    await command(['budget', 'off']); expect(scope().pending['1']).toBeDefined();
    const current = readStateSnapshotRequired(statePath()); const { requestLedger: _ledger, ...old } = current; writeJsonFileAtomic(statePath(), old);
    const policy = goalRequestPolicy(manager, session)!; const attempt = policy.reserve(request); attempt.confirmUnsent();
    expect(scope().historyUnknown).toBe(true);
    await command(['budget', '100']); expect(() => goalRequestPolicy(manager, session)!.reserve(request)).toThrow(/history-unknown/);
  });

  it('shares reservations across fresh owners, retains late old-goal usage and rejects stale handoffs', async () => {
    await command(['budget', '20']);
    const policy = goalRequestPolicy(manager, session)!; const first = policy.reserve(request);
    expect(() => goalRequestPolicy(manager, session)!.reserve(request)).toThrow(/exhausted/);
    await command(['pause']); expect(() => first.dispatch()).toThrow(/inactive/); first.confirmUnsent();
    const manual = goalRequestPolicy(manager, session)!.reserve(request); manual.dispatch();
    const originalId = readGoalEdit(manager, session).goal!.id;
    await command(['drop']); await command(['set', 'new objective']); const replacement = readGoalEdit(manager, session).goal;
    manual.settle({ version: 1, inputTokens: 10, outputTokens: 2, complete: true }); manual.settle({ version: 1, inputTokens: 10, outputTokens: 2, complete: true });
    expect(readGoalEdit(manager, session).goal).toEqual(replacement);
    expect(ledger().scopes[originalId]).toMatchObject({ inputTokens: 10, outputTokens: 2, finalized: [[1, 2]], pending: {} });
    expect(scope()).toMatchObject({ inputTokens: 0, outputTokens: 0 });
  });

  it('serializes actual separate-process admissions under the existing session file lock', async () => {
    await command(['budget', '20']);
    const script = path.join(scratch, 'admit.mjs'); const sessionFile = path.join(scratch, 'input.json');
    fs.writeFileSync(sessionFile, JSON.stringify({ session, request }));
    fs.writeFileSync(script, `import fs from 'node:fs';
import { goalRequestPolicy } from ${JSON.stringify(path.resolve('src/planning/goal/budget.ts'))};
const input = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const host = { getSessionDirPath: () => process.argv[3] };
try { const policy = goalRequestPolicy(host, input.session); const admitted = new Promise(resolve => process.stdin.once('data', resolve)); console.log('ready'); await admitted; const attempt = policy.reserve(input.request); attempt.dispatch(); attempt.settle({ version: 1, inputTokens: 10, outputTokens: 2, complete: true }); console.log('admitted'); }
catch (error) { console.log(error.code); }
`);
    const children: ReturnType<typeof spawn>[] = []; let ready = 0;
    const run = () => new Promise<string>((resolve, reject) => {
      const child = spawn(process.execPath, [path.resolve('../../node_modules/tsx/dist/cli.mjs'), script, sessionFile, manager.getSessionDirPath(session.id)], {
        cwd: process.cwd(), env: { ...process.env }, stdio: ['pipe', 'pipe', 'pipe'],
      });
      children.push(child);
      let output = ''; let errors = '';
      let captured = false;
      child.stdout.on('data', chunk => {
        output += String(chunk);
        if (!captured && output.startsWith('ready\n')) {
          captured = true; ready += 1;
          if (ready === 2) for (const waiting of children) waiting.stdin!.end('admit\n');
        }
      });
      child.stderr.on('data', chunk => { errors += String(chunk); });
      child.on('error', reject); child.on('exit', code => code === 0 && captured ? resolve(output.trim().slice('ready\n'.length)) : reject(new Error(`isolated child ${code}: ${errors || output}`)));
    });
    // Capture both policies before either writes, so the race exercises locked reservation, not optimistic reads.
    let results: string[];
    try { results = await Promise.all([run(), run()]); }
    finally { for (const child of children) child.kill(); }
    expect(results.sort()).toEqual(['admitted', 'exhausted']);
    expect(scope()).toMatchObject({ inputTokens: 10, outputTokens: 2, nextSequence: 2, pending: {}, finalized: [[1, 1]] });
  });

  it.each(['http-retry', 'reasoning-downgrade', 'empty-stream-retry'] as const)('admits only one send for %s', async kind => {
    await command(['budget', '20']);
    const fetchImpl = vi.fn(async () => kind === 'http-retry' ? new Response('try again', { status: 500 })
      : kind === 'reasoning-downgrade' ? new Response('reasoning_effort rejected', { status: 400 })
      : new Response(new ReadableStream<Uint8Array>({ start(controller) { controller.error(new Error('socket closed')); } }), { headers: { 'content-type': 'text/event-stream' } })) as unknown as typeof fetch;
    const result = await step(fetchImpl)([{ role: 'user', content: 'hello' }], undefined, {}, { allowTools: false });
    expect(fetchImpl).toHaveBeenCalledOnce(); expect(result).toMatchObject({ stopReason: 'error', retriesExhausted: true });
    expect(result.errorMessage).toContain(kind === 'empty-stream-retry' ? 'socket closed' : 'exhausted');
    expect(scope().pending['1']).toMatchObject({ dispatched: true });
    expect(Object.keys(scope().pending)).toEqual(['1']);
  });

  it('meters delegated steps in the same scope and prevents the kernel from retrying budget refusal', async () => {
    await command(['budget', '20']);
    const fetchImpl = vi.fn(async () => answer()) as unknown as typeof fetch; const modelStep = step(fetchImpl);
    const child = await runSubagent({ definition: { name: 'test', description: 'test', systemPrompt: 'test', source: 'builtin', tools: [] }, prompt: 'answer', workspace: root }, {
      tools: new Map(), defaultMaxSteps: 1, step: (messages, signal, options) => modelStep(messages, signal, {}, { ...options, agentMode: 'plan' }),
    });
    expect(child.failed).toBe(false); expect(scope().inputTokens + scope().outputTokens).toBe(12);
    const messages = await runAgentLoop([{ role: 'user', content: 'hello' }], [], { tools: [], streamStep: (messages, signal) => modelStep(messages, signal, {}, { allowTools: false }),
      retry: { maxRetries: 2, baseDelayMs: 1, maxDelayMs: 1 } }, () => {});
    expect(fetchImpl).toHaveBeenCalledOnce(); expect(messages.at(-1)?.errorMessage).toContain('exhausted');
  });

  it('routes side questions, history summaries and cache replays through the same actual send boundary', async () => {
    let calls = 0;
    const fetchImpl = vi.fn(async () => ++calls === 3 ? Response.json({ choices: [{ message: { content: 'a' }, finish_reason: 'length' }],
      usage: { prompt_tokens: 10, completion_tokens: 1, total_tokens: 11, prompt_tokens_details: { cached_tokens: 8 } } }) : answer()) as unknown as typeof fetch;
    const provider = { headers: {}, baseUrl: 'https://example.test', model: 'm', providerId: 'test', endpoint: boundedEndpoint, fetchImpl };
    const policy = goalRequestPolicy(manager, session)!;
    await requestSimpleCompletion({ provider, requestPolicy: policy, messages: [{ role: 'user', content: 'hello' }], maxOutputTokens: 10 });
    await requestCompactionSummary({ provider, fetchImpl, requestPolicy: policy, messages: [{ role: 'user', content: 'hello' }], maxOutputTokens: 10 });
    const sent = { url: 'https://example.test/chat/completions', headers: {}, endpoint: boundedEndpoint, reasoning: false,
      body: JSON.stringify({ model: 'm', max_tokens: 10, messages: [{ role: 'user', content: 'hello' }] }) };
    await sendSentRequest(sent, undefined, fetchImpl, { policy, provider: 'test', model: 'm' });
    expect(fetchImpl).toHaveBeenCalledTimes(3); expect(scope()).toMatchObject({ inputTokens: 30, outputTokens: 5, cacheReadTokens: 24, finalized: [[1, 3]] });
    await command(['budget', '35']);
    await expect(requestSimpleCompletion({ provider, requestPolicy: policy, messages: [{ role: 'user', content: 'hello' }], maxOutputTokens: 10 })).rejects.toThrow(/exhausted/);
    await expect(requestCompactionSummary({ provider, fetchImpl, requestPolicy: policy, messages: [{ role: 'user', content: 'hello' }], maxOutputTokens: 10 })).rejects.toThrow(/exhausted/);
    await expect(sendSentRequest(sent, undefined, fetchImpl, { policy, provider: 'test', model: 'm' })).rejects.toThrow(/exhausted/);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('rejects body drift and rechecks the lowered cap after actual asynchronous signing', async () => {
    await command(['budget', '20']);
    const body = JSON.stringify({ model: 'm', max_tokens: 10, messages: [] });
    const attempt = await prepareRequestAttempt({ body, provider: 'test', model: 'm', endpoint: boundedEndpoint, purpose: 'turn', policy: goalRequestPolicy(manager, session) });
    const fetchImpl = vi.fn(async () => answer()) as unknown as typeof fetch;
    await expect(attempt.send('https://example.test', { body: body + ' ' }, fetchImpl)).rejects.toThrow(/unsupported/);
    expect(fetchImpl).not.toHaveBeenCalled(); expect(scope().pending).toEqual({});
    let release!: () => void; let started!: () => void;
    const began = new Promise<void>(resolve => { started = resolve; }); const gate = new Promise<void>(resolve => { release = resolve; });
    declareEndpoint(boundedEndpoint, { ...endpointShape(boundedEndpoint), signer: async () => async () => { started(); await gate; return {}; } });
    const server = http.createServer((_request, response) => { response.end('{}'); }); const sends = vi.fn(); server.on('request', sends);
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
      const prepared = await prepareRequestAttempt({ body, provider: 'test', model: 'm', endpoint: boundedEndpoint, purpose: 'turn', policy: goalRequestPolicy(manager, session) });
      const address = server.address() as { port: number };
      const pending = prepared.send(`http://127.0.0.1:${address.port}/model`, { method: 'POST', body }, fetchImpl, providerModelTransport(undefined, boundedEndpoint));
      await began; await command(['budget', '0']); release();
      await expect(pending).rejects.toThrow(/exhausted/); expect(sends).not.toHaveBeenCalled(); expect(scope().pending).toEqual({});
    } finally { release(); await new Promise<void>(resolve => server.close(() => resolve())); }
  });

  it('settles valid cache replay usage even when no assistant answer is usable', async () => {
    const fetchImpl = vi.fn(async () => Response.json({ choices: [], usage: { prompt_tokens: 10, completion_tokens: 1, total_tokens: 11 } })) as unknown as typeof fetch;
    const sent = { url: 'https://example.test/chat/completions', headers: {}, endpoint: boundedEndpoint, reasoning: false,
      body: JSON.stringify({ model: 'm', max_tokens: 10, messages: [{ role: 'user', content: 'hello' }] }) };
    expect(await sendSentRequest(sent, undefined, fetchImpl, { policy: goalRequestPolicy(manager, session), provider: 'test', model: 'm' })).toBeUndefined();
    expect(scope()).toMatchObject({ inputTokens: 10, outputTokens: 1, pending: {}, finalized: [[1, 1]] });
  });
});
