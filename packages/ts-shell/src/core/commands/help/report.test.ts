import { expect, it, vi } from 'vitest';
import { helpReport } from './report.js';
import { reportText } from '../report/projection.js';
import { readReport } from '../report/codec.js';

it('keeps safe guide facts detached from raw identity and executable callbacks', () => {
  const execute = vi.fn();
  const command = { name: 'sk-synthetic-sensitive-command', aliases: ['guide-alias'], group: 'workflow' as const,
    summary: 'password=synthetic-sensitive-summary', argumentHint: 'file:///guide-workspace/sk-%C2%9B31msynthetic-sensitive-path', execute };
  const report = helpReport([command], '/guide-workspace');
  expect(JSON.stringify(report)).not.toContain('synthetic-sensitive');
  expect(report.facts).toMatchObject({ count: 1, commands: [{ invocation: '/[secret-redacted]', draftAvailable: false }] });
  expect(Object.isFrozen(report.facts.commands)).toBe(true);
  const before = JSON.stringify(report); command.summary = 'A later description';
  expect(JSON.stringify(report)).toBe(before); expect(execute).not.toHaveBeenCalled();
  expect(readReport(JSON.parse(JSON.stringify(report)))).toEqual(report);
  expect(reportText(report)).toContain('Keys');
});
