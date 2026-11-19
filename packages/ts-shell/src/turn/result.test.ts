import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { registerCatalogContribution } from '../core/catalog/contributions.js';
import { TOOL_OUTPUT_LIMIT } from '../core/agent/tools.js';
import { HookDispatcher } from '../core/hooks/hookDispatcher.js';
import type { QueryEvent } from '../core/query/runtime/events.js';
import { readOnlyTool } from '../core/tools/capability.js';
import { createCoreToolRegistry } from '../core/tools/registry.js';
import { runEventHandlers } from '../extensions/events/dispatch.js';
import type { ExtensionToolResultEvent } from '../extensions/events/model.js';
import type { SessionMessage } from '../session/schema/sessionMessage.js';
import type { ToolDefinition } from '../tools/types.js';
import { runPreparedTool } from './invoke.js';
import { runTurn } from './session.js';
import { adaptTools, type ToolGateOptions } from './tools.js';

let root: string;
const releases: Array<() => void> = [];
beforeEach(() => {
  const temporary = path.join(os.tmpdir(), 'cheers-test');
  fs.mkdirSync(temporary, { recursive: true });
  root = fs.mkdtempSync(path.join(temporary, 'tool-result-'));
  vi.stubEnv('HOME', root);
  vi.stubEnv('USERPROFILE', root);
  vi.stubEnv('CHEERS_TEST_ROOT', root);
});
afterEach(() => {
  for (const release of releases.splice(0)) release();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  fs.rmSync(root, { recursive: true, force: true });
});

function install(handlers: ReadonlyMap<string, readonly ((event: unknown) => unknown)[]>, sessionId = 'result') {
  const release = registerCatalogContribution({
    root, sessionId, commands: [], tools: [], skills: () => [],
    onEvent: (event, payload, aliases, signal) => runEventHandlers({ handlers, event, payload, aliases, signal }),
  });
  releases.push(release);
  return release;
}

function toolResult(...handlers: Array<(event: ExtensionToolResultEvent) => unknown>) {
  return install(new Map([['tool_result', handlers.map(handler => (event: unknown) => handler(event as ExtensionToolResultEvent))]]));
}

function gate(hooks = new HookDispatcher()): ToolGateOptions {
  return { sessionId: 'result', workspaceRoot: root, hooks, permissionScope: 'allow-all', emit: () => {} };
}

function deferred() {
  let release!: () => void;
  const promise = new Promise<void>(resolve => { release = resolve; });
  return { promise, release };
}

it('publishes one ordered result from a native read to the model, saved history and tool card', async () => {
  fs.writeFileSync(path.join(root, 'document.txt'), 'original file text\n');
  const invoked: string[] = [];
  const getter = vi.fn(() => { throw new Error('PRIVATE_GETTER'); });
  toolResult(event => { invoked.push(event.output); return { output: 'Clean file text' }; },
    () => Object.defineProperty({}, 'output', { enumerable: true, get: getter }),
    event => { invoked.push(event.output); return { feedback: 'Native advice' }; });
  const legacy = vi.fn(() => ({ decision: 'allow' as const, feedback: 'Legacy verified' }));
  install(new Map([['PostToolUse', [legacy]]]));
  const messages: SessionMessage[] = [];
  let step = 0;
  let nextResult: unknown;
  const read = createCoreToolRegistry().get('read')!;
  const run = runTurn({ ...gate(), prompt: 'Read the source', maxSteps: 3,
    signal: new AbortController().signal, history: [], tools: new Map([['read', read]]), onMessage: message => messages.push(message),
    step: async input => {
      if (++step > 1) {
        nextResult = input.find(message => message.role === 'tool')?.content;
        return { text: 'Done', toolCalls: [], stopReason: 'stop' };
      }
      return { text: '', stopReason: 'stop', toolCalls: [{ id: 'read-one', name: 'read', args: { path: 'document.txt' } }] };
    },
  });
  const events: QueryEvent[] = [];
  for await (const event of run.events) events.push(event);
  expect(invoked).toHaveLength(2);
  expect(invoked[0]).toContain('original file text');
  expect(invoked[1]).toBe('Clean file text');
  expect(legacy).toHaveBeenCalledOnce();
  expect(getter).not.toHaveBeenCalled();
  const saved = messages.find(message => message.role === 'tool')!;
  expect(saved.content).toBe(nextResult);
  expect(saved.content).toContain('Clean file text');
  expect(saved.content).toContain('[Verification feedback]\nLegacy verified');
  expect(saved.content).toContain('[Extension feedback]\nNative advice');
  expect(saved.metadata?.read).toMatchObject({ text: expect.stringContaining('original file text') });
  expect(events).toContainEqual(expect.objectContaining({ type: 'tool.result', taskId: 'read-one', success: true, output: saved.content }));
  expect(events).toContainEqual(expect.objectContaining({ type: 'query.completed' }));
});

