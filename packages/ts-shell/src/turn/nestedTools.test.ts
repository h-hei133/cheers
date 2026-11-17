import { describe, expect, it, vi } from 'vitest';
import type { AgentTool, AgentToolResult, ToolHooks } from '../core/agent/tools.js';
import type { HookDispatcher } from '../core/hooks/hookDispatcher.js';
import type { ImageContent } from '../model-adapters/multimodal.js';
import type { ToolDefinition, ToolExecutionResult } from '../tools/types.js';
import { createGatedNestedToolExecutor } from './nestedTools.js';
import { executeToolBatch } from '../core/agent/tools.js';
import { adaptTools, type ToolGateOptions } from './tools.js';

// The optional fourth argument is the proposed per-script cancellation port.
// A three-argument implementation remains assignable so Root can run these red.
type NestedCall = (name: string, args: Record<string, unknown>, id: string, signal?: AbortSignal) => Promise<ToolExecutionResult>;

const image: ImageContent = { type: 'image', mimeType: 'image/png',
  data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==' };

function held<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(accept => { resolve = accept; });
  return { promise, resolve };
}

function definition(name: string, execute: ToolDefinition['execute'] = async () => ({ success: true, output: 'observed' })): ToolDefinition {
  return { name, description: `Observe ${name}`, argsSchema: { type: 'object' }, execute };
}

function gate(overrides: Partial<ToolGateOptions> = {}): ToolGateOptions {
  return { sessionId: 'nested-owner', workspaceRoot: process.cwd(), permissionScope: 'allow-all',
    hooks: { dispatch: async () => ({ decision: 'allow' }) } as unknown as HookDispatcher,
    emit: () => {}, ...overrides };
}

function bridge(targets: readonly ToolDefinition[], invoke: (call: NestedCall) => Promise<ToolExecutionResult>,
  overrides: Partial<ToolGateOptions> = {}): AgentTool {
  const script = definition('codemode', async (_args, context) => {
    expect(context.executeNestedTool).toBeTypeOf('function');
    const call: NestedCall = context.executeNestedTool!;
    return invoke(call);
  });
  return adaptTools(new Map([...targets, script].map(tool => [tool.name, tool])), gate(overrides))
    .find(tool => tool.name === 'codemode')!;
}

function callWithResult(tool: ToolDefinition, result: AgentToolResult, hooks: ToolHooks = {}): NestedCall {
  return createGatedNestedToolExecutor({ tools: new Map([[tool.name, tool]]), hooks,
    prepare: async (_tool, args) => args, execute: async () => result }, undefined);
}

describe('nested tool admission', () => {
  it.each(['prepare', 'before hook'] as const)('refuses effects when the parent is cancelled during %s', async stage => {
    const started = held<void>(); const release = held<void>();
    const controller = new AbortController();
    const target = definition('write');
    const execute = vi.fn(async () => ({ output: 'actual effect', isError: false }));
    const after = vi.fn(async () => undefined);
    const before = vi.fn(async () => {
      if (stage === 'before hook') { started.resolve(); await release.promise; }
      return undefined;
    });
    const call = createGatedNestedToolExecutor({ tools: new Map([[target.name, target]]),
      hooks: { beforeToolCall: before, afterToolCall: after },
      prepare: async (_tool, args, signal) => {
        expect(signal).toBe(controller.signal);
        if (stage === 'prepare') { started.resolve(); await release.promise; }
        return args;
      }, execute }, controller.signal);
    const pending = call('write', { path: 'owned.txt', content: 'new' }, 'cancelled-parent');
    const observed = pending.catch(() => undefined);
    await started.promise; controller.abort(); release.resolve();
    const result = await observed;
    expect(execute).not.toHaveBeenCalled();
    expect(after).not.toHaveBeenCalled();
    expect(result?.success).not.toBe(true);
    if (stage === 'prepare') expect(before).not.toHaveBeenCalled();
  });

  it.each(['prepare', 'before hook'] as const)('cancels only the child lifetime during %s', async stage => {
    const started = held<void>(); const release = held<void>();
    const parent = new AbortController(); const child = new AbortController();
    let admittedSignal: AbortSignal | undefined;
    const target = definition('write');
    const execute = vi.fn(async () => ({ output: 'actual effect', isError: false }));
    const call: NestedCall = createGatedNestedToolExecutor({ tools: new Map([[target.name, target]]),
      hooks: { beforeToolCall: async () => {
        if (stage === 'before hook') { started.resolve(); await release.promise; }
        return undefined;
      } },
      prepare: async (_tool, args, signal) => {
        admittedSignal = signal;
        if (stage === 'prepare') { started.resolve(); await release.promise; }
        return args;
      }, execute }, parent.signal);
    const pending = call('write', { path: 'owned.txt', content: 'new' }, 'cancelled-child', child.signal);
    const observed = pending.catch(() => undefined);
    await started.promise; child.abort(); release.resolve();
    const result = await observed;
    expect(parent.signal.aborted).toBe(false);
    expect(admittedSignal?.aborted).toBe(true);
    expect(execute).not.toHaveBeenCalled();
    expect(result?.success).not.toBe(true);
  });

  it('does not prepare or execute for an already cancelled parent', async () => {
    const controller = new AbortController(); controller.abort();
    const target = definition('write');
    const prepare = vi.fn(async (_tool: ToolDefinition, args: Record<string, unknown>) => args);
    const execute = vi.fn(async () => ({ output: 'actual effect', isError: false }));
    const call = createGatedNestedToolExecutor({ tools: new Map([[target.name, target]]), hooks: {}, prepare, execute }, controller.signal);
    await call('write', {}, 'already-cancelled').catch(() => undefined);
    expect(prepare).not.toHaveBeenCalled(); expect(execute).not.toHaveBeenCalled();
  });
});

