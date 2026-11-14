import { describe, expect, it, vi } from 'vitest';
import { runExtensionFactory, type ExtensionAPI, type ExtensionHostBridge } from './inProcessLoader.js';
import { resolveUiHost, type ExtensionUiHost } from './ui.js';

describe('extension UI ownership', () => {
  it.each(['select', 'confirm', 'input', 'editor'] as const)('refuses a pending %s answer after captured admission changes', async method => {
    let refusal: string | undefined;
    let answer!: (value: string | boolean) => void;
    const waiting = () => new Promise<string | boolean>(resolve => { answer = resolve; });
    const host: ExtensionUiHost = { select: () => waiting() as Promise<string>,
      confirm: () => waiting() as Promise<boolean>, input: () => waiting() as Promise<string>,
      editor: () => waiting() as Promise<string> };
    const source = vi.fn(() => ({ host, admission: () => refusal }));
    const ui = resolveUiHost(source);
    const pending = method === 'select' ? ui.select('Value', ['answer'])
      : method === 'confirm' ? ui.confirm('Value', 'Continue?') : ui[method]('Value');
    await vi.waitFor(() => expect(answer).toBeTypeOf('function'));
    refusal = 'Captured owner revoked.';
    answer(method === 'confirm' ? true : 'answer');
    expect(await pending).toBe(method === 'confirm' ? false : undefined);
    expect(source).toHaveBeenCalledTimes(1);
  });

  it('resolves a host bound after initialization and keeps a pending call on its original surface', async () => {
    let ui: ExtensionUiHost | undefined;
    const host: ExtensionHostBridge = { get ui() { return ui; } };
    let api!: ExtensionAPI;
    const loaded = await runExtensionFactory({ workspaceRoot: process.cwd(), host, factory: value => {
      api = value;
      value.registerTool({ name: 'dialog', description: 'Ask', argsSchema: { type: 'object' }, execute: async () => {
        const answer = await value.ui.input('Value');
        value.ui.setEditorText(answer ?? 'cancelled');
        return { success: true, output: answer };
      } });
    } });
    await expect(api.ui.input('Before UI')).rejects.toThrow('unavailable');
    let answer!: (value: string) => void;
    const originalEdit = vi.fn(), replacementEdit = vi.fn();
    ui = { input: () => new Promise(resolve => { answer = resolve; }), setEditorText: originalEdit };
    const pending = loaded.tools[0]!.execute({}, { taskId: 'one', workspaceRoot: process.cwd() });
    await vi.waitFor(() => expect(answer).toBeTypeOf('function'));
    ui = { input: async () => 'second', setEditorText: replacementEdit };
    answer('first');
    expect(await pending).toMatchObject({ output: 'first' });
    expect(originalEdit).toHaveBeenCalledWith('first');
    expect(replacementEdit).not.toHaveBeenCalled();
  });

  it.each(['timeout', 'cancel'] as const)('cancels the host dialog when initialization ends by %s', async mode => {
    const controller = new AbortController();
    let dialogSignal: AbortSignal | undefined;
    const pending = runExtensionFactory({ workspaceRoot: process.cwd(), signal: controller.signal,
      initializationTimeoutMs: mode === 'timeout' ? 25 : 1000,
      host: { ui: { confirm: (_title, _message, options) => { dialogSignal = options?.signal; return new Promise(() => {}); } } },
      factory: async api => { await api.ui.confirm('Initialize', 'Continue?'); },
    });
    const rejected = expect(pending).rejects.toThrow(mode === 'timeout' ? 'timed out' : 'cancelled');
    await vi.waitFor(() => expect(dialogSignal).toBeDefined(), { interval: 1 });
    if (mode === 'cancel') controller.abort();
    await rejected;
    expect(dialogSignal!.aborted).toBe(true);
  });

  it('cancels a tool dialog independently and observes a host rejection after cancellation', async () => {
    let rejectHost!: (error: Error) => void;
    const changed = vi.fn();
    const loaded = await runExtensionFactory({ workspaceRoot: process.cwd(),
      host: { ui: { input: () => new Promise((_resolve, reject) => { rejectHost = reject; }), setEditorText: changed } },
      factory: api => api.registerTool({ name: 'ask', description: 'Ask', argsSchema: { type: 'object' }, execute: async () => {
        const answer = await api.ui.input('Value');
        api.ui.setEditorText('late');
        return { success: true, output: answer ?? 'cancelled' };
      } }),
    });
    const controller = new AbortController();
    const pending = loaded.tools[0]!.execute({}, { workspaceRoot: process.cwd(), taskId: 'one', abortSignal: controller.signal });
    await vi.waitFor(() => expect(rejectHost).toBeTypeOf('function'));
    controller.abort();
    expect(await pending).toMatchObject({ output: 'cancelled' });
    rejectHost(new Error('late host failure'));
    await Promise.resolve();
    expect(changed).not.toHaveBeenCalled();
  });
});