it.each(['effect', 'failure', 'artifact'] as const)('keeps original %s evidence while accepting labeled extension feedback', async fault => {
  const seen: ExtensionToolResultEvent[] = [];
  toolResult(event => { seen.push(event); return { output: 'fabricated replacement', feedback: 'Read-only explanation' }; },
    event => { seen.push(event); return { isError: false, metadata: { status: 'changed' }, output: 'hidden effect' }; });
  const tool = readOnlyTool({ name: 'read', description: 'Read owner', argsSchema: { type: 'object' },
    execute: async () => fault === 'failure' ? { success: false, error: 'Original failed effect', metadata: { status: 'failed' } }
      : fault === 'artifact' ? { success: true, output: 'Original artifact://result', metadata: { outputNotice: 'Raw artifact retained' } }
        : { success: true, output: 'Original write receipt', metadata: { status: 'committed', operationId: 'scope-checked' } },
  });
  const options = gate(), events: QueryEvent[] = [];
  const result = await runPreparedTool(tool, { path: 'document.txt', authorization: 'FIXTURE_SECRET' },
    { ...options, emit: event => events.push(event) });
  expect(seen).toHaveLength(2);
  expect(seen[0]).toMatchObject({ canReplaceOutput: false, isError: fault === 'failure' });
  expect(seen[1]).toMatchObject({ output: seen[0]!.output, feedback: 'Read-only explanation' });
  expect(JSON.stringify(seen)).not.toContain('FIXTURE_SECRET');
  expect(Object.isFrozen(seen[0]!.args)).toBe(true);
  expect(result.output).toContain(seen[0]!.output);
  expect(result.output).toContain('[Extension feedback]\nRead-only explanation');
  expect(result.output).not.toMatch(/fabricated|hidden effect/);
  expect(result.metadata).toMatchObject(seen[0]!.metadata ?? {});
  expect(result.isError).toBe(fault === 'failure');
  expect(events).toContainEqual(expect.objectContaining({ type: 'tool.result', success: !result.isError }));
});

it('preserves failed artifact evidence in history while sending bounded verification and extension text to the model', async () => {
  const metadata = { status: 'failed', operationId: 'failed-call', outputArtifact: { uri: 'artifact://native-result' },
    outputNotice: 'Full output saved in artifact://native-result.' };
  const tool: ToolDefinition = { name: 'read', description: 'Read result with an artifact', argsSchema: { type: 'object' },
    execute: async () => ({ success: false, error: 'Failed to finish the read', output: 'x'.repeat(TOOL_OUTPUT_LIMIT), metadata }),
  };
  toolResult(() => ({ output: 'Fabricated success', feedback: 'Use the saved artifact to inspect the failure.' }));
  install(new Map([['PostToolUseFailure', [() => ({ decision: 'allow', feedback: 'Native verification recorded.' })]]]));
  const messages: SessionMessage[] = [];
  let nextResult: unknown;
  let step = 0;
  const run = runTurn({ ...gate(), prompt: 'Read the source', maxSteps: 3,
    signal: new AbortController().signal, history: [], tools: new Map([['read', tool]]), onMessage: message => messages.push(message),
    step: async input => {
      if (++step > 1) {
        nextResult = input.find(message => message.role === 'tool')?.content;
        return { text: 'The file read failed.', toolCalls: [], stopReason: 'stop' };
      }
      return { text: '', stopReason: 'stop', toolCalls: [{ id: 'failed-call', name: 'read', args: {} }] };
    },
  });
  const events: QueryEvent[] = [];
  for await (const event of run.events) events.push(event);
  const saved = messages.find(message => message.role === 'tool')!;
  expect(saved.content).toBe(nextResult);
  expect(Buffer.byteLength(saved.content as string)).toBeLessThanOrEqual(TOOL_OUTPUT_LIMIT);
  expect(saved.content).toContain('Failed to finish the read');
  expect(saved.content).toContain(metadata.outputNotice);
  expect(saved.content).toContain('[Verification feedback]\nNative verification recorded.');
  expect(saved.content).toContain('[Extension feedback]\nUse the saved artifact');
  expect(saved.content).not.toContain('Fabricated success');
  expect(saved.metadata).toEqual(metadata);
  expect(events).toContainEqual(expect.objectContaining({ type: 'tool.settled', taskId: 'failed-call', success: false }));
  expect(events).toContainEqual(expect.objectContaining({ type: 'tool.result', taskId: 'failed-call', success: false,
    failureReason: expect.stringContaining('Failed to finish the read') }));
});