describe('nested execution policy through adapted tools', () => {
  it('serializes separate outer scripts that may contain ordered effects', async () => {
    const started = held<void>(); const release = held<void>();
    const entries: string[] = []; let active = 0; let maximum = 0;
    const write = definition('write', async args => {
      entries.push(String(args.content)); active++; maximum = Math.max(maximum, active);
      started.resolve();
      try { await release.promise; return { success: true, output: String(args.content) }; }
      finally { active--; }
    });
    const script = definition('codemode', async (args, context) => context.executeNestedTool!(
      'write', { path: 'ordered.txt', content: args.content }, context.taskId + '/1'));
    const tools = adaptTools(new Map([[write.name, write], [script.name, script]]), gate());
    const calls = ['first', 'second'].map(content => ({ id: content, name: 'codemode', args: { content } }));
    const pending = executeToolBatch(tools, { role: 'assistant', content: '' }, calls, undefined, undefined,
      new AbortController().signal, () => {});
    let admitted: string[] = [];
    try {
      await started.promise;
      await new Promise<void>(resolve => setImmediate(resolve));
      admitted = [...entries];
    } finally { release.resolve(); }
    const result = await pending;
    expect(admitted).toEqual(['first']);
    expect(entries).toEqual(['first', 'second']);
    expect(maximum).toBe(1);
    expect(result.messages).toHaveLength(2);
    expect(result.messages.every(message => message.is_error !== true)).toBe(true);
  });

  it('offers the same forced sequential policy to the outer and nested owners', () => {
    const names = ['bash', 'write', 'edit', 'apply_patch', 'task', 'team', 'browser', 'read'];
    const adapted = adaptTools(new Map(names.map(name => [name, definition(name)])), gate());
    const modes = Object.fromEntries(adapted.map(tool => [tool.name, tool.executionMode]));
    expect(modes).toMatchObject({ bash: 'sequential', write: 'sequential', edit: 'sequential',
      apply_patch: 'sequential', task: 'sequential', team: 'sequential', browser: 'sequential' });
    expect(modes.read).not.toBe('sequential');
  });

  it.each(['bash', 'read'] as const)('preserves %s concurrency policy through the actual nested gate', async name => {
    const started = held<void>(); const release = held<void>();
    const entries: string[] = []; let active = 0; let maximum = 0;
    const target = definition(name, async args => {
      entries.push(String(args.label)); active++; maximum = Math.max(maximum, active);
      started.resolve();
      try { await release.promise; return { success: true, output: String(args.label) }; }
      finally { active--; }
    });
    const script = bridge([target], async call => {
      const results = await Promise.all([
        call(name, { label: 'first', ...(name === 'bash' ? { command: 'pwd' } : {}) }, 'nested-first'),
        call(name, { label: 'second', ...(name === 'bash' ? { command: 'pwd' } : {}) }, 'nested-second'),
      ]);
      return { success: results.every(result => result.success), output: JSON.stringify(results) };
    });
    const pending = script.execute('outer-script', {});
    let initial: string[];
    try {
      await started.promise;
      await new Promise<void>(resolve => setImmediate(resolve));
      initial = [...entries];
    } finally { release.resolve(); }
    const result = await pending;
    expect(initial!).toEqual(name === 'bash' ? ['first'] : ['first', 'second']);
    expect(maximum).toBe(name === 'bash' ? 1 : 2);
    expect(entries).toEqual(['first', 'second']);
    expect(result.isError).toBe(false);
  });

  it.each(['write first', 'reads first'] as const)('keeps ordered effect barriers with %s', async order => {
    const started = held<void>(); const release = held<void>();
    const entries: string[] = [];
    const write = definition('write', async () => {
      entries.push('write'); started.resolve();
      if (order === 'write first') await release.promise;
      return { success: true, output: 'new' };
    });
    const read = definition('read', async args => {
      entries.push(String(args.label)); started.resolve();
      if (order === 'reads first') await release.promise;
      return { success: true, output: String(args.label) };
    });
    const script = bridge([write, read], async call => {
      const calls = order === 'write first'
        ? [call('write', {}, 'write'), call('read', { label: 'after' }, 'read-after')]
        : [call('read', { label: 'first' }, 'read-first'), call('read', { label: 'second' }, 'read-second'),
          call('write', {}, 'write'), call('read', { label: 'after' }, 'read-after')];
      const results = await Promise.all(calls);
      return { success: results.every(result => result.success), output: 'settled' };
    });
    const pending = script.execute('mixed-script', {});
    let initial: string[] = [];
    try {
      await started.promise;
      await new Promise<void>(resolve => setImmediate(resolve));
      initial = [...entries];
    } finally { release.resolve(); }
    const result = await pending;
    expect(initial).toEqual(order === 'write first' ? ['write'] : ['first', 'second']);
    expect(entries).toEqual(order === 'write first' ? ['write', 'after'] : ['first', 'second', 'write', 'after']);
    expect(result.isError).toBe(false);
  });

  it('waits for the complete write finalizer before admitting a following read', async () => {
    const entered = held<void>(); const release = held<void>();
    const write = definition('write'); const read = definition('read');
    const prepare = vi.fn(async (_tool: ToolDefinition, args: Record<string, unknown>) => args);
    const call = createGatedNestedToolExecutor({ tools: new Map([[write.name, write], [read.name, read]]),
      hooks: { afterToolCall: async ({ call }) => {
        if (call.name === 'write') { entered.resolve(); await release.promise; }
        return undefined;
      } }, prepare, execute: async () => ({ output: 'actual effect' }) }, undefined);
    const pendingWrite = call('write', {}, 'write');
    await entered.promise;
    const pendingRead = call('read', {}, 'read');
    let beforeRelease: string[] = [];
    try {
      await new Promise<void>(resolve => setImmediate(resolve));
      beforeRelease = prepare.mock.calls.map(([tool]) => tool.name);
    } finally { release.resolve(); }
    const results = await Promise.all([pendingWrite, pendingRead]);
    expect(beforeRelease).toEqual(['write']);
    expect(prepare.mock.calls.map(([tool]) => tool.name)).toEqual(['write', 'read']);
    expect(results.every(result => result.success)).toBe(true);
  });

  it.each(['accepted', 'revoked'] as const)('retains real approval and post-hook facts for a %s nested result', async outcome => {
    let revoked = false;
    const events: Array<{ eventName: string; toolName?: string }> = [];
    let captured: ToolExecutionResult | undefined;
    const target: ToolDefinition = { ...definition('write', async () => ({ success: true, output: 'actual effect',
      metadata: { receipt: 'executed-once' } })), resultAdmission: () => revoked ? 'Original result authority retired.' : undefined };
    const approval = vi.fn(async (prompt: { id: string }) => ({ promptId: prompt.id, decision: 'allow-once' as const, respondedAt: 1 }));
    const hooks = { dispatch: async (payload: { eventName: string; toolName?: string }) => {
      events.push(payload);
      if (payload.eventName === 'PostToolUse') {
        revoked = outcome === 'revoked';
        return { decision: 'allow', feedback: 'Verification recorded.' };
      }
      return { decision: 'allow' };
    } } as unknown as HookDispatcher;
    const script = bridge([target], async call => {
      captured = await call('write', { path: 'nested-output.txt', content: 'new' }, 'approved-nested');
      return { success: true, output: 'inspected nested outcome' };
    }, { permissionScope: 'ask', escalationPromptHandler: approval, hooks });
    expect((await script.execute('outer-script', {})).isError).toBe(false);
    expect(approval).toHaveBeenCalledTimes(1);
    expect(events.map(event => event.eventName)).toEqual(['PermissionRequest', 'PreToolUse', 'PostToolUse']);
    expect(captured?.metadata).toEqual({ receipt: 'executed-once', approval: { operation: 'write', decision: 'allow-once' } });
    expect(captured?.success).toBe(outcome === 'accepted');
    expect(captured?.output ?? captured?.error).toContain('actual effect');
    expect(captured?.output ?? captured?.error).toContain('Verification recorded.');
    if (outcome === 'revoked') expect(captured?.error).toContain('Original result authority retired.');
  });
});

