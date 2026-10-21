import { expect, it } from 'vitest';
import { crashesReport, logsReport } from './report.js';
import { reportText } from '../report/projection.js';

it('redacts all log display and facts fields and preserves partial-source evidence', () => {
  const report = logsReport({ status: 'partial', filesInspected: 2, unreadableFiles: 1, entries: [{
    timestamp: '2026-10-21T00:00:00.000Z', level: 'error', component: 'runtime\x1b[31m',
    message: 'Authorization: Bearer sk-synthetic-should-never-appear', traceId: 'trace', spanId: 'span',
    fields: { requestId: 'request', toolCallId: 'tool', durationMs: 7 },
  }] }, '/synthetic');
  expect(reportText(report)).toContain('Status: partial');
  expect(JSON.stringify(report)).not.toContain('sk-synthetic-should-never-appear');
  expect(JSON.stringify(report)).not.toContain('\x1b');
  expect(report.facts).toMatchObject({ status: 'partial', filesInspected: 2, unreadableFiles: 1,
    records: [{ traceId: 'trace', spanId: 'span', requestId: 'request', toolId: 'tool', durationMs: 7 }] });
});

it('shows only the latest retained crash messages and keeps invalid records and redaction visible', () => {
  const report = crashesReport({ status: 'partial', invalidRecords: 2, records: Array.from({ length: 8 }, (_, i) => ({
    timestamp: `${i}`, kind: 'uncaught-exception' as const, cwd: '/private',
    message: `crash-${i} Authorization: Bearer sk-synthetic-secret`, stack: 'RAW STACK NEVER PROJECTED',
  })) }, '/synthetic');
  expect(report.facts).toMatchObject({ status: 'partial', observedRecords: 8, invalidRecords: 2 });
  expect(report.facts.records).toHaveLength(5);
  expect(reportText(report)).toContain('Showing 5 of 8');
  expect(JSON.stringify(report)).not.toContain('crash-0');
  expect(JSON.stringify(report)).not.toContain('sk-synthetic-secret');
  expect(JSON.stringify(report)).not.toContain('RAW STACK');
});