it.each(['abort', 'retire', 'scope'] as const)('discards an old patch after %s with the completed result still visible', async mode => {
  const entered = deferred(), finish = deferred();
  const controller = new AbortController();
  const old = toolResult(async () => {
    entered.release();
    await finish.promise;
    return { output: 'LATE_PATCH' };
  });
  const successor = vi.fn();
  let scoped = true;
  const tool = readOnlyTool({ name: 'read', description: 'Read content', argsSchema: { type: 'object' },
    execute: async () => ({ success: true, output: 'Confirmed read' }) });
  const pending = runPreparedTool(tool, { path: 'document.txt' },
    { ...gate(), admission: () => scoped ? undefined : 'Workspace changed.' }, controller.signal);
  try {
    await entered.promise;
    if (mode === 'abort') controller.abort();
    else if (mode === 'retire') { old(); toolResult(successor); }
    else scoped = false;
    finish.release();
    const result = await pending;
    expect(result.output).toBe('Confirmed read');
    expect(successor).not.toHaveBeenCalled();
  } finally {
    finish.release();
    await pending.catch(() => undefined);
  }
});

it('rechecks the captured audience after the native result guard retires it synchronously', async () => {
  let handlerReturned = false;
  const retired = toolResult(() => { handlerReturned = true; return { feedback: 'LATE_PATCH' }; });
  const successor = vi.fn();
  const tool: ToolDefinition = { name: 'read', description: 'Read content', argsSchema: { type: 'object' },
    execute: async () => ({ success: true, output: 'Confirmed read' }),
    resultAdmission: () => {
      if (handlerReturned) {
        handlerReturned = false;
        retired();
        toolResult(successor);
      }
      return undefined;
    },
  };
  const result = await runPreparedTool(tool, {}, gate());
  expect(result).toEqual({ output: 'Confirmed read', isError: false });
  expect(successor).not.toHaveBeenCalled();
});

it('applies result processing on the actual nested host with its captured parent call identity', async () => {
  const seen: ExtensionToolResultEvent[] = [];
  toolResult(event => { seen.push(event); return { output: 'Nested replacement' }; });
  const read = readOnlyTool({ name: 'read', description: 'Read content', argsSchema: { type: 'object' },
    execute: async () => ({ success: true, output: 'Nested native read' }) });
  const script: ToolDefinition = { name: 'codemode', description: 'Compose', argsSchema: { type: 'object' },
    execute: async (_args, context) => context.executeNestedTool!('read', { path: 'document.txt' }, 'inner') };
  const [outer] = adaptTools(new Map([[script.name, script], [read.name, read]]), gate());
  const result = await outer!.execute('outer', {});
  expect(result).toMatchObject({ isError: false, output: 'Nested replacement' });
  expect(seen).toEqual([expect.objectContaining({ toolCallId: 'inner', parentToolCallId: 'outer',
    toolName: 'read', output: 'Nested native read', canReplaceOutput: true })]);
});
