import { describe, expect, it, vi } from 'vitest';
import { toolsPicker } from './tools.js';
import { opensPicker, pickerFor, type PickerHost } from './registry.js';
import { runToolsCommand } from '../../../core/commands/toolsCommandRuntime.js';
import { reportText } from '../../../core/commands/report/projection.js';
import { renderReport } from '../../../presentation/tui/report/renderer.js';
import { stripAnsi } from '../../../presentation/tui/text/ansi.js';
import { toolReport, toolSummary } from '../../../core/commands/tools/report.js';
import { OverlayHost } from '../overlay.js';

const fixture = () => ({ name: 'mcp__notes__Read', description: 'Read a note.\nReturns its content.',
  argsSchema: { type: 'object', properties: { id: { type: 'string', description: 'The note identifier.' } }, required: ['id'] },
  mcpAnnotations: { readOnlyHint: true }, execute: vi.fn(async () => ({ success: true })) });

describe('tool inspection', () => {
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
});
