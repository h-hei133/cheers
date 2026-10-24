import { describe, expect, it, vi } from 'vitest';
import { toolsPicker } from './tools.js';
import { opensPicker, pickerFor, type PickerHost } from './registry.js';
import { runToolsCommand } from '../../../core/commands/toolsCommandRuntime.js';
import { reportText } from '../../../core/commands/report/projection.js';
import { renderReport } from '../../../presentation/tui/report/renderer.js';
import { stripAnsi } from '../../../presentation/tui/text/ansi.js';
import { toolReport, toolSummary } from '../../../core/commands/tools/report.js';
import { OverlayHost } from '../overlay.js';
import { ShellCommandRuntime } from '../../../core/shell/command.js';

const fixture = () => ({ name: 'mcp__notes__Read', description: 'Read a note.\nReturns its content.',
  argsSchema: { type: 'object', properties: { id: { type: 'string', description: 'The note identifier.' } }, required: ['id'] },
  mcpAnnotations: { readOnlyHint: true }, execute: vi.fn(async () => ({ success: true })) });

describe('tool inspection', () => {
  it('withholds picker metadata after final admission aborts the original signal', async () => {
    const original = new AbortController(), description = vi.fn(() => 'Read metadata'); let checks = 0;
    const item = { ...fixture(), get description() { return description(); } };
    const picker = toolsPicker({ cwd: '/fixture', signal: original.signal,
      getToolPool: async () => new Map([[item.name, item]]),
      admission: () => { if (++checks === 2) original.abort(); return undefined; },
    });
    await expect(picker.load()).rejects.toMatchObject({ name: 'AbortError' });
    expect(description).not.toHaveBeenCalled(); expect(item.execute).not.toHaveBeenCalled();
  });

  it.each(['list', 'named'])('withholds direct tool metadata after final admission cancels %s', async mode => {
    const args = mode === 'list' ? [] : ['mcp__notes__Read'];
    const controller = new AbortController(), description = vi.fn(() => 'Read metadata'); let checks = 0;
    const item = { ...fixture(), get description() { return description(); } };
    await expect(runToolsCommand(args, { cwd: '/fixture', signal: controller.signal,
      getToolPool: async () => new Map([[item.name, item]]),
      admission: () => { if (++checks === 2) controller.abort(); return undefined; },
    })).rejects.toMatchObject({ name: 'AbortError' });
    expect(checks).toBe(2); expect(description).not.toHaveBeenCalled(); expect(item.execute).not.toHaveBeenCalled();
  });

  it('keeps original tool cancellation inside the registered command owner', async () => {
    const original = new AbortController(), commands = new ShellCommandRuntime();
    await expect(runToolsCommand([], { cwd: '/fixture', signal: original.signal,
      runCancellable: operation => commands.run(operation),
      getToolPool: async signal => {
        expect(commands.current).toBeDefined(); expect(signal).not.toBe(original.signal);
        original.abort(); return new Map();
      },
    })).rejects.toMatchObject({ name: 'AbortError' });
    expect(commands.current).toBeUndefined();
  });

  it('withholds the tool list when endpoint configuration cancels inspection', async () => {
    const controller = new AbortController(), item = fixture();
    const read = vi.fn(() => { controller.abort(); return { config: {} as never, catalog: [] }; });
    await expect(runToolsCommand([], { cwd: '/fixture', signal: controller.signal,
      getToolPool: async () => new Map([[item.name, item]]), readConfiguration: read,
    })).rejects.toMatchObject({ name: 'AbortError' });
    expect(read).toHaveBeenCalledOnce(); expect(item.execute).not.toHaveBeenCalled();
  });

  it('forwards the picker load signal to the tool-pool owner', async () => {
    const controller = new AbortController();
    const tool = fixture();
    const getToolPool = vi.fn(async (signal?: AbortSignal) => {
      expect(signal).toBe(controller.signal);
      return new Map([[tool.name, tool]]);
    });
    const picker = toolsPicker({ cwd: '/fixture', getToolPool });
    await picker.load(controller.signal);
    expect(getToolPool).toHaveBeenCalledOnce();
  });

  it('combines accepted inspection with the original cancellation signal', async () => {
    const controller = new AbortController();
    const getToolPool = vi.fn(async (signal?: AbortSignal) => {
      expect(signal).not.toBe(controller.signal);
      await new Promise((_resolve, reject) => signal!.addEventListener('abort', () => reject(signal!.reason), { once: true }));
      return new Map();
    });
    const picker = toolsPicker({ cwd: '/fixture', signal: controller.signal, getToolPool });
    const pending = picker.apply(['fixture']);
    await vi.waitFor(() => expect(getToolPool).toHaveBeenCalledOnce());
    controller.abort();
    await expect(pending).resolves.toBeUndefined();
    expect(picker.isCurrent?.()).toBe(false);
  });

  it('forwards command cancellation before and during direct tool discovery', async () => {
    const controller = new AbortController();
    const getToolPool = vi.fn(async (signal?: AbortSignal) => {
      await new Promise((_resolve, reject) => signal!.addEventListener('abort', () => reject(signal!.reason), { once: true }));
      return new Map();
    });
    const pending = runToolsCommand([], { cwd: '/fixture', signal: controller.signal, getToolPool });
    await vi.waitFor(() => expect(getToolPool).toHaveBeenCalledOnce());
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('routes only bare commands to the picker and never executes a selected tool', async () => {
    const tool = fixture(); const pool = new Map([[tool.name, tool]]);
    const getToolPool = vi.fn(async () => pool); const context = { cwd: '/fixture', getToolPool };
    const picker = pickerFor('/tools', { commandContext: context } as PickerHost)!;
    expect(opensPicker('/tools')).toBe(true); expect(opensPicker('/tools read')).toBe(false);
    expect(await picker.load()).toEqual([{ id: tool.name, label: tool.name, detail: 'Read a note.', note: 'Plan: allowed' }]);
    const result = await picker.apply([tool.name]);
    expect(result?.report).toEqual((await runToolsCommand([tool.name], context)).report);
    expect(result).not.toHaveProperty('draft'); expect(tool.execute).not.toHaveBeenCalled();
    expect(getToolPool).toHaveBeenCalledTimes(3);
  });

  it('rechecks exact identity and uses newly published metadata', async () => {
    const tool = fixture(); const pool = new Map([[tool.name, tool]]);
    const picker = toolsPicker({ cwd: '/fixture', getToolPool: async () => pool });
    await picker.load(); pool.set(tool.name, { ...tool, description: 'Updated metadata.' });
    expect((await picker.apply([tool.name]))?.report?.facts.description).toBe('Updated metadata.');
    pool.delete(tool.name); pool.set(tool.name.toLowerCase(), { ...tool, name: tool.name.toLowerCase() });
    expect(await picker.apply([tool.name])).toEqual({ note: 'This tool is no longer available. Reopen /tools to refresh.' });
    expect(tool.execute).not.toHaveBeenCalled();
  });

  it('does not case-fold a direct tool identity', async () => {
    const tool = { ...fixture(), name: 'mcp__notes__read' };
    const result = await runToolsCommand(['MCP__NOTES__READ'], {
      cwd: '/fixture',
      getToolPool: async () => new Map([[tool.name, tool]]),
    });
    expect(result.output).toContain('No tool named');
    expect(result.output).not.toContain('Read a note');
  });

  it('distinguishes catalog failure from an empty inventory without exposing exception bodies', async () => {
    const getToolPool = vi.fn().mockRejectedValueOnce(new Error('PRIVATE_RESPONSE_BODY')).mockResolvedValueOnce(new Map());
    const picker = toolsPicker({ cwd: '/fixture', getToolPool });
    const overlay = new OverlayHost(() => {});
    try {
      overlay.open(picker);
      await vi.waitFor(() => expect(stripAnsi(overlay.render(100, 24).join('\n'))).toContain('Tool catalog unavailable. Reopen /tools to retry.'));
      expect(stripAnsi(overlay.render(100, 24).join('\n'))).not.toContain('PRIVATE_RESPONSE_BODY');
      overlay.open(picker);
      await vi.waitFor(() => expect(stripAnsi(overlay.render(100, 24).join('\n'))).toContain('No matching tools'));
    } finally { overlay.close(); }
    getToolPool.mockRejectedValueOnce(new Error('PRIVATE_RESPONSE_BODY'));
    expect(await picker.apply(['read'])).toEqual({ note: 'Tool catalog unavailable. Reopen /tools to retry.' });
  });

  it('retains safe immutable metadata and required arguments in narrow detail reports', () => {
    const tool = fixture(); tool.description += '\x1b[31m';
    const report = toolReport(tool); const original = reportText(report);
    tool.argsSchema.required.length = 0; tool.description = 'mutated';
    expect(report.facts).toMatchObject({ name: tool.name, planMode: 'allowed', permission: 'not-evaluated',
      arguments: [{ name: 'id', type: 'string', required: true, description: 'The note identifier.' }] });
    expect(Object.isFrozen(report.facts.arguments)).toBe(true);
    expect(reportText(report)).toBe(original); expect(original).not.toContain('\x1b');
    expect(JSON.stringify(report)).not.toContain('execute');
    const narrow = stripAnsi(renderReport(report, 36).join('\n'));
    expect(narrow).toContain('Argument: id'); expect(narrow).toContain('Required: yes');
    expect(original).toContain("Eligible tools still require the session's permissions and approval.");
    expect(toolSummary('Match a pattern (e.g. *.ts). More details.')).toBe('Match a pattern (e.g. *.ts).');
    expect(toolSummary('a'.repeat(200))).toHaveLength(110);
  });

  it('keeps exact tool identity while redacting list and detail projections before truncation', async () => {
    const item = { ...fixture(), name: 'api_key=synthetic-\x1b[31msensitive-name', description: `${'x'.repeat(100)} sk-\x1b[31msynthetic-sensitive-description` };
    const picker = toolsPicker({ cwd: '/fixture', getToolPool: async () => new Map([[item.name, item]]) });
    const [option] = await picker.load();
    expect(option!.id).toBe(item.name);
    expect(JSON.stringify({ label: option!.label, detail: option!.detail })).not.toContain('synthetic-sensitive');
    expect(option!.detail).not.toContain('sk-synt');
    const result = await picker.apply([item.name]);
    expect(JSON.stringify(result)).not.toContain('synthetic-sensitive'); expect(item.execute).not.toHaveBeenCalled();
  });

  it.each(['load', 'apply', 'failure'] as const)('rejects stale owner metadata during %s without exposing a late note or report', async phase => {
    let stale = false, release!: () => void;
    const item = fixture(), pool = new Map([[item.name, item]]);
    const getToolPool = vi.fn(async () => pool);
    const context = { cwd: '/fixture', admission: () => stale ? 'original binding changed' : undefined, getToolPool };
    const picker = toolsPicker(context);
    await picker.load();
    getToolPool.mockImplementationOnce(async () => {
      await new Promise<void>(resolve => { release = resolve; });
      if (phase === 'failure') throw new Error('PRIVATE_RESPONSE_BODY');
      return pool;
    });
    if (phase === 'load') {
      const loading = picker.load(); await vi.waitFor(() => expect(release).toBeTypeOf('function'));
      stale = true; release(); await expect(loading).rejects.toThrow('original binding changed');
    } else {
      const result = picker.apply([item.name]); await vi.waitFor(() => expect(release).toBeTypeOf('function'));
      stale = true; release(); expect(await result).toBeUndefined();
    }
    expect(picker.isCurrent?.()).toBe(false);
    expect(picker.status?.()).toContain('changed');
    const reads = getToolPool.mock.calls.length;
    await expect(picker.load()).rejects.toThrow('original binding changed');
    await expect(runToolsCommand([], context)).rejects.toThrow('original binding changed');
    expect(getToolPool).toHaveBeenCalledTimes(reads);
    expect(item.execute).not.toHaveBeenCalled();
  });
});
