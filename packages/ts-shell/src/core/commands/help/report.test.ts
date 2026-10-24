import { expect, it, vi } from 'vitest';
import { guideRows, helpReport } from './report.js';
import { reportText } from '../report/projection.js';
import { readReport } from '../report/codec.js';
import * as metadata from '../report/metadata.js';

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

it('bounds the help projection and reports omitted command rows', () => {
  const commands = Array.from({ length: 250 }, (_, index) => ({
    name: `command-${String(index).padStart(3, '0')}`,
    aliases: [],
    invocations: [],
    group: 'workflow' as const,
    summary: `Command ${index}`,
    supportsNonInteractive: true,
  }));
  const report = helpReport(commands, process.cwd());
  expect(report.facts).toMatchObject({ count: 250, total: 250, shown: 200, omitted: 50, coverage: 'partial' });
  expect(reportText(report)).toContain('50 commands omitted');
});

it('projects only the report window when one command has many named invocations', () => {
  const project = vi.spyOn(metadata, 'reportMetadata');
  try {
    const command = { name: 'fixture', group: 'workflow' as const, summary: 'Fixture command',
      invocations: Array.from({ length: 1000 }, (_, index) => ({ name: `named-${index}`, summary: `Named command ${index}` })) };
    const report = helpReport([command], '/guide-workspace');
    expect(report.facts).toMatchObject({ total: 1001, shown: 200, omitted: 801, coverage: 'partial' });
    expect(reportText(report)).toContain('/named-198');
    expect(reportText(report)).not.toContain('/named-199');
    expect(reportText(report)).toContain('801 commands omitted');
    // Each retained row projects its visible label and detail once. Omitted
    // rows must never enter metadata canonicalization/redaction.
    expect(project).toHaveBeenCalledTimes(400);
    expect(guideRows([command], '/guide-workspace')).toHaveLength(1001);
  } finally { project.mockRestore(); }
});

it('shares the row window across commands without projecting later metadata', () => {
  const project = vi.spyOn(metadata, 'reportMetadata');
  try {
    const commands = ['first', 'second'].map(name => ({ name, group: 'workflow' as const, summary: name,
      invocations: Array.from({ length: 150 }, (_, index) => ({ name: `${name}-${index}`, summary: `${name} command ${index}` })) }));
    const report = helpReport([...commands, { name: 'last', group: 'workflow', summary: 'Never projected' }], '/guide-workspace');
    expect(report.facts).toMatchObject({ total: 303, shown: 200, omitted: 103, coverage: 'partial' });
    const text = reportText(report);
    expect(text).toContain('/second-47'); expect(text).not.toContain('/second-48');
    expect(text).not.toContain('Never projected');
    expect(project).toHaveBeenCalledTimes(400);
  } finally { project.mockRestore(); }
});