describe('nested result publication', () => {
  it('cannot clear an actual execution failure with post-hook isError:false', async () => {
    const result = await callWithResult(definition('read'), { output: 'actual execution failure', isError: true,
      metadata: { receipt: 'failed-effect' } }, { afterToolCall: async () => ({ output: 'safe failure projection', isError: false }) })
      ('read', {}, 'failed-nested');
    expect(result).toEqual({ success: false, error: 'safe failure projection', metadata: { receipt: 'failed-effect' } });
  });

  it('carries images into the post hook and merges its metadata when feedback is appended', async () => {
    const raw: AgentToolResult = { output: 'Image source observed.', isError: false, images: [image],
      metadata: { receipt: 'source-receipt', same: 'source', outputNotice: 'Source retained.' } };
    let observed: AgentToolResult | undefined;
    const result = await callWithResult(definition('read'), raw, { afterToolCall: async ({ result }) => {
      observed = result;
      return { output: result.output + '\nVerification retained.', metadata: { same: 'hook', verification: 'observed' } };
    } })('read', {}, 'image-nested');
    expect(observed).toEqual(raw);
    expect(result.images).toEqual([image]);
    expect(result.metadata).toEqual({ receipt: 'source-receipt', same: 'hook', verification: 'observed',
      outputNotice: 'Source retained.\nVerification retained.' });
    expect(result.output).toBe('Image source observed.\nVerification retained.');
  });

  it('does not publish old images or notices after a hook replaces their output', async () => {
    const result = await callWithResult(definition('read'), { output: 'Original media text', isError: false,
      images: [image], metadata: { receipt: 'original', outputNotice: 'Original media notice' } },
    { afterToolCall: async () => ({ output: 'Redacted replacement', metadata: { replacement: true } }) })
      ('read', {}, 'replacement-nested');
    expect(result.success).toBe(true); expect(result.output).toBe('Redacted replacement');
    expect(result.images).toBeUndefined();
    expect(result.metadata).toEqual({ receipt: 'original', replacement: true });
  });

  it.each(['execution', 'post hook'] as const)('preserves termination from the %s result owner', async owner => {
    const result = await callWithResult(definition('read'), { output: 'Captured completion', isError: false,
      ...(owner === 'execution' ? { terminate: true } : {}) },
    owner === 'post hook' ? { afterToolCall: async () => ({ terminate: true }) } : {})('read', {}, 'terminal-nested');
    expect(result).toMatchObject({ success: true, output: 'Captured completion', terminate: true });
  });

  it('rechecks original result admission after the awaited post hook without losing actual effects', async () => {
    const started = held<void>(); const release = held<void>(); let revoked = false;
    const target: ToolDefinition = { ...definition('read'), resultAdmission: () => revoked ? 'Original result retired.' : undefined };
    const call = callWithResult(target, { output: 'Actual completed observation.', isError: false,
      metadata: { receipt: 'completed-effect' } }, { afterToolCall: async () => {
      started.resolve(); await release.promise; return undefined;
    } });
    const pending = call('read', {}, 'retired-result');
    await started.promise; revoked = true; release.resolve();
    const result = await pending;
    expect(result.success).toBe(false);
    expect(result.error ?? result.output).toContain('Actual completed observation.');
    expect(result.error ?? result.output).toContain('Original result retired.');
    expect(result.metadata).toEqual({ receipt: 'completed-effect' });
  });

  it('preserves completed output, metadata and media when the post hook fails', async () => {
    const result = await callWithResult(definition('read'), { output: 'Actual completed observation.', isError: false,
      images: [image], metadata: { receipt: 'completed-effect' } },
    { afterToolCall: async () => { throw new Error('Verification observer failed.'); } })('read', {}, 'failed-hook').catch(() => undefined);
    expect(result?.success).toBe(false);
    expect(result?.error ?? result?.output).toContain('Actual completed observation.');
    expect(result?.error ?? result?.output).toContain('Verification observer failed.');
    expect(result?.metadata?.receipt).toBe('completed-effect');
    expect(result?.images).toEqual([image]);
  });
});
